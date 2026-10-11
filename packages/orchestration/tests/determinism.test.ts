import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createGitRepositoryConnector,
  type SourceRepositoryDescriptor,
} from '@phoenix-ai/ingestion-connectors';
import { createInMemoryReviewDecisionStore, recordReviewDecision } from '@phoenix-ai/review-loop';
import { runPipeline, runReviewCycle, type PipelineRun } from '../src/index.js';

/**
 * P8 -- reproducibility (BR-13, FR-DET-07, FR-ORC-03): the same input and
 * configuration give byte-identical output, on ANY host.
 *
 * "Any host" is the part an in-process rerun cannot see. Ordering that used
 * `localeCompare` followed the host's default collation, which differs by
 * locale: Danish sorts "aa" as "å", after "z"; Danish and Swedish order
 * `Apple`/`apple` and `Öl`/`Zebra` differently from English. Here a second
 * host is emulated by giving `localeCompare` Danish collation for one run,
 * and the outputs are compared byte for byte.
 */

const GENERATED_AT = '2026-10-07T09:00:00.000Z';

function entity(name: string, table: string): string {
  return `package com.example.zoo;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "${table}")
public class ${name} {
  @Id
  private Long id;
  private String name;
}
`;
}

const FILES: Record<string, string> = {
  'pom.xml': '<project><artifactId>zoo</artifactId></project>\n',
  // Names chosen so English and Danish collation disagree on their order.
  'src/main/java/com/example/zoo/Aardvark.java': entity('Aardvark', 'aardvarks'),
  'src/main/java/com/example/zoo/Zebra.java': entity('Zebra', 'zebras'),
  'src/main/java/com/example/zoo/apple/Apple.java': entity('Apple', 'apples').replace(
    'package com.example.zoo;',
    'package com.example.zoo.apple;',
  ),
  'src/main/java/com/example/zoo/ZooController.java': `package com.example.zoo;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/zoo")
public class ZooController {
  @PostMapping("/zebras")
  public Zebra createZebra() { return null; }

  @GetMapping("/aardvarks")
  public Aardvark getAardvark() { return null; }
}
`,
};

let root: string;
let descriptor: SourceRepositoryDescriptor;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'phoenix-determinism-'));
  for (const [path, content] of Object.entries(FILES)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, '..'), { recursive: true });
    writeFileSync(absolute, content, 'utf8');
  }
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@example.invalid',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@example.invalid',
    GIT_AUTHOR_DATE: '2026-09-01T00:00:00+00:00',
    GIT_COMMITTER_DATE: '2026-09-01T00:00:00+00:00',
  };
  for (const args of [
    ['init', '-q', '-b', 'main'],
    ['config', 'core.autocrlf', 'false'],
    ['add', '--all'],
    ['commit', '-q', '-m', 'zoo'],
  ]) {
    execFileSync('git', args, { cwd: root, env });
  }
  descriptor = {
    id: 'repo://example/zoo',
    sourceType: 'source-code',
    label: 'zoo',
    locator: `file://${encodeURI(root.replace(/\\/g, '/'))}`,
    repository: { kind: 'local-directory' },
  };
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function run(): Promise<PipelineRun> {
  return runPipeline({
    systemId: 'zoo',
    generatedAt: GENERATED_AT,
    source: { connector: createGitRepositoryConnector(), descriptor },
  });
}

/** Runs `work` as if on a host whose default collation is `locale`. */
async function onHostWithLocale<T>(locale: string, work: () => Promise<T>): Promise<T> {
  const original = String.prototype.localeCompare;
  const collator = new Intl.Collator(locale);
  String.prototype.localeCompare = function localeCompare(this: string, that: string): number {
    return collator.compare(String(this), that);
  };
  try {
    return await work();
  } finally {
    String.prototype.localeCompare = original;
  }
}

describe('reproducibility across hosts (P8)', () => {
  it('the emulated host really does collate differently — the test is meaningful', () => {
    const names = ['Aardvark', 'Zebra', 'apple', 'Apple'];
    expect([...names].sort(new Intl.Collator('da').compare)).not.toEqual(
      [...names].sort(new Intl.Collator('en').compare),
    );
  });

  it('a Danish-collation host produces byte-identical OKF, graph plan and extraction facts', async () => {
    const here = await run();
    const there = await onHostWithLocale('da', run);
    expect(there.okfYaml).toBe(here.okfYaml);
    expect(there.graphOperations).toEqual(here.graphOperations);
    expect(JSON.stringify(there.extraction)).toBe(JSON.stringify(here.extraction));
    expect(there.redaction.findings).toEqual(here.redaction.findings);
  }, 60_000);

  it('the same holds for a Swedish-collation host', async () => {
    const here = await run();
    const there = await onHostWithLocale('sv', run);
    expect(there.okfYaml).toBe(here.okfYaml);
  }, 60_000);

  it('repeated runs on one host are byte-identical, with every element id stable', async () => {
    const [first, second] = [await run(), await run()];
    expect(second.okfYaml).toBe(first.okfYaml);
    expect(second.bundle.objects.map((o) => o.identity.id)).toEqual(
      first.bundle.objects.map((o) => o.identity.id),
    );
  }, 60_000);

  it('the review cycle regenerates byte-identical output for the same decisions, on any host', async () => {
    const base = await run();
    const zebra = base.bundle.objects.find((o) => o.label === 'Zebra');
    if (zebra === undefined) throw new Error('Zebra missing');
    const store = createInMemoryReviewDecisionStore();
    await recordReviewDecision(store, {
      systemId: 'zoo',
      targetObjectId: zebra.identity.id,
      targetLabel: 'Zebra',
      targetAttribute: 'description',
      decision: 'corrected',
      previousValue: String(zebra.attributes.description),
      correctedValue: 'Maps to table "striped_equids".',
      reviewerId: 'keeper-1',
      decidedAt: '2026-10-07T10:00:00.000Z',
    });
    const decisions = await store.listAll();
    const at = '2026-10-07T11:00:00.000Z';

    const here = await runReviewCycle(base, decisions, { at });
    const again = await runReviewCycle(base, decisions, { at });
    const there = await onHostWithLocale('da', () => runReviewCycle(base, decisions, { at }));
    expect(again.okfYaml).toBe(here.okfYaml);
    expect(there.okfYaml).toBe(here.okfYaml);
    expect(there.graphOperations).toEqual(here.graphOperations);
  }, 60_000);
});
