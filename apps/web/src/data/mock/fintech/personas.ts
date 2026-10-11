import type { Journey, Persona } from '../../types.js';
import { conf, meta, prov } from '../helpers.js';

export const personas: Persona[] = [
  {
    id: 'persona-everyday-saver',
    name: 'Everyday Saver',
    role: 'Customer',
    goals: ['Move money between accounts quickly', 'Track spending without visiting a branch'],
    painPoints: [
      'ACH transfers occasionally take longer than the app suggests',
      'Dispute status is not clearly surfaced after filing',
    ],
    metadata: meta(
      [prov('docs/personas.md', 'business-doc', 'inference-engine', 14)],
      conf(
        'medium',
        0.63,
        'Persona synthesised from a personas doc plus patterns in support tickets; not verified with real users.',
      ),
    ),
  },
  {
    id: 'persona-new-applicant',
    name: 'New Applicant',
    role: 'Customer',
    goals: [
      'Trust that the app is legitimate before sharing ID documents',
      'Get an account activated quickly',
    ],
    painPoints: [
      'Identity verification sometimes fails with no clear reason given',
      'Unclear how long account activation will take',
    ],
    metadata: meta(
      [prov('docs/personas.md', 'business-doc', 'inference-engine', 14)],
      conf('medium', 0.58),
    ),
  },
  {
    id: 'persona-compliance-analyst',
    name: 'Compliance / Support Analyst',
    role: 'Internal — Compliance & Support',
    goals: [
      'Resolve disputes in a single interaction',
      'Explain a compliance hold confidently to the customer',
    ],
    painPoints: [
      'No visibility into why an applicant was flagged by fraud/AML screening',
      'Bureau feed migration status is unclear, making credit decisions hard to explain',
    ],
    metadata: meta(
      [prov('repo://nimbus-financial/apps/ops-console', 'source-code', 'inference-engine', 5)],
      conf(
        'medium',
        0.6,
        'Inferred from ops console capabilities and support-ticket language; no formal persona doc for internal users.',
      ),
    ),
  },
];

export const journeys: Journey[] = [
  {
    id: 'journey-apply-to-active',
    name: 'Apply to Active Account',
    personaId: 'persona-new-applicant',
    description:
      'From starting an application through an activated, funded account — the primary acquisition journey.',
    flowIds: ['flow-account-opening'],
    metadata: meta(
      [prov('repo://nimbus-financial/apps/banking-app', 'source-code', 'inference-engine', 5)],
      conf('high', 0.83),
    ),
  },
  {
    id: 'journey-file-dispute',
    name: 'File a Transaction Dispute',
    personaId: 'persona-compliance-analyst',
    description:
      'A compliance analyst validates, opens a case for, and resolves a disputed transaction on behalf of a customer.',
    flowIds: ['flow-transaction-dispute'],
    metadata: meta(
      [prov('repo://nimbus-financial/apps/ops-console', 'source-code', 'inference-engine', 5)],
      conf('medium', 0.64),
    ),
  },
  {
    id: 'journey-first-transfer-trust',
    name: 'First Transfer & Trust Building',
    personaId: 'persona-everyday-saver',
    description:
      'A newly activated customer sends their first transfer — shares the underlying account-opening flow but with different friction points around trust.',
    flowIds: ['flow-account-opening'],
    metadata: meta(
      [prov('docs/personas.md', 'business-doc', 'inference-engine', 14)],
      conf(
        'low',
        0.4,
        'Journey framing is inferred from persona pain points, not directly observed in analytics.',
      ),
    ),
  },
];
