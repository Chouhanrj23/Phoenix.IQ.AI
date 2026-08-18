# Data Source Tracing: Where domains.data & fullGraph.data Come From

## Quick Answer

```
OverviewPage Component
    ↓
useAsync(() => dataProvider.getDomains(), [])     → domains.data
useAsync(() => dataProvider.getFullGraph(), [])   → fullGraph.data
    ↓
Proxy resolves to mockProviderFor('aurora')
    ↓
Mock provider wraps with 250ms delay
    ↓
Returns data from auroraBundle
    ↓
auroraBundle.domains          ← apps/web/src/data/mock/aurora/fixtures.ts (line 323)
auroraBundle.fullGraph        ← apps/web/src/data/mock/aurora/index.ts (line ~50)
```

---

## Complete Tracing

### Step 1: OverviewPage.tsx Calls useAsync()

**File:** `apps/web/src/pages/OverviewPage.tsx` (lines 49-68)

```typescript
export function OverviewPage(): JSX.Element {
  // ...
  const domains = useAsync(() => dataProvider.getDomains(), []); // ← Triggers data fetch
  const fullGraph = useAsync(() => dataProvider.getFullGraph(), []); // ← Triggers data fetch
  // ...
}
```

### Step 2: dataProvider Proxy Routes the Call

**File:** `apps/web/src/data/index.ts` (lines 42-52)

```typescript
const source = import.meta.env.VITE_DATA_SOURCE ?? 'mock'; // 'mock' by default
let activeCompany = 'aurora'; // Currently selected company

export const dataProvider: OkfDataProvider = new Proxy({} as OkfDataProvider, {
  get(_target, prop: string | symbol) {
    const provider = resolveProvider(); // ← Returns mockProviderFor('aurora')
    return provider[prop as keyof OkfDataProvider];
  },
});
```

When you call `dataProvider.getDomains()`:

1. Proxy intercepts the call
2. Calls `resolveProvider()` → `mockProviderFor('aurora')`
3. Returns `provider.getDomains()`

### Step 3: Mock Provider Wraps With Delay

**File:** `apps/web/src/data/mock/mockProvider.ts` (lines 10-50)

```typescript
function providerFor(bundle: CompanyBundle): OkfDataProvider {
  return {
    // Each method wraps data with 250ms artificial delay
    getDomains: () => delay(bundle.domains), // ← Returns auroraBundle.domains
    getFullGraph: () => delay(bundle.fullGraph), // ← Returns auroraBundle.fullGraph
    // ... other methods
  };
}

// Simulates network latency
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function mockProviderFor(companyId: CompanyId): OkfDataProvider {
  return {
    aurora: providerFor(auroraBundle), // ← For AuroraCommerce
    fintech: providerFor(fintechBundle), // ← For FinTech Corp
  }[companyId];
}
```

### Step 4: Aurora Bundle Assembly

**File:** `apps/web/src/data/mock/aurora/index.ts` (lines 1-60)

```typescript
import { buildFullGraph, type GraphBundle } from '../build-graph.js';
import {
  containerEdges,
  containerNodes,
  contextEdges,
  contextNodes,
  domains, // ← Imported from fixtures.ts
  driftAlerts,
  executionFlows,
  reviewItems,
  systemSummary,
} from './fixtures.js';
import { personas, journeys } from './personas.js';
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
  domains, // ← Passed to buildFullGraph()
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

/** Everything the mock provider needs for the Aurora Commerce demo. */
export const auroraBundle = {
  systemSummary,
  contextNodes,
  contextEdges,
  containerNodes,
  containerEdges,
  domains, // ← SOURCE 1: domains.data comes from here
  executionFlows,
  reviewItems,
  driftAlerts,
  personas,
  journeys,
  epics,
  deploymentNodes,
  nonFunctionalRequirements,
  integrations,
  gapItems,
  driftHistory,
  fullGraph: buildFullGraph(graphBundle), // ← SOURCE 2: fullGraph.data is built here
};
```

---

## SOURCE 1: domains.data

### Location: `apps/web/src/data/mock/aurora/fixtures.ts` (lines 323-418)

