// Reads what the user uploaded on the Modules page for a project:
//
//   inputs/<project>/<kind>/<moduleId>/<file>     kind = an upload card id (brd, screenshots, logs, ...)
//   inputs/<project>/repo.txt                     optional git repository URL
//
// Nothing else is read: the run analyses exactly these inputs. Text and code
// are read as text, .docx is unpacked with the system `tar`, screenshots are
// returned as images, and anything that cannot be read is reported back.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import type { ReInputBrd } from '../../apps/web/src/reverse-engineering/types.ts';
import type { EvidenceFile } from './evidence.ts';

export interface UploadedImage {
  path: string;
  moduleId: string;
  mimeType: string;
  base64: string;
}

export interface Uploads {
  files: EvidenceFile[];
  images: UploadedImage[];
  brd: ReInputBrd | null;
  repoUrl: string | null;
  tree: string[];
  skipped: { path: string; reason: string }[];
  characters: number;
}

/** Upload card id -> evidence category the model sees. */
const KIND_CATEGORY: Record<string, string> = {
  brd: 'business-doc (initial BRD)',
  code: 'source-code',
  logs: 'log',
  'technical-documents': 'technical-doc',
  tickets: 'ticket',
  'data-models': 'data-model',
  database: 'database',
  email: 'email-notification',
  telemetrics: 'telemetry',
};

const TEXT_EXT = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.html',
  '.htm',
  '.json',
  '.csv',
  '.log',
  '.xml',
  '.yaml',
  '.yml',
  '.sql',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.java',
  '.cs',
  '.go',
  '.kt',
  '.rb',
  '.php',
  '.properties',
  '.conf',
  '.eml',
]);
const IMAGE_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};
const PER_FILE_CHARS = 40_000;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|w:p)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Text of a .docx (a zip): word/document.xml extracted with the system tar (bsdtar on Windows/macOS). */
function docxText(path: string): string {
  const xml = execFileSync('tar', ['-xOf', path, 'word/document.xml'], {
    encoding: 'utf8',
    maxBuffer: 50_000_000,
  });
  return htmlToText(xml);
}

function readText(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === '.docx') return docxText(path);
  const raw = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  return ext === '.html' || ext === '.htm' ? htmlToText(raw) : raw;
}

export function collectUploads(inputsDir: string): Uploads {
  const files: EvidenceFile[] = [];
  const images: UploadedImage[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const brdParts: { source: string; text: string }[] = [];
  let characters = 0;

  const all = walk(inputsDir).sort();
  for (const full of all) {
    const rel = relative(inputsDir, full).split(sep).join('/');
    if (rel === 'repo.txt') continue;
    const [kind = 'other', moduleId = 'module-1'] = rel.split('/');
    const ext = extname(full).toLowerCase();

    if (IMAGE_EXT[ext]) {
      if (statSync(full).size > 6_000_000) {
        skipped.push({ path: rel, reason: 'image larger than 6 MB' });
        continue;
      }
      images.push({
        path: rel,
        moduleId,
        mimeType: IMAGE_EXT[ext]!,
        base64: readFileSync(full).toString('base64'),
      });
      continue;
    }
    if (!TEXT_EXT.has(ext) && ext !== '.docx') {
      skipped.push({
        path: rel,
        reason:
          ext === '.pdf'
            ? 'PDF text cannot be read yet: upload it as .docx, .md or .txt'
            : `${ext || 'this file type'} cannot be read as text`,
      });
      continue;
    }
    let text: string;
    try {
      text = readText(full).trim();
    } catch (err) {
      skipped.push({
        path: rel,
        reason: `could not read: ${(err as Error).message.split('\n')[0]}`,
      });
      continue;
    }
    if (!text) {
      skipped.push({ path: rel, reason: 'file is empty' });
      continue;
    }
    if (kind === 'brd') brdParts.push({ source: rel, text });
    const truncated = text.length > PER_FILE_CHARS;
    const content = truncated ? text.slice(0, PER_FILE_CHARS) : text;
    characters += content.length;
    files.push({
      path: rel,
      category: `${KIND_CATEGORY[kind] ?? kind}, module ${moduleId}`,
      content,
      truncated,
    });
  }

  const repoFile = join(inputsDir, 'repo.txt');
  const repoUrl = existsSync(repoFile) ? readFileSync(repoFile, 'utf8').trim() || null : null;

  const brd: ReInputBrd | null = brdParts.length
    ? {
        source: brdParts
          .map(
            (b) =>
              `inputs/${relative(join(inputsDir, '..'), inputsDir).split(sep).join('/')}/${b.source}`,
          )
          .join(', '),
        title: (
          /^#\s+(.+)$/m.exec(brdParts[0]!.text)?.[1] ??
          brdParts[0]!.text.split('\n')[0] ??
          'Initial BRD'
        )
          .trim()
          .slice(0, 120),
        text: brdParts
          .map((b) => (brdParts.length > 1 ? `### From ${b.source}\n${b.text}` : b.text))
          .join('\n\n'),
      }
    : null;

  return {
    files,
    images,
    brd,
    repoUrl,
    tree: all.map((f) => relative(inputsDir, f).split(sep).join('/')),
    skipped,
    characters,
  };
}
