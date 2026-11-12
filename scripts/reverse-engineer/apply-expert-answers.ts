// Merges domain experts' answers (the Modules page questions) into the BRD.
//
//   node scripts/reverse-engineer/apply-expert-answers.ts --project <slug> [--rules-only]
//
// Reads .phoenix-workspace/reverse-engineering/<id>/training/expert-answers.jsonl and
// the final BRD dataset, records each answer against the BRD elements it is about,
// moves answered open questions to "resolved", adds a version-history entry, and
// re-renders the same outputs run.ts writes: the app dataset, BRD.md / .html / .pdf
// and the knowledge graph. With a model configured each answer is also restated as
// requirement text; the expert's own words are always kept alongside.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLlmClient, setLlmLogger, type LlmClient } from './llm.ts';
import { StatusFile } from './status.ts';
import { buildKnowledgeGraph, toCypher } from './assemble.ts';
import { renderBrd } from './brd-markdown.ts';
import { renderBrdHtml } from './brd-html.ts';
import { printPdf } from './pdf.ts';
import type {
  ReExpertInput,
  ReExpertReview,
  ReverseEngineeringReport,
} from '../../apps/web/src/reverse-engineering/types.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const project = arg('project') ?? '';
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(project))
  throw new Error(`--project must be a lowercase slug, got "${project}"`);
const rulesOnly = process.argv.includes('--rules-only');

const work = join(ROOT, '.phoenix-workspace', 'reverse-engineering', project);
const answersPath = join(work, 'training', 'expert-answers.jsonl');
const webOut = join(
  ROOT,
  'apps',
  'web',
  'src',
  'reverse-engineering',
  'reports',
  `${project}.json`,
);
const docsOut = join(ROOT, 'docs', 'reverse-engineering', project);