```typescript
export const domains: Domain[] = [
  {
    id: 'dom-catalog',
    name: 'Catalog & Pricing',
    description: 'Product listings, categories, and price lists shown in the storefront.',
    metadata: meta(
      [prov('data-model://aurora-schema.sql', 'data-model', 'inference-engine', 3)],
      conf('high', 0.92)
    ),
    aggregates: [
      {
        id: 'agg-product',
        name: 'Product',
        entities: ['Product', 'ProductVariant', 'Category'],
        metadata: meta([prov('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)], conf('high', 0.95))
      },
      {
        id: 'agg-pricelist',
        name: 'PriceList',
        entities: ['PriceList', 'PriceRule'],
        metadata: meta([prov('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)], conf('high', 0.9))
      },
    ],
  },
  {
    id: 'dom-ordering',
    name: 'Ordering',
    description: 'Shopping cart through order placement and lifecycle state.',
    metadata: meta([prov('repo://aurora-commerce/services/checkout', 'source-code', 'inference-engine', 3)], conf('high', 0.91)),
    aggregates: [
      { id: 'agg-cart', name: 'Cart', entities: ['Cart', 'CartLine'], metadata: meta([...], conf('high', 0.93)) },
      { id: 'agg-order', name: 'Order', entities: ['Order', 'OrderLine', 'OrderStatusHistory'], metadata: meta([...], conf('high', 0.96)) },
    ],
  },
  {
    id: 'dom-payments',
    name: 'Payments',
    description: 'Payment authorization, capture, and refund processing via Meridian Pay.',
    metadata: meta([...], conf('medium', 0.6, 'Container technology is disputed; domain boundary itself is high-confidence.')),
    aggregates: [
      { id: 'agg-payment', name: 'Payment', entities: ['Payment', 'PaymentAttempt'], metadata: meta([...], conf('high', 0.88)) },
      { id: 'agg-refund', name: 'Refund', entities: ['Refund'], metadata: meta([...], conf('medium', 0.7)) },
    ],
  },
  {
    id: 'dom-fraud',
    name: 'Fraud & Risk',
    description: 'Risk scoring and case management for suspicious orders.',
    metadata: meta([...], conf('medium', 0.58, 'Decisioning rules beyond the ML score call are not documented in any source.')),
    aggregates: [
      { id: 'agg-riskcase', name: 'RiskCase', entities: ['RiskCase', 'RiskSignal'], metadata: meta([...], conf('medium', 0.6)) },
      { id: 'agg-devicefp', name: 'DeviceFingerprint', entities: ['DeviceFingerprint'], metadata: meta([...], conf('low', 0.35)) },
    ],
  },
  {
    id: 'dom-fulfillment',
    name: 'Fulfillment',
    description: 'Shipment creation and warehouse inventory allocation.',
    metadata: meta([...], conf('high', 0.85)),
    aggregates: [
      { id: 'agg-shipment', name: 'Shipment', entities: ['Shipment', 'ShipmentLine', 'TrackingEvent'], metadata: meta([...], conf('high', 0.88)) },
      { id: 'agg-allocation', name: 'WarehouseAllocation', entities: ['WarehouseAllocation'], metadata: meta([...], conf('high', 0.86)) },
    ],
  },
  {
    id: 'dom-customer',
    name: 'Customer',
    description: 'Customer identity, profile, and loyalty program membership.',
    metadata: meta([...], conf('high', 0.87)),
    aggregates: [
      { id: 'agg-profile', name: 'CustomerProfile', entities: ['CustomerProfile', 'Address'], metadata: meta([...], conf('high', 0.92)) },
      { id: 'agg-loyalty', name: 'LoyaltyAccount', entities: ['LoyaltyAccount', 'LoyaltyLedgerEntry'], metadata: meta([...], conf('low', 0.38)) },
    ],
  },
];
```

### Structure of domains.data

Each domain object contains:

```typescript
{
  id: string;
  name: string;
  description: string;
  metadata: GraphElementMetadata;
  aggregates: Array<{
    id: string;
    name: string;
    entities: string[];
    metadata: GraphElementMetadata;
  }>;
}
```

### How domains.data is Used in Overview Tab

**From OverviewPage.tsx (lines 110-125):**

