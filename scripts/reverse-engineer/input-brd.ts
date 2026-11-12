// Reads the initial (simple) BRD the business supplies at the start of a run.
// Markdown, plain text and HTML are read as text. PDF and Word files are not
// parsed here (no extra dependencies); export them to .md or .txt first.
import { readFileSync } from 'node:fs';
import { extname, relative } from 'node:path';
import type { ReInputBrd } from '../../apps/web/src/reverse-engineering/types.ts';

export function readInputBrd(path: string, root: string): ReInputBrd {
  const ext = extname(path).toLowerCase();
  if (!['.md', '.markdown', '.txt', '.html', '.htm'].includes(ext)) {
    throw new Error(
      `Initial BRD ${path}: ${ext} is not supported. Save it as .md or .txt (for a PDF or Word file, copy its text into a .md file).`,
    );
  }
  let text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim();
  if (ext === '.html' || ext === '.htm') {
    text = text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n');
  }
  const heading = /^#\s+(.+)$/m.exec(text)?.[1] ?? text.split('\n')[0] ?? 'Initial BRD';
  return {
    source: relative(root, path).split('\\').join('/'),
    title: heading.trim().slice(0, 120),
    text,
  };
}
