import type { Domain } from '@phoenix-ai/shared';
import { domains } from '../data/seed.js';

export function getDomains(): Domain[] {
  return domains;
}