```typescript
// Compute domain coverage (used in "Domain Coverage" bar chart)
const domainCoverage = useMemo(() => {
  if (!domains.data) return [];

  return domains.data.map((domain) => {
    const row = { name: domain.name }; // ← Use domain name

    for (const level of CONFIDENCE_LEVEL_ORDER) {
      row[level] = 0;
    }

    // Count aggregates by confidence level
    for (const agg of domain.aggregates) {
      // ← Iterate aggregates
      const level = agg.metadata.confidence.level;
      row[level] = (row[level] as number) + 1;
    }

    return row;
  });
}, [domains.data]);

// OUTPUT: [
//   { name: 'Catalog & Pricing', high: 2, medium: 0, low: 0, inferred: 0 },
//   { name: 'Ordering', high: 2, medium: 0, low: 0, inferred: 0 },
//   { name: 'Payments', high: 1, medium: 1, low: 0, inferred: 0 },
//   { name: 'Fraud & Risk', high: 0, medium: 1, low: 1, inferred: 0 },
//   { name: 'Fulfillment', high: 2, medium: 0, low: 0, inferred: 0 },
//   { name: 'Customer', high: 1, medium: 0, low: 1, inferred: 0 },
// ]
```

---

## SOURCE 2: fullGraph.data

### Location: `apps/web/src/data/mock/build-graph.ts` (entire file)

The `fullGraph.data` is **built dynamically** by the `buildFullGraph()` function, not hard-coded.

**From aurora/index.ts:**

```typescript
export const auroraBundle = {
  // ...
  fullGraph: buildFullGraph(graphBundle), // ← Called at bundle assembly time
};
```

**buildFullGraph() function:**

```typescript
export function buildFullGraph(bundle: GraphBundle): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 1️⃣ ADD SYSTEM NODE
  nodes.push({
    id: bundle.systemSummary.id, // 'aurora-commerce'
    label: bundle.systemSummary.name, // 'Aurora Commerce'
    kind: 'System',
    confidenceLevel: 'high',
    detail: {/* dossier data */},
  });

  // 2️⃣ ADD CONTAINER NODES (from bundle.containerNodes)
  for (const c of bundle.containerNodes) {
    nodes.push({
      id: c.id,
      label: c.name,
      kind: 'Container',
      confidenceLevel: c.metadata.confidence.level,
      detail: {/* dossier */},
    });
    // Add edge: system contains container
    edges.push({
      id: `sys-${c.id}`,
      source: bundle.systemSummary.id,
      target: c.id,
      label: 'contains',
    });
  }

  // 3️⃣ ADD CONTAINER EDGES
  for (const e of bundle.containerEdges) {
    edges.push({ id: e.id, source: e.source, target: e.target, label: e.label });
  }

  // 4️⃣ ADD DOMAIN NODES (from bundle.domains)
  for (const d of bundle.domains) {
    // Domain itself
    nodes.push({
      id: d.id,
      label: d.name,
      kind: 'Domain',
      confidenceLevel: d.metadata.confidence.level,
      detail: {/* dossier */},
    });

    // Each aggregate in the domain
    for (const a of d.aggregates) {
      nodes.push({
        id: a.id,
        label: a.name,
        kind: 'Aggregate',
        confidenceLevel: a.metadata.confidence.level,
        detail: {/* dossier */},
      });
      // Add edge: domain contains aggregate
      edges.push({ id: `${d.id}-${a.id}`, source: d.id, target: a.id, label: 'contains' });
    }
  }

  // 5️⃣ ADD PERSONA, JOURNEY, FLOW, EPIC NODES
  for (const p of bundle.personas) {
    nodes.push({
      id: p.id,
      label: p.name,
      kind: 'Persona',
      confidenceLevel: p.metadata.confidence.level,
      detail: {/* dossier */},
    });
  }

  // ... similar for journeys, flows, epics, deployment nodes, nfrs, integrations ...

  return { nodes, edges };
}
```

### What's in fullGraph.data

**Nodes** (142 total for Aurora):

- 1 System node (Aurora Commerce)
- 14+ Container nodes (Storefront, Checkout Service, Order Orchestrator, etc.)
- 6 Domain nodes (Catalog, Ordering, Payments, Fraud, Fulfillment, Customer)
- 12+ Aggregate nodes (Product, Cart, Order, Payment, Refund, etc.)
- 8 Persona nodes (Shopper, Support Agent, etc.)
- 6 Journey nodes
- 12 ExecutionFlow steps
- 10 Epic nodes
- 8 DeploymentNode instances
- 5 NonFunctionalRequirement nodes
- 7 Integration nodes

