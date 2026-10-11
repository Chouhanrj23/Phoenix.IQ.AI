import type { Integration } from '../../types.js';
import { conf, meta, prov } from '../helpers.js';

export const integrations: Integration[] = [
  {
    id: 'int-ledger-one',
    name: 'Ledger One Core Banking',
    counterpart: 'External core banking ledger of record',
    direction: 'bidirectional',
    protocol: 'REST/HTTPS (synchronous) + nightly reconciliation batch',
    dataExchanged:
      'Outbound: account/posting requests. Inbound: balance confirmations, reconciliation reports.',
    metadata: meta(
      [
        prov(
          'repo://nimbus-financial/services/ledger-adapter',
          'source-code',
          'extraction-engine',
          3,
        ),
      ],
      conf('high', 0.89),
    ),
  },
  {
    id: 'int-cardflex',
    name: 'CardFlex Issuing Network',
    counterpart: 'External card issuing/processing network',
    direction: 'outbound',
    protocol: 'REST/HTTPS (synchronous)',
    dataExchanged:
      'Card creation requests, spend authorization decisions → issued card / auth result',
    metadata: meta(
      [
        prov(
          'repo://nimbus-financial/services/card-issuing',
          'source-code',
          'extraction-engine',
          3,
        ),
      ],
      conf('high', 0.91),
    ),
  },
  {
    id: 'int-sentinel-identity',
    name: 'Sentinel Identity',
    counterpart: 'Third-party KYC/identity verification vendor',
    direction: 'outbound',
    protocol: 'REST/HTTPS (synchronous)',
    dataExchanged: 'Applicant identity + document images → verification result',
    metadata: meta(
      [prov('logs://gateway/2026-06', 'log', 'inference-engine', 6)],
      conf(
        'medium',
        0.6,
        'Only observed via gateway logs; no integration spec on file for request/response schema.',
      ),
    ),
  },
  {
    id: 'int-payrail-ach',
    name: 'PayRail ACH Network',
    counterpart: 'External ACH payment rail',
    direction: 'bidirectional',
    protocol: 'NACHA batch file (SFTP) + REST status webhook',
    dataExchanged:
      'Outbound: ACH transfer batches. Inbound: settlement confirmations, returns/NOCs.',
    metadata: meta(
      [prov('integration-spec://payrail-ach-v3', 'data-model', 'extraction-engine', 25)],
      conf('high', 0.87),
    ),
  },
  {
    id: 'int-notify-provider',
    name: 'Email / SMS / Push Provider',
    counterpart: 'Transactional messaging provider',
    direction: 'outbound',
    protocol: 'REST/HTTPS (synchronous)',
    dataExchanged: 'Account/transaction/dispute events → rendered email, SMS, or push notification',
    metadata: meta(
      [
        prov(
          'repo://nimbus-financial/services/notifications',
          'source-code',
          'extraction-engine',
          3,
        ),
      ],
      conf('high', 0.88),
    ),
  },
];
