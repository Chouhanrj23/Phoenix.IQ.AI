// Prints the BRD HTML to PDF with a locally installed Chromium browser
// (Chrome or Edge, headless). No npm dependency; set BRD_PDF_BROWSER to a
// browser executable to choose one explicitly.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CANDIDATES = [
  process.env.BRD_PDF_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
].filter((p): p is string => Boolean(p));

export function printPdf(
  htmlPath: string,
  pdfPath: string,
): { ok: true; bytes: number } | { ok: false; reason: string } {
  const browser = CANDIDATES.find((p) => existsSync(p));
  if (!browser) return { ok: false, reason: 'no Chrome or Edge found (set BRD_PDF_BROWSER)' };
  // A throwaway profile, so this works while the user's own browser is open.
  const profile = mkdtempSync(join(tmpdir(), 'phoenix-pdf-'));
  try {
    if (existsSync(pdfPath)) unlinkSync(pdfPath);
    execFileSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${profile}`,
        '--no-pdf-header-footer',
        // Lets the page's diagram script finish rendering before printing.
        '--virtual-time-budget=30000',
        '--run-all-compositor-stages-before-draw',
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: 'ignore', timeout: 180_000 },
    );
    if (!existsSync(pdfPath))
      return { ok: false, reason: `${browser} exited without writing a PDF` };
    return { ok: true, bytes: statSync(pdfPath).size };
  } catch (err) {
    return { ok: false, reason: (err as Error).message.split('\n')[0] ?? 'browser failed' };
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}
