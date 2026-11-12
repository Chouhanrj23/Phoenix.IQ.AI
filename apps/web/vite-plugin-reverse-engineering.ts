// Local endpoints for the Modules page's "upload inputs, then Generate BRD" flow.
// They run inside the Vite dev server (no separate backend to start) and only
// touch the repository's own inputs/ and .phoenix-workspace/ folders.
//
//   GET    /api/re/inputs?project=                       list uploaded files + repo link
//   PUT    /api/re/inputs?project=&kind=&module=&name=   save one file (raw body)
//   DELETE /api/re/inputs?project=&kind=&module=&name=   remove one file
//   PUT    /api/re/repo?project=                         set/clear the optional git repo link ({ url })
//   POST   /api/re/generate?project=                     start the pipeline (one run at a time)
//   GET    /api/re/status?project=                       progress of the current/last run
import { spawn, type ChildProcess } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KINDS = new Set([
  'brd',
  'code',
  'screenshots',
  'logs',
  'technical-documents',
  'tickets',
  'data-models',
  'database',
  'email',
  'telemetrics',
]);
const MAX_UPLOAD = 25 * 1024 * 1024;
const running = new Map<string, ChildProcess>();

const inputsDir = (project: string) => join(ROOT, 'inputs', project);
const statusFile = (project: string) =>
  join(ROOT, '.phoenix-workspace', 'reverse-engineering', project, 'status.json');

function send(res: ServerResponse, code: number, body: unknown): void {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        fail(new Error(`file is larger than ${Math.round(limit / 1024 / 1024)} MB`));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

/** Validated query parameters; throws on anything that could escape the inputs folder. */
function params(url: URL, need: ('project' | 'kind' | 'module' | 'name')[]) {
  const project = url.searchParams.get('project') ?? '';
  const kind = url.searchParams.get('kind') ?? '';
  const module = url.searchParams.get('module') ?? '';
  const name = url.searchParams.get('name') ?? '';
  if (need.includes('project') && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(project))
    throw new Error('invalid project');
  if (need.includes('kind') && !KINDS.has(kind)) throw new Error('invalid kind');
  if (need.includes('module') && !/^module-\d{1,2}$/.test(module))
    throw new Error('invalid module');
  if (
    need.includes('name') &&
    (!name || name.length > 180 || /[\\/:*?"<>|]/.test(name) || name.startsWith('.'))
  ) {
    throw new Error('invalid file name');
  }
  return { project, kind, module, name };
}

function listInputs(project: string) {
  const dir = inputsDir(project);
  const files: { kind: string; module: string; name: string; size: number }[] = [];
  if (existsSync(dir)) {
    for (const kind of readdirSync(dir)) {
      const kindDir = join(dir, kind);
      if (!KINDS.has(kind) || !statSync(kindDir).isDirectory()) continue;
      for (const module of readdirSync(kindDir)) {
        const modDir = join(kindDir, module);
        if (!statSync(modDir).isDirectory()) continue;
        for (const name of readdirSync(modDir))
          files.push({ kind, module, name, size: statSync(join(modDir, name)).size });
      }
    }
  }
  const repoFile = join(dir, 'repo.txt');
  return { files, repoUrl: existsSync(repoFile) ? readFileSync(repoFile, 'utf8').trim() : '' };
}

function startRun(project: string, server: ViteDevServer): void {
  const child = spawn(
    process.execPath,
    [
      '--env-file-if-exists=.env',
      '--env-file-if-exists=apps/api/.env',
      'scripts/reverse-engineer/run.ts',
      '--project',
      project,
    ],
    { cwd: ROOT, stdio: 'ignore', windowsHide: true },
  );
  running.set(project, child);
  child.on('exit', () => {
    running.delete(project);
    // The run writes a new report the app imports; make every open page load it.
    server.moduleGraph.invalidateAll();
    server.ws.send({ type: 'full-reload' });
  });
}

export function reverseEngineeringApi(): Plugin {
  return {
    name: 'phoenix-reverse-engineering-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/re/')) return next();
        const url = new URL(req.url, 'http://localhost');
        try {
          if (url.pathname === '/api/re/inputs' && req.method === 'GET') {
            const { project } = params(url, ['project']);
            return send(res, 200, listInputs(project));
          }
          if (url.pathname === '/api/re/inputs' && req.method === 'PUT') {
            const { project, kind, module, name } = params(url, [
              'project',
              'kind',
              'module',
              'name',
            ]);
            const body = await readBody(req, MAX_UPLOAD);
            const dir = join(inputsDir(project), kind, module);
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, name), body);
            return send(res, 200, listInputs(project));
          }
          if (url.pathname === '/api/re/inputs' && req.method === 'DELETE') {
            const { project, kind, module, name } = params(url, [
              'project',
              'kind',
              'module',
              'name',
            ]);
            rmSync(join(inputsDir(project), kind, module, name), { force: true });
            return send(res, 200, listInputs(project));
          }
          if (url.pathname === '/api/re/repo' && req.method === 'PUT') {
            const { project } = params(url, ['project']);
            const { url: repo } = JSON.parse(
              (await readBody(req, 10_000)).toString('utf8') || '{}',
            ) as { url?: string };
            const value = (repo ?? '').trim();
            if (value && !/^https:\/\/[\w.-]+\/[\w./-]+$/.test(value))
              throw new Error('repository link must be an https:// git URL');
            mkdirSync(inputsDir(project), { recursive: true });
            if (value) writeFileSync(join(inputsDir(project), 'repo.txt'), value);
            else rmSync(join(inputsDir(project), 'repo.txt'), { force: true });
            return send(res, 200, listInputs(project));
          }
          if (url.pathname === '/api/re/generate' && req.method === 'POST') {
            const { project } = params(url, ['project']);
            if (running.has(project))
              return send(res, 409, { error: 'A run is already in progress for this project.' });
            startRun(project, server);
            return send(res, 202, { started: true });
          }
          if (url.pathname === '/api/re/status' && req.method === 'GET') {
            const { project } = params(url, ['project']);
            const file = statusFile(project);
            if (!existsSync(file)) return send(res, 200, { state: 'idle' });
            const status = JSON.parse(readFileSync(file, 'utf8')) as { state: string };
            // A "running" status with no live process means the run was interrupted.
            if (status.state === 'running' && !running.has(project)) status.state = 'interrupted';
            return send(res, 200, status);
          }
          return send(res, 404, { error: 'not found' });
        } catch (err) {
          return send(res, 400, { error: (err as Error).message });
        }
      });
    },
  };
}