/** One line of expert-answers.jsonl, as the dev server writes it. */
interface AnswerRecord {
  moduleId: string;
  level: string;
  questionId: string;
  intent: string;
  question: string;
  brdContext: string;
  answer: string;
  answeredBy: string | null;
  answeredAt: string;
  sources: { id: string; label: string }[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Latest answer per question; later lines replace earlier ones for the same question. */
function readAnswers(): AnswerRecord[] {
  const latest = new Map<string, AnswerRecord>();
  for (const line of readFileSync(answersPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as AnswerRecord;
      if (typeof rec.answer === 'string' && rec.answer.trim() && rec.questionId)
        latest.set(`${rec.questionId}|${norm(rec.question)}`, rec);
    } catch {
      // A damaged line is skipped rather than failing the whole update.
    }
  }
  return [...latest.values()];
}

const STATEMENT_SYSTEM = `You turn domain experts' answers into Business Requirements Document text.
For each item, restate the expert's answer as concise requirement text: short sentences in the style "The system shall ..." or "The business requires ...", or a "- " bullet list when the answer lists several points.
Keep every fact, number, role, condition and exception the expert gave. Add nothing they did not say, and do not soften or generalise their limits.
Return JSON: {"statements":[{"questionId": string, "statement": string}]}, one entry per item.`;

async function restate(llm: LlmClient, records: AnswerRecord[]): Promise<Map<string, string>> {
  const raw = (await llm.generateJson({
    system: STATEMENT_SYSTEM,
    prompt: JSON.stringify(
      records.map((r) => ({
        questionId: r.questionId,
        question: r.question,
        whatTheBrdSaid: r.brdContext,
        expertAnswer: r.answer,
      })),
      null,
      1,
    ),
  })) as { statements?: { questionId?: unknown; statement?: unknown }[] };
  const out = new Map<string, string>();
  for (const s of raw?.statements ?? []) {
    if (typeof s.questionId === 'string' && typeof s.statement === 'string' && s.statement.trim())
      out.set(s.questionId, s.statement.trim());
  }
  return out;
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

async function main(): Promise<void> {
  const status = new StatusFile(join(work, 'brd-update-status.json'), project, 3);
  try {
    status.step(1, 'Reading expert answers');
    if (!existsSync(webOut))
      throw new Error('No BRD for this project yet. Generate the BRD first.');
    if (!existsSync(answersPath))
      throw new Error('No expert answers yet. Answer the module questions first.');
    const report = JSON.parse(readFileSync(webOut, 'utf8')) as ReverseEngineeringReport;
    const review: ReExpertReview = report.expertReview ?? {
      inputs: [],
      resolvedQuestions: [],
      revisions: [],
    };
    const records = readAnswers();
    const isNew = (rec: AnswerRecord) => {
      const prev = review.inputs.find(
        (i) => i.questionId === rec.questionId && norm(i.question) === norm(rec.question),
      );
      return !prev || prev.answer !== rec.answer.trim();
    };
    const fresh = records.filter(isNew);
    status.log(`${records.length} answers found, ${fresh.length} new or changed.`);
    if (!fresh.length) {
      status.log('The BRD already includes every expert answer; nothing to update.');
      status.done(undefined);
      return;
    }

    status.step(2, 'Turning answers into BRD requirements');
    setLlmLogger((msg) => status.log(msg));
    let llm: LlmClient | null = null;
    if (!rulesOnly) {
      try {
        llm = await createLlmClient(process.env);
      } catch (err) {
        status.log(`Model not available: ${(err as Error).message}`);
      }
    }
    const statements = new Map<string, string>();
    if (llm) {
      status.log(`Using ${llm.provider} (${llm.model}) to restate answers as requirements.`);
      for (const moduleId of [...new Set(fresh.map((r) => r.moduleId))]) {
        try {
          const got = await restate(
            llm,
            fresh.filter((r) => r.moduleId === moduleId),
          );
          got.forEach((v, k) => statements.set(k, v));
        } catch (err) {
          status.log(
            `${moduleId}: model failed (${(err as Error).message}); keeping the answers as written.`,
          );
        }
      }
    } else {
      status.log("No model configured: the experts' answers go into the BRD as written.");
    }

    let resolvedNow = 0;
    for (const rec of fresh) {
      const input: ReExpertInput = {
        questionId: rec.questionId,
        moduleId: rec.moduleId,
        level: rec.level,
        intent: rec.intent,
        question: rec.question,
        brdContext: rec.brdContext,
        answer: rec.answer.trim(),
        statement: statements.get(rec.questionId) ?? rec.answer.trim(),
        answeredBy: rec.answeredBy,
        answeredAt: rec.answeredAt,
        sourceIds: rec.sources.map((s) => s.id),
      };
      const at = review.inputs.findIndex(
        (i) => i.questionId === input.questionId && norm(i.question) === norm(input.question),
      );
      if (at >= 0) review.inputs[at] = input;
      else review.inputs.push(input);

      // An answered BRD open question is no longer open.
      const open = report.brd.openQuestions.findIndex((q) => norm(q) === norm(rec.question));
      const resolved = review.resolvedQuestions.find(
        (q) => norm(q.question) === norm(rec.question),
      );
      if (open >= 0) {
        report.brd.openQuestions.splice(open, 1);
        review.resolvedQuestions.push({
          question: rec.question,
          resolution: input.statement,
          answeredBy: input.answeredBy,
          questionId: input.questionId,
        });
        resolvedNow++;
      } else if (resolved) {
        resolved.resolution = input.statement;
        resolved.answeredBy = input.answeredBy;
      }
    }

    const moduleNames = [...new Set(fresh.map((r) => r.moduleId))].map(
      (id) => report.modules.find((m) => m.id === id)?.name ?? id,
    );
    const experts = [...new Set(fresh.map((r) => r.answeredBy).filter(Boolean))];
    review.revisions.push({
      at: new Date().toISOString(),
      summary:
        `Expert review: ${fresh.length} answer${fresh.length === 1 ? '' : 's'} on ${moduleNames.join(', ')}` +
        (experts.length ? ` from ${experts.join(', ')}` : '') +
        (resolvedNow
          ? `; ${resolvedNow} open question${resolvedNow === 1 ? '' : 's'} resolved`
          : '') +
        (llm ? `; restated by ${llm.model}` : '') +
        '.',
    });
    report.expertReview = review;

    status.step(3, 'Writing the BRD (PDF), knowledge graph and app data');
    const graph = buildKnowledgeGraph(report);
    write(webOut, JSON.stringify(report, null, 1));
    const brdMarkdown = renderBrd(report);
    write(join(docsOut, 'BRD.md'), brdMarkdown);
    write(webOut.replace(/\.json$/, '.brd.md'), brdMarkdown);
    write(join(docsOut, 'knowledge-graph.json'), JSON.stringify(graph, null, 1));
    write(join(docsOut, 'knowledge-graph.cypher'), toCypher(graph, project));
    const htmlPath = join(docsOut, 'BRD.html');
    write(htmlPath, renderBrdHtml(report));
    const pdf = printPdf(htmlPath, join(docsOut, 'BRD.pdf'));
    if (pdf.ok) {
      copyFileSync(join(docsOut, 'BRD.pdf'), webOut.replace(/\.json$/, '.brd.pdf'));
      status.log(`BRD.pdf written (${Math.round(pdf.bytes / 1024)} KB).`);
    } else {
      status.log(`PDF not produced: ${pdf.reason}. BRD.html can be printed to PDF instead.`);
    }
    status.log(
      `BRD updated: ${review.inputs.length} expert answers recorded, ${review.resolvedQuestions.length} open questions resolved.`,
    );
    status.done(undefined);
  } catch (err) {
    status.fail((err as Error).message);
    process.exitCode = 1;
  }
}

await main();
