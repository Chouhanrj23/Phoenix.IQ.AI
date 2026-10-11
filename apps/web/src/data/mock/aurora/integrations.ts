import type { Integration } from '../../types.js';
import { conf, meta, prov } from '../helpers.js';

export const integrations: Integration[] = [
  {
    id: 'int-meridian-pay',
    name: 'Meridian Pay',
    counterpart: 'External payment processor',
    direction: 'outbound',
    protocol: 'REST/HTTPS (synchronous)',
    dataExchanged: 'Card token, amount, currency, order reference → authorization/capture result',
    metadata: meta(
      [
        prov(
          'repo://aurora-commerce/services/payments-adapter',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('high', 0.9),
    ),
  },
  {
    id: 'int-riskshield',
    name: 'RiskShield ML API',
    counterpart: 'Third-party fraud scoring service',
    direction: 'outbound',
    protocol: 'REST/HTTPS (synchronous)',
    dataExchanged: 'Order + device signals → numeric risk score',
    metadata: meta(
      [prov('logs://gateway/2026-06', 'log', 'inference-engine', 5)],
      conf(
        'medium',
        0.6,
        'Only observed via gateway logs; no integration spec on file for request/response schema.',
      ),
    ),
  },
  {
    id: 'int-warehouse-3pl',
    name: 'Warehouse & 3PL System',
    counterpart: 'External logistics provider',
    direction: 'bidirectional',
    protocol: 'REST/HTTPS + nightly SFTP batch',
    dataExchanged: 'Outbound: shipment requests. Inbound: stock levels, tracking events.',
    metadata: meta(
      [prov('integration-spec://warehouse-3pl-v2', 'data-model', 'extraction-engine', 20)],
      conf('high', 0.88),
    ),
  },
  {
    id: 'int-legacy-erp',
    name: 'Legacy ERP',
    counterpart: 'Internal finance & inventory system of record',
    direction: 'outbound',
    protocol: 'Nightly batch file (flat-file export)',
    dataExchanged: 'Confirmed orders and inventory adjustments',
    metadata: meta(
      [
        prov(
          'repo://aurora-commerce/services/erp-connector',
          'source-code',
          'extraction-engine',
          2,
        ),
        prov('ticket://JIRA-4821', 'ticket', 'inference-engine', 45),
      ],
      conf(
        'low',
        0.4,
        'Integration is active in code; a ticket proposes deprecating it with no evidence it happened.',
      ),
    ),
  },
  {
    id: 'int-notify-provider',
    name: 'Email / SMS Provider',
    counterpart: 'Transactional messaging provider',
    direction: 'outbound',
    protocol: 'REST/HTTPS (synchronous)',
    dataExchanged: 'Order/shipment/refund events → rendered email or SMS',
    metadata: meta(
      [
        prov(
          'repo://aurora-commerce/services/notifications',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('high', 0.89),
    ),
  },
];
