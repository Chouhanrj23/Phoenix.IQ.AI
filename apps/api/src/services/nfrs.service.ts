import type { NonFunctionalRequirement } from '@phoenix-ai/shared';
import { nonFunctionalRequirements } from '../data/seed.js';

export function getNonFunctionalRequirements(): NonFunctionalRequirement[] {
  return nonFunctionalRequirements;
}
