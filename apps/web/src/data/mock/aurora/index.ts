import { buildFullGraph, type GraphBundle } from '../build-graph.js';
import {
  containerEdges,
  containerNodes,
  contextEdges,
  contextNodes,
  domains,
  driftAlerts,
  executionFlows,
  reviewItems,
  systemSummary,
} from './fixtures.js';
import { personas, journeys } from './personas.js';
import { capabilities } from './capabilities.js';
import { epics } from './epics.js';
import { deploymentNodes } from './deployment.js';
import { nonFunctionalRequirements } from './nfrs.js';
import { integrations } from './integrations.js';
import { gapItems } from './gaps.js';
import { driftHistory } from './drift-history.js';

const graphBundle: GraphBundle = {
  systemSourceUri: 'repo://aurora-commerce',
  systemSummary,
  containerNodes,
  containerEdges,
  domains,
  driftAlerts,
  executionFlows,
  reviewItems,
  personas,
  journeys,
  epics,
  deploymentNodes,
  nonFunctionalRequirements,
  integrations,
  gapItems,
};

/** Everything the mock provider needs for the Aurora Commerce (e-commerce) demo. */
export const auroraBundle = {
  systemSummary,
  contextNodes,
  contextEdges,
  containerNodes,
  containerEdges,
  domains,
  executionFlows,
  reviewItems,
  driftAlerts,
  personas,
  journeys,
  capabilities,
  epics,
  deploymentNodes,
  nonFunctionalRequirements,
  integrations,
  gapItems,
  driftHistory,
  fullGraph: buildFullGraph(graphBundle),
};
