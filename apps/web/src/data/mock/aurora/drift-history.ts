import type { DriftRun } from '../../types.js';
import { driftAlerts } from './fixtures.js';

export const driftHistory: DriftRun[] = [
  {
    id: 'run-2026-07-20',
    runDate: '2026-07-20T09:00:00.000Z',
    summary: 'Differential run — 3 changes detected since the previous run.',
    changes: driftAlerts,
  },
  {
    id: 'run-2026-07-06',
    runDate: '2026-07-06T09:00:00.000Z',
    summary: 'Differential run — 2 changes detected since the previous run.',
    changes: [
      {
        id: 'drift-hist-1',
        elementName: 'Checkout Service',
        changeType: 'modified',
        description:
          'New outbound dependency on Fraud Detection Service added directly to the checkout path (previously async via event bus only).',
        detectedAt: '2026-07-06T09:00:00.000Z',
      },
      {
        id: 'drift-hist-2',
        elementName: 'Inventory Service',
        changeType: 'modified',
        description:
          'Schema change: new column added to WarehouseAllocation for partial-reservation support.',
        detectedAt: '2026-07-06T09:00:00.000Z',
      },
    ],
  },
  {
    id: 'run-2026-06-22',
    runDate: '2026-06-22T09:00:00.000Z',
    summary: 'Baseline run — initial ingestion and extraction.',
    changes: [
      {
        id: 'drift-hist-3',
        elementName: 'Aurora Commerce (Dummy Company used for reverse engineering)',
        changeType: 'added',
        description:
          'Baseline established: 142 elements extracted across 6 domains, 11 containers, and 2 execution flows.',
        detectedAt: '2026-06-22T09:00:00.000Z',
      },
    ],
  },
];
