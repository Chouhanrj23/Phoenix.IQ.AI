// Stage 0 -- ingestion. Clones the target repository and builds the evidence
// pack the model reads: source, schema, configuration, deployment manifests,
// docs, UI screenshots, and two catalogues mined deterministically from the
// code (log events and telemetry signals). Nothing here calls a model.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

export interface EvidenceFile {
  path: string;
  category: string;
  content: string;
  truncated: boolean;
}

export interface Screenshot {
  path: string;
  mimeType: string;
  base64: string;
}

export interface CatalogueEntry {
  path: string;
  line: number;
  text: string;
}

export interface EvidencePack {
  repoUrl: string;
  commit: string;
  root: string;
  tree: string[];
  files: EvidenceFile[];
  screenshots: Screenshot[];
  logEvents: CatalogueEntry[];
  telemetry: CatalogueEntry[];
  characters: number;
}

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'vendor',
  'target',
  'build',
  'dist',
  '.venv',
  '__pycache__',
  '.mvn',
  'tests',
  'test',
  'iac',
  'releasing',
]);

// Ordered by how much business meaning a category carries; the budget is
// spent in this order, so docs and data models are never crowded out by code.
const CATEGORIES: { name: string; match: (p: string) => boolean; maxChars: number }[] = [
  {
    name: 'readme',
    match: (p) => /^(src\/[^/]+\/([^/]+\/)?)?README\.md$/i.test(p),
    maxChars: 12_000,
  },
  {
    name: 'business-doc',
    match: (p) => /^docs\/(development|environments|troubleshooting)\.md$/i.test(p),
    maxChars: 5_000,
  },
  {
    name: 'data-model',
    match: (p) => /\.sql$/i.test(p) || /initdb\/.*\.sh$/.test(p),
    maxChars: 12_000,
  },
  {
    name: 'deployment',
    match: (p) => /^kubernetes-manifests\/.*\.ya?ml$/i.test(p) || /docker-compose\.ya?ml$/i.test(p),
    maxChars: 5_000,
  },
  {
    name: 'telemetry-config',
    match: (p) => /^extras\/(metrics-dashboard|prometheus)\/[^/]*\.(md|json)$/i.test(p),
    maxChars: 5_000,
  },
  {
    name: 'source-code',
    match: (p) => /\.(py|java|go|ts|js|cs|kt)$/i.test(p) && !/static\/.*\.min\.js$/.test(p),
    maxChars: 40_000,
  },
  { name: 'ui-template', match: (p) => /templates\/.*\.html$/i.test(p), maxChars: 25_000 },
  {
    name: 'configuration',
    match: (p) => /(logging\.conf|application\.(properties|ya?ml))$/i.test(p),
    maxChars: 4_000,
  },
];

// Product screenshots and the architecture diagram; vendor-console captures
// (service-mesh UIs etc. under extras/) carry no business meaning.
const IMAGE_DIRS = /^(docs\/img\/|extras\/metrics-dashboard\/)/i;
const SCREEN_NAME = /(login|signup|transactions|home|dashboard|account|payment|deposit|screen|ui)/i;

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function cloneOrUpdate(repoUrl: string, dest: string): string {
  if (existsSync(join(dest, '.git'))) {
    git(['fetch', '--depth', '1', 'origin'], dest);
    git(['reset', '--hard', 'FETCH_HEAD'], dest);
  } else {
    mkdirSync(dest, { recursive: true });
    git(['clone', '--depth', '1', repoUrl, dest]);
  }
  return git(['rev-parse', 'HEAD'], dest);
}

function walk(root: string, dir = root, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(root, full, out);
    } else {
      out.push(relative(root, full).split(sep).join('/'));
    }
  }
  return out;
}

const LICENSE_LINE =
  /(Copyright \d{4}|Licensed under the Apache|apache\.org\/licenses|distributed under the License|WITHOUT WARRANTIES|limitations under the License|you may not use this file|obtain a copy of the License|express or implied|See the License for|Unless required by applicable law|^\s*(#|\/\/|\*|\/\*\*?|\*\/)\s*$)/;

/**
 * Prefixes each line with its original line number (so the model can cite
 * "path:line"), then drops blank lines and licence-header boilerplate. The
 * numbers stay those of the file on disk.
 */
function numbered(content: string): string {
  return content
    .split('\n')
    .map((line, i) => ({ line: line.replace(/\s+$/, ''), n: i + 1 }))
    .filter(({ line }) => line.trim() !== '' && !LICENSE_LINE.test(line))
    .map(({ line, n }) => `${n}|${line}`)
    .join('\n');
}

/** HTML templates: keep structure, text, form fields and template logic; drop styling. */
function compactHtml(content: string): string {
  return content
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '<svg/>')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(class|style|aria-[\w-]+|role|tabindex|data-[\w-]+)="[^"]*"/gi, '');
}

