import type { SystemSummary } from '@phoenix-ai/shared';
import { systemSummary } from '../data/seed.js';

export function getSystemSummary(): SystemSummary {
  return systemSummary;
}
