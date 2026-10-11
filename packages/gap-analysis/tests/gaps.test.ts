import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseOkfYaml,
  type CanonicalKnowledgeBundle,
  type OkfDocument,
} from '@phoenix-ai/knowledge-graph';
import { planGaps } from '../src/index.js';

/** P8 -- FR-GAP-01..03 over real committed extraction output. */

const PETCLINIC = parseOkfYaml(
  readFileSync(
    fileURLToPath(
      new URL('../../extraction-engine/samples/spring-petclinic.okf.yaml', import.meta.url),
    ),
    'utf8',
  ),
) as OkfDocument as CanonicalKnowledgeBundle;

describe('coverage per OKF artifact (FR-GAP-01)', () => {
  const report = planGaps(PETCLINIC);
  const level = (id: string) => report.coverage.find((c) => c.artifactId === id)?.coverage;

  it('assesses all eleven artifacts', () => {
    expect(report.coverage).toHaveLength(11);
  });

  it('what the real extraction supports is covered; what it lacks is uncovered', () => {
    expect(level('logical-data-model')).toBe('covered');
    expect(level('integrations-dataflows')).toBe('covered');
    expect(level('deployment')).toBe('uncovered');
    expect(level('screens')).toBe('uncovered');
    expect(report.coverageScore).toBeGreaterThan(0);
    expect(report.coverageScore).toBeLessThan(1);
  });
});

describe('gaps name their missing input, collaboratively (FR-GAP-02/03)', () => {
  const report = planGaps(PETCLINIC, {
    parseFailures: [{ path: 'src/Broken.java', reason: 'syntax' }],
    quarantined: [{ path: 'docs/arch.png', reason: 'binary' }],
    knowledgeRisk: [
      { label: 'Owner', owner: 'author-1', atRisk: true },
      { label: 'Pet', owner: 'author-2', atRisk: false },
    ],
  });
  const gap = (id: string) => report.gaps.find((g) => g.id === id);

  it('every uncovered artifact is a gap that names the specific input needed', () => {
    expect(gap('gap-artifact-deployment')?.missingInputs.join(' ')).toMatch(/Dockerfile/);
    expect(gap('gap-artifact-backlog')?.missingInputs.join(' ')).toMatch(/issue tracker/);
    expect(gap('gap-artifact-logical-data-model')).toBeUndefined();
  });

  it('run facts become gaps naming the exact files', () => {
    expect(gap('gap-unparsed-source')).toMatchObject({
      severity: 'high',
      missingInputs: ['src/Broken.java'],
    });
    expect(gap('gap-quarantined-files')?.missingInputs).toEqual(['docs/arch.png']);
    expect(gap('gap-single-owner-knowledge')?.missingInputs).toEqual(['Owner']);
  });

  it('phrases requests, not findings — no blame vocabulary', () => {
    for (const g of report.gaps) {
      expect(g.suggestedAction).toMatch(
        /could you|could someone|if you have|would let|would make|a short walkthrough|if any/i,
      );
      expect(`${g.description} ${g.suggestedAction}`).not.toMatch(
        /\b(fail(ed|ure)? to|negligen|violation|non-?complian|must)\b/i,
      );
    }
  });

  it('is ordered by severity, deterministically', () => {
    const ranks = report.gaps.map((g) => ['blocking', 'high', 'medium', 'low'].indexOf(g.severity));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(JSON.stringify(planGaps(PETCLINIC))).toBe(JSON.stringify(planGaps(PETCLINIC)));
  });
});

describe('no invented gaps', () => {
  it('an empty run is one blocking gap about the source — not a guess about the system', () => {
    const report = planGaps({
      systemId: 's',
      generatedAt: '2026-10-07T00:00:00.000Z',
      objects: [],
      relationships: [],
    });
    expect(report.gaps[0]).toMatchObject({ id: 'gap-no-observed-knowledge', severity: 'blocking' });
    expect(report.coverageScore).toBe(0);
  });

  it('no run facts means no fact-derived gaps', () => {
    const ids = planGaps(PETCLINIC).gaps.map((g) => g.id);
    expect(ids.filter((id) => !id.startsWith('gap-artifact-'))).toEqual([]);
  });
});