const LOG_CALL =
  /\b(?:LOGGER|logger|log|app\.logger|logging)\s*\.\s*(debug|info|warn|warning|error|critical|fatal)\s*\(\s*(f?["'`].*)$/;
const TELEMETRY =
  /(opentelemetry|OpenTelemetry|micrometer|Micrometer|stackdriver|Stackdriver|tracer|Tracer|MeterRegistry|@Timed|metrics?\.|prometheus|span\b|trace_id|cloudtrace|ENABLE_TRACING|ENABLE_METRICS)/;

export function mineCatalogues(
  root: string,
  paths: string[],
): { logEvents: CatalogueEntry[]; telemetry: CatalogueEntry[] } {
  const logEvents: CatalogueEntry[] = [];
  const telemetry: CatalogueEntry[] = [];
  const seenLog = new Set<string>();
  const seenTel = new Set<string>();
  for (const p of paths) {
    if (!/\.(py|java|go|ts|js|ya?ml|conf|properties|toml)$/i.test(p)) continue;
    const lines = readFileSync(join(root, p), 'utf8').split('\n');
    lines.forEach((raw, i) => {
      const text = raw.trim();
      const log = LOG_CALL.exec(text);
      if (log && /\.(py|java|go|ts|js)$/.test(p)) {
        const key = `${log[1]}:${log[2]}`;
        if (!seenLog.has(key)) {
          seenLog.add(key);
          logEvents.push({ path: p, line: i + 1, text: text.slice(0, 220) });
        }
      } else if (TELEMETRY.test(text) && text.length < 220) {
        const key = text.replace(/\s+/g, ' ');
        if (!seenTel.has(key)) {
          seenTel.add(key);
          telemetry.push({ path: p, line: i + 1, text });
        }
      }
    });
  }
  return { logEvents, telemetry: telemetry.slice(0, 160) };
}

export function buildEvidencePack(
  repoUrl: string,
  root: string,
  commit: string,
  budgetChars = 420_000,
): EvidencePack {
  const all = walk(root).sort();
  const files: EvidenceFile[] = [];
  const hashes = new Set<string>();
  let used = 0;

  for (const cat of CATEGORIES) {
    for (const p of all) {
      if (!cat.match(p) || files.some((f) => f.path === p)) continue;
      // `ledgermonolith` is a single-service re-packaging of the ledger
      // services; including both would double the budget for no new facts.
      if (p.startsWith('src/ledgermonolith/') && cat.name === 'source-code') continue;
      const raw = readFileSync(join(root, p), 'utf8');
      const hash = createHash('sha1')
        .update(raw.replace(/package [\w.]+;/, ''))
        .digest('hex');
      if (hashes.has(hash)) continue; // identical helper copied into several services
      hashes.add(hash);
      const compact =
        cat.name === 'source-code' || cat.name === 'data-model'
          ? numbered(raw)
          : cat.name === 'ui-template'
            ? numbered(compactHtml(raw))
            : raw;
      // Smaller context windows get proportionally smaller per-file caps, so
      // every category is still represented instead of the last ones dropping out.
      const cap = Math.max(3_000, Math.round(cat.maxChars * Math.min(1, budgetChars / 420_000)));
      const truncated = compact.length > cap;
      const content = truncated ? compact.slice(0, cap) : compact;
      if (used + content.length > budgetChars) continue;
      used += content.length;
      files.push({ path: p, category: cat.name, content, truncated });
    }
  }

  const screenshots: Screenshot[] = all
    .filter((p) => /\.(png|jpe?g)$/i.test(p) && IMAGE_DIRS.test(p))
    .filter((p) => SCREEN_NAME.test(p) || /architecture/i.test(p))
    .filter((p) => statSync(join(root, p)).size < 1_500_000)
    .slice(0, 8)
    .map((p) => ({
      path: p,
      mimeType: extname(p).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg',
      base64: readFileSync(join(root, p)).toString('base64'),
    }));

  const { logEvents, telemetry } = mineCatalogues(root, all);

  return {
    repoUrl,
    commit,
    root,
    // Optional add-ons under extras/ are listed by folder only.
    tree: [
      ...new Set(
        all
          .filter((p) => !/\.(png|jpe?g|gif|svg|lock)$/i.test(p) && !/^\.github\//.test(p))
          .map((p) => (p.startsWith('extras/') ? p.split('/').slice(0, 2).join('/') + '/' : p)),
      ),
    ],
    files,
    screenshots,
    logEvents,
    telemetry,
    characters: used,
  };
}

/** The pack rendered as one prompt body. */
export function renderEvidence(pack: EvidencePack, imagesAttached = true): string {
  const parts: string[] = [];
  parts.push(`# Repository ${pack.repoUrl} @ ${pack.commit.slice(0, 12)}`);
  parts.push(`## File tree (${pack.tree.length} files)\n${pack.tree.join('\n')}`);
  parts.push(
    `## Log event catalogue (mined from logger calls; ${pack.logEvents.length} distinct)\n` +
      pack.logEvents.map((e) => `${e.path}:${e.line}  ${e.text}`).join('\n'),
  );
  parts.push(
    `## Telemetry signals (tracing/metrics instrumentation; ${pack.telemetry.length})\n` +
      pack.telemetry.map((e) => `${e.path}:${e.line}  ${e.text}`).join('\n'),
  );
  parts.push(
    (imagesAttached
      ? `## Screenshots attached as images, in this order\n`
      : `## Screenshots in the repository (NOT attached: this model reads text only; infer each screen from its HTML template and the README instead)\n`) +
      pack.screenshots.map((s, i) => `${i + 1}. ${s.path}`).join('\n'),
  );
  for (const f of pack.files) {
    parts.push(
      `===== FILE ${f.path} [${f.category}]${f.truncated ? ' (truncated)' : ''} =====\n${f.content}`,
    );
  }
  return parts.join('\n\n');
}
