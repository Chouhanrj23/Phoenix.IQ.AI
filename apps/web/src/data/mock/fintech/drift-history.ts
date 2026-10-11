import type { DriftRun } from '../../types.js';
import { driftAlerts } from './fixtures.js';

export const driftHistory: DriftRun[] = [
  {
    id: 'run-2026-07-21',
    runDate: '2026-07-21T09:00:00.000Z',
    summary: 'Differential run — 4 changes detected since the previous run.',
    changes: driftAlerts,
  },
  {
    id: 'run-2026-07-07',
    runDate: '2026-07-07T09:00:00.000Z',
    summary: 'Differential run — 2 changes detected since the previous run.',
    changes: [
      {
        id: 'drift-hist-1',
        elementName: 'Onboarding & KYC Service',
        changeType: 'modified',
        description:
          'New outbound dependency on Fraud & AML Monitoring Service added directly to the onboarding path (previously async via event bus only).',
        detectedAt: '2026-07-07T09:00:00.000Z',
      },
      {
        id: 'drift-hist-2',
        elementName: 'Payments & Transfers Service',
        changeType: 'modified',
        description:
          'Schema change: new column added to Transfer for split/partial transfer support.',
        detectedAt: '2026-07-07T09:00:00.000Z',
      },
    ],
  },
  {
    id: 'run-2026-06-23',
    runDate: '2026-06-23T09:00:00.000Z',
    summary: 'Baseline run — initial ingestion and extraction.',
    changes: [
      {
        id: 'drift-hist-3',
        elementName: 'Fintech - Banking System (Dummy company used for reverse engineering)',
        changeType: 'added',
        description:
          'Baseline established: 131 elements extracted across 6 domains, 10 containers, and 2 execution flows.',
        detectedAt: '2026-06-23T09:00:00.000Z',
      },
    ],
  },
];
