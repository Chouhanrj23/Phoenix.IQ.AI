// Phoenix reverse-engineering run.
//
// Project mode (what the web app's "Generate BRD" button runs):
//   pnpm reverse-engineer --project <slug>
//     Analyses ONLY what was uploaded for the project under inputs/<slug>/ (initial BRD,
//     screenshots, logs, data models, telemetry, tickets, documents, code) plus the git
//     repository in inputs/<slug>/repo.txt if one was given. Nothing else is fetched.
//
// Repository mode (analyse a whole public repository directly):
//   pnpm reverse-engineer --repo <git url> --id <slug> [--brd <initial BRD file>]
//
// Common options:
//   --resume              keep every cached stage, even if its input changed
//   --redo brd,backlog    regenerate the named stages
//   --force               ignore all cached stages
//   --assemble-only       rebuild the outputs from cached stages, no model calls
//   --curated <dir>       use hand-written <stage>.json files instead of a model
//
// Outputs:
//   apps/web/src/reverse-engineering/reports/<id>.json   dataset the web app shows
//   docs/reverse-engineering/<id>/BRD.pdf                the enriched BRD (also .html / .md)
//   docs/reverse-engineering/<id>/knowledge-graph.json   graph nodes/edges (+ .cypher for Neo4j)
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEvidencePack,
  cloneOrUpdate,
  mineCatalogues,
  renderEvidence,
  type EvidencePack,
} from './evidence.ts';
import {
  BadJsonError,
  createLlmClient,
  createVisionClients,
  QuotaExhaustedError,
  setLlmLogger,
  type LlmClient,
} from './llm.ts';
import { STAGES, priorContext, systemPrompt } from './stages.ts';
import { assembleReport, buildKnowledgeGraph, toCypher } from './assemble.ts';
import { renderBrd } from './brd-markdown.ts';
import { renderBrdHtml } from './brd-html.ts';
import { printPdf } from './pdf.ts';
import { readInputBrd } from './input-brd.ts';
import { collectUploads } from './uploads.ts';
import { describeScreenshots } from './screens.ts';
import { StatusFile } from './status.ts';
import type { ReInputBrd } from '../../apps/web/src/reverse-engineering/types.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const project = arg('project');
if (project && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(project))
  throw new Error(`--project must be a lowercase slug, got "${project}"`);
