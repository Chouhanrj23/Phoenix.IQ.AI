import type { DeploymentNode } from '@phoenix-ai/shared';
import { deploymentNodes } from '../data/seed.js';

export function getDeploymentTopology(): DeploymentNode[] {
  return deploymentNodes;
}
