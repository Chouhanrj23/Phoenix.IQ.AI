import type { Integration } from '@phoenix-ai/shared';
import { integrations } from '../data/seed.js';

export function getIntegrations(): Integration[] {
  return integrations;
}
