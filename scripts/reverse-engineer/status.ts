// Progress of a run, written to <work>/status.json so the web app can show it
// while the run is going (the dev server's /api/re/status reads this file).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface RunStatus {
  state: 'running' | 'done' | 'failed';
  project: string;
  step: number;
  totalSteps: number;
  stepLabel: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  log: string[];
  result?: {
    pdf: boolean;
    traced: number;
    counts: Record<string, number>;
    skipped: { path: string; reason: string }[];
  };
}

export class StatusFile {
  private status: RunStatus;
  private readonly path: string;

  constructor(path: string, project: string, totalSteps: number) {
    this.path = path;
    this.status = {
      state: 'running',
      project,
      step: 0,
      totalSteps,
      stepLabel: 'Starting',
      startedAt: new Date().toISOString(),
      log: [],
    };
    this.flush();
  }

  log(line: string): void {
    console.log(line);
    this.status.log.push(line);
    if (this.status.log.length > 200) this.status.log = this.status.log.slice(-200);
    this.flush();
  }

  step(step: number, label: string): void {
    this.status.step = step;
    this.status.stepLabel = label;
    this.log(`[${step}/${this.status.totalSteps}] ${label}`);
  }

  done(result: RunStatus['result']): void {
    this.status.state = 'done';
    this.status.step = this.status.totalSteps;
    this.status.stepLabel = 'Finished';
    this.status.finishedAt = new Date().toISOString();
    if (result) this.status.result = result;
    this.flush();
  }

  fail(error: string): void {
    this.status.state = 'failed';
    this.status.error = error;
    this.status.finishedAt = new Date().toISOString();
    this.flush();
  }

  private flush(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.status, null, 1));
  }
}