const id = project ?? arg('id') ?? 'bank-of-anthos';
const work = join(ROOT, '.phoenix-workspace', 'reverse-engineering', id);
const stageDir = join(work, 'stages');
const webOut = join(ROOT, 'apps', 'web', 'src', 'reverse-engineering', 'reports', `${id}.json`);
const docsOut = join(ROOT, 'docs', 'reverse-engineering', id);
// 0 = ingest, 1 = screenshots, 2-8 = analysis stages, 9 = BRD/PDF/graph.
const status = new StatusFile(join(work, 'status.json'), id, STAGES.length + 3);
const log = (msg: string) => status.log(msg);
setLlmLogger(log);

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const curatedDir = arg('curated');
  const assembleOnly = flag('assemble-only');
  const redo = new Set(
    (arg('redo') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const previousModel = existsSync(join(work, 'model.json'))
    ? (JSON.parse(readFileSync(join(work, 'model.json'), 'utf8')) as {
        provider: string;
        model: string;
      })
    : { provider: 'unknown', model: 'unknown' };

  let llm: LlmClient | null = null;
  if (!curatedDir && !assembleOnly) {
    llm = await createLlmClient(process.env);
    if (!llm)
      throw new Error(
        'No model key found. Add ZAI_API_KEY or GEMINI_API_KEY to .env (repo root or apps/api/.env).',
      );
    log(`model: ${llm.provider} / ${llm.model}${llm.supportsImages ? '' : ' (text only)'}`);
    write(join(work, 'model.json'), JSON.stringify({ provider: llm.provider, model: llm.model }));
  }
  const budget = llm?.evidenceBudgetChars ?? 420_000;

  // Step 0 — ingest -----------------------------------------------------------------
  status.step(
    1,
    project ? `Reading uploaded inputs (inputs/${project})` : 'Cloning the repository',
  );
  let pack: EvidencePack;
  let inputBrd: ReInputBrd | null = null;
  let sourceLabel: string;
  let commit = 'uploads';
  let skipped: { path: string; reason: string }[] = [];
  let screenshotsSeen: string[] = [];
  let uploadImages: Awaited<ReturnType<typeof collectUploads>>['images'] = [];

  if (project) {
    const inputsDir = join(ROOT, 'inputs', project);
    if (!existsSync(inputsDir))
      throw new Error(`Nothing uploaded yet for ${project} (inputs/${project} does not exist).`);
    const up = collectUploads(inputsDir);
    skipped = up.skipped;
    inputBrd = up.brd;
    uploadImages = up.images;
    log(
      `    ${up.files.length} documents, ${up.images.length} screenshots${up.repoUrl ? `, repository ${up.repoUrl}` : ''}; initial BRD: ${up.brd ? `"${up.brd.title}"` : 'none'}`,
    );
    for (const s of up.skipped) log(`    skipped ${s.path}: ${s.reason}`);
    if (!up.files.length && !up.images.length && !up.repoUrl)
      throw new Error(
        'No readable inputs: upload at least a BRD, a screenshot or another document first.',
      );

    const mined = mineCatalogues(
      inputsDir,
      up.tree.filter((p) => !p.startsWith('screenshots/')),
    );
    let repoPack: EvidencePack | null = null;
    if (up.repoUrl) {
      log(`    cloning ${up.repoUrl}...`);
      commit = cloneOrUpdate(up.repoUrl, join(work, 'source'));
      repoPack = buildEvidencePack(
        up.repoUrl,
        join(work, 'source'),
        commit,
        Math.max(60_000, budget - up.characters),
      );
    }
    sourceLabel = up.repoUrl
      ? up.repoUrl.replace(/\.git$/, '')
      : `uploaded inputs (inputs/${project})`;
    pack = {
      repoUrl: sourceLabel,
      commit,
      root: inputsDir,
      tree: [...up.tree.map((p) => `[uploaded] ${p}`), ...(repoPack?.tree ?? [])],
      files: [...up.files, ...(repoPack?.files ?? [])],
      screenshots: [...(repoPack?.screenshots ?? [])],
      logEvents: [...mined.logEvents, ...(repoPack?.logEvents ?? [])],
      telemetry: [...mined.telemetry, ...(repoPack?.telemetry ?? [])],
      characters: up.characters + (repoPack?.characters ?? 0),
    };
  } else {
    const repoUrl = arg('repo') ?? 'https://github.com/GoogleCloudPlatform/bank-of-anthos.git';
    const brdPath = arg('brd') ?? join(ROOT, 'inputs', id, 'initial-brd.md');
    inputBrd = existsSync(brdPath) ? readInputBrd(brdPath, ROOT) : null;
    if (arg('brd') && !inputBrd) throw new Error(`--brd: file not found: ${brdPath}`);
    commit = cloneOrUpdate(repoUrl, join(work, 'source'));
    pack = buildEvidencePack(repoUrl, join(work, 'source'), commit, budget);
    sourceLabel = repoUrl.replace(/\.git$/, '');
    if (llm?.supportsImages) screenshotsSeen = pack.screenshots.map((s) => s.path);
  }

  // Step 1 — screenshots: attached directly for a vision model, otherwise described first.
  status.step(2, 'Reading screenshots');
  if (uploadImages.length) {
    if (llm?.supportsImages) {
      pack.screenshots.push(
        ...uploadImages.map((i) => ({ path: i.path, mimeType: i.mimeType, base64: i.base64 })),
      );
      screenshotsSeen.push(...uploadImages.map((i) => i.path));
      log(`    ${uploadImages.length} screenshots attached to the analysis`);
    } else if (!curatedDir && !assembleOnly) {
      const visionModels = await createVisionClients(process.env);
      if (visionModels.length) {
        const described = await describeScreenshots(
          uploadImages,
          visionModels,
          join(work, 'screens'),
          log,
        );
        pack.files.unshift(...described.files);
        pack.characters += described.files.reduce((n, f) => n + f.content.length, 0);
        screenshotsSeen.push(...described.read);
        skipped.push(...described.failed);
        log(`    ${described.read.length} of ${uploadImages.length} screenshots read`);
      } else {
        log(
          '    no vision model available (set ZAI_API_KEY or GEMINI_API_KEY); screenshots are listed but not read',
        );
        skipped.push(
          ...uploadImages.map((i) => ({ path: i.path, reason: 'no vision model configured' })),
        );
      }
    }
  } else {
    log('    no screenshots uploaded');
  }
  const imagesAttached = Boolean(llm?.supportsImages);
  const evidenceText = renderEvidence(pack, imagesAttached);
  write(join(work, 'evidence-pack.md'), evidenceText);
  log(
    `    evidence: ${pack.files.length} files (${Math.round(pack.characters / 1000)}k chars), ${screenshotsSeen.length} screenshots read, ${pack.logEvents.length} log events, ${pack.telemetry.length} telemetry signals`,
  );

  // Steps 2-8 — analysis stages ------------------------------------------------------
  const outputs: Record<string, unknown> = {};
  const stages: { name: string; status: 'generated' | 'cached'; seconds: number; model: string }[] =
    [];
  const resume = flag('resume');
  for (const [i, stage] of STAGES.entries()) {
    status.step(i + 3, stage.title);
    const system = systemPrompt(stage);
    let prompt = stage.usesEvidencePack ? evidenceText : priorContext(stage, outputs);
    if (stage.name === 'brd' && inputBrd) {
      prompt += `\n\n## Initial BRD supplied by the business (${inputBrd.source})\n${inputBrd.text}`;
    }
    const inputHash = createHash('sha256').update(system).update(prompt).digest('hex').slice(0, 16);
    const cacheFile = join(stageDir, `${stage.name}.json`);
    const forceThis = flag('force') || redo.has(stage.name);

    if (curatedDir) {
      outputs[stage.name] = JSON.parse(
        readFileSync(join(curatedDir, `${stage.name}.json`), 'utf8'),
      );
      stages.push({ name: stage.name, status: 'cached', seconds: 0, model: 'curated' });
      log('    curated');
      continue;
    }
    if (existsSync(cacheFile)) {
      const cached = JSON.parse(readFileSync(cacheFile, 'utf8')) as {
        inputHash: string;
        output: unknown;
        model?: string;
      };
      if (assembleOnly || (!forceThis && (resume || cached.inputHash === inputHash))) {
        outputs[stage.name] = cached.output;
        const model = cached.model ?? previousModel.model;
        stages.push({ name: stage.name, status: 'cached', seconds: 0, model });
        log(`    unchanged since the last run — reused (${model})`);
        continue;
      }
    }
    if (assembleOnly)
      throw new Error(`--assemble-only: stage "${stage.name}" has no cached output yet.`);

    const t0 = Date.now();
    const images = stage.usesEvidencePack && imagesAttached ? pack.screenshots : [];
    const ask = async (p: string): Promise<unknown> => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await llm!.generateJson({ system, prompt: p, images });
        } catch (err) {
          if (!(err instanceof BadJsonError) || attempt >= 2) throw err;
          write(join(stageDir, `${stage.name}.raw-${attempt}.txt`), err.raw);
          log('    reply was not valid JSON; asking again...');
        }
      }
    };
    let out = await ask(prompt);
    let problems = stage.validate(out);
    if (problems.length) {
      log(`    output incomplete (${problems.join('; ')}); asking the model to fix it once...`);
      out = await ask(
        `${prompt}\n\n## Your previous answer was rejected\nProblems: ${problems.join('; ')}\nPrevious answer:\n${JSON.stringify(out)}\n\nReturn the complete corrected JSON.`,
      );
      problems = stage.validate(out);
      if (problems.length)
        log(`    still incomplete, continuing with what was returned: ${problems.join('; ')}`);
    }
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    write(cacheFile, JSON.stringify({ inputHash, model: llm!.model, output: out }, null, 2));
    outputs[stage.name] = out;
    stages.push({ name: stage.name, status: 'generated', seconds, model: llm!.model });
    log(`    done in ${seconds}s`);
  }

  // Step 9 — BRD, PDF, graph ----------------------------------------------------------
  status.step(STAGES.length + 3, 'Writing the BRD (PDF), knowledge graph and app data');
  const report = assembleReport({
    id,
    outputs: outputs as Record<string, any>,
    inputBrd,
    run: {
      mode: curatedDir ? 'curated' : 'llm',
      provider: curatedDir
        ? 'curated'
        : [...new Set(stages.map((x) => providerOf(x.model, llm)))].join(' + '),
      model: curatedDir ? 'n/a' : [...new Set(stages.map((x) => x.model))].join(' + '),
      startedAt,
      finishedAt: new Date().toISOString(),
      sourceRepo: sourceLabel,
      sourceCommit: commit,
      evidence: {
        files: pack.files.length,
        screenshots: screenshotsSeen,
        logEvents: pack.logEvents.length,
        telemetrySignals: pack.telemetry.length,
        characters: pack.characters,
      },
      stages,
    },
  });
  const graph = buildKnowledgeGraph(report);
  write(webOut, JSON.stringify(report, null, 1));
  const brdMarkdown = renderBrd(report);
  write(join(docsOut, 'BRD.md'), brdMarkdown);
  write(webOut.replace(/\.json$/, '.brd.md'), brdMarkdown);
  write(join(docsOut, 'knowledge-graph.json'), JSON.stringify(graph, null, 1));
  write(join(docsOut, 'knowledge-graph.cypher'), toCypher(graph, id));

  const htmlPath = join(docsOut, 'BRD.html');
  write(htmlPath, renderBrdHtml(report));
  const pdfPath = join(docsOut, 'BRD.pdf');
  log('    printing the BRD to PDF...');
  const pdf = printPdf(htmlPath, pdfPath);
  if (pdf.ok) {
    copyFileSync(pdfPath, webOut.replace(/\.json$/, '.brd.pdf'));
    log(`    BRD.pdf written (${Math.round(pdf.bytes / 1024)} KB)`);
  } else {
    log(
      `    PDF not produced: ${pdf.reason}. Open ${htmlPath} in a browser and print to PDF instead.`,
    );
  }

  const stories = report.epics.reduce(
    (n, e) => n + e.features.reduce((k, f) => k + f.stories.length, 0),
    0,
  );
  const counts = {
    domains: report.domains.length,
    entities: report.entities.length,
    activities: report.activities.length,
    flows: report.executionFlows.length,
    personas: report.personas.length,
    journeys: report.journeys.length,
    reports: report.reports.length,
    capabilities: report.capabilities.length,
    epics: report.epics.length,
    stories,
  };
  log(
    `Done. ${Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')}; graph ${graph.nodes.length} nodes / ${graph.edges.length} edges.`,
  );
  if (report.traceability.length) {
    const by = (s: string) => report.traceability.filter((t) => t.status === s).length;
    log(
      `Initial BRD traced: ${report.traceability.length} requirements — ${by('confirmed')} confirmed, ${by('partial')} partial, ${by('not-implemented')} not implemented, ${by('contradicted')} contradicted.`,
    );
  }
  status.done({ pdf: pdf.ok, traced: report.traceability.length, counts, skipped });
}

function providerOf(model: string, llm: LlmClient | null): string {
  if (/gemini/i.test(model)) return 'google-gemini';
  if (/^glm/i.test(model)) return 'z.ai';
  if (/curated|hand-written/i.test(model)) return 'curated';
  return llm?.provider ?? 'unknown';
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  status.fail(message);
  console.error(err instanceof QuotaExhaustedError ? `\n${message}` : err);
  process.exitCode = err instanceof QuotaExhaustedError ? 3 : 1;
});
