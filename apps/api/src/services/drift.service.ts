import type { DriftAlert, DriftRun } from '@phoenix-ai/shared';
import { driftAlerts, driftHistory } from '../data/seed.js';

export function getDriftAlerts(): DriftAlert[] {
  return driftAlerts;
}

export function getDriftHistory(): DriftRun[] {
  return driftHistory;
}