**Edges** (relationships):

- System contains containers
- System contains domains
- Domains contain aggregates
- Containers connect to other containers
- Personas pursue journeys
- Journeys realize flows
- Flows touch entities
- And many cross-references

### How fullGraph.data is Used in Overview Tab

**From OverviewPage.tsx (lines 85-104):**

```typescript
// Count node kinds for "Elements by Type" bar chart
const elementsByKind = useMemo(() => {
  if (!fullGraph.data) return [];
  const counts = new Map<string, number>();

  // Iterate all nodes in the graph
  for (const node of fullGraph.data.nodes) {
    counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1); // ← Count by kind
  }

  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count);
}, [fullGraph.data]);

// OUTPUT: [
//   { kind: 'Service', count: 12 },       // More than one node has kind='Service'?
//   { kind: 'Event', count: 18 },
//   { kind: 'Actor', count: 8 },
//   { kind: 'API', count: 9 },
//   { kind: 'DataStore', count: 6 },
//   { kind: 'System', count: 3 },
//   ...
// ]
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   OverviewPage Component                        │
│  const domains = useAsync(dataProvider.getDomains(), [])        │
│  const fullGraph = useAsync(dataProvider.getFullGraph(), [])   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│              dataProvider Proxy (apps/web/src/data/index.ts)     │
│         get('getDomains') → resolveProvider().getDomains()      │
│         get('getFullGraph') → resolveProvider().getFullGraph()  │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ↓
┌──────────────────────────────────────────────────────────────────┐
│         mockProviderFor('aurora')  [apps/web/src/data/mock/]   │
│  getDomains: () => delay(auroraBundle.domains, 250ms)           │
│  getFullGraph: () => delay(auroraBundle.fullGraph, 250ms)       │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ↓ (after 250ms delay)
┌──────────────────────────────────────────────────────────────────┐
│        auroraBundle  [apps/web/src/data/mock/aurora/index.ts]  │
│                                                                  │
│  auroraBundle.domains         ← imported from fixtures.ts       │
│  auroraBundle.fullGraph       ← built by buildFullGraph()       │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ├──────────────────────────────────────────┐
                       ↓                                          ↓
          ┌─────────────────────┐              ┌──────────────────────┐
          │   fixtures.ts       │              │  build-graph.ts      │
          │                     │              │                      │
          │ export const        │              │ buildFullGraph()     │
          │ domains: Domain[]   │              │ assembles:           │
          │                     │              │ • Nodes from all     │
          │ [                   │              │   sources            │
          │  Catalog & Pricing  │              │ • Edges connecting   │
          │  Ordering           │              │   them               │
          │  Payments           │              │                      │
          │  Fraud & Risk       │              │ Returns:             │
          │  Fulfillment        │              │ { nodes, edges }     │
          │  Customer           │              │                      │
          │ ]                   │              │ 142 nodes total      │
          └─────────────────────┘              └──────────────────────┘
                       │                                  │
                       └──────────────┬───────────────────┘
                                      ↓
                        useMemo transforms:

                        domainCoverage = domains.data
                          .map(domain => count aggregates by confidence)

                        elementsByKind = fullGraph.data.nodes
                          .map(node => count by node.kind)

                                      ↓
                        Bar charts render with transformed data
```

---

## Summary

| Data               | Source File                                 | Lines   | How It's Created                                                                                                                                                                |
| ------------------ | ------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **domains.data**   | `apps/web/src/data/mock/aurora/fixtures.ts` | 323-418 | **Hard-coded fixture** — Array of 6 Domain objects with aggregates                                                                                                              |
| **fullGraph.data** | `apps/web/src/data/mock/build-graph.ts`     | 1-400+  | **Built dynamically** — buildFullGraph() assembles nodes & edges from multiple sources (containers, domains, personas, journeys, flows, epics, deployments, nfrs, integrations) |

### Key Insight

- **domains.data** = directly from fixtures (simple array of domain definitions)
- **fullGraph.data** = dynamically assembled from the complete bundle using buildFullGraph() function

Both are wrapped in a 250ms delay by the mock provider to simulate network latency.
