// The analysis stages. Stage 1 reads the full evidence pack (code, schema,
// manifests, docs, screenshots, log/telemetry catalogues) and produces a
// factual inventory; every later stage reasons over that inventory plus the
// earlier stages' output, so the large pack is sent to the model once.
//
// Every element the model returns carries `evidence` ("path:line" strings
// pointing into the pack) and `confidence` (0-1) with `basis`
// ("observed" = read directly from an artifact, "inferred" = reasoned).

export const MODULES = [
  {
    id: 'module-1',
    name: 'Overview',
    hint: 'Cross-cutting platform: identity, login/sign-up, sessions, security, observability, shared services.',
  },
  {
    id: 'module-2',
    name: 'Accounts',
    hint: 'Customer and bank-account lifecycle, profile, balances, contacts/payees.',
  },
  {
    id: 'module-3',
    name: 'Payments and Transfer',
    hint: 'Sending money between accounts, external transfers, validation, transaction history.',
  },
  {
    id: 'module-4',
    name: 'Deposits',
    hint: 'Money coming in: deposits from external accounts, crediting balances.',
  },
  { id: 'module-5', name: 'Cards', hint: 'Debit/credit card issuing, controls, authorisations.' },
  {
    id: 'module-6',
    name: 'Loans',
    hint: 'Loan origination, servicing, repayments, credit decisioning.',
  },
] as const;

export interface Stage {
  name: string;
  title: string;
  /** Stage names whose output this stage reads. */
  needs: string[];
  usesEvidencePack: boolean;
  instructions: string;
  shape: string;
  /** Returns problems; an empty list means the output is acceptable. */
  validate: (out: any) => string[];
}

const COMMON_RULES = `
Rules for every element you return:
- "id": short, stable kebab-case, unique within its list (e.g. "dom-payments", "ent-transaction").
- "evidence": array of "path:line" or "path" strings that exist in the evidence pack (file tree, files,
  screenshots, log or telemetry catalogues). Cite the most specific location you can. Use [] only for
  elements that are purely recommended/inferred.
- "confidence": number 0..1 for how certain the element is given the evidence.
- "basis": "observed" (read directly from an artifact) or "inferred" (reasoned from indirect evidence).
- Write for business readers: plain language, banking terminology, no code jargon in names/descriptions.
- Never invent technology, vendors, volumes or numbers the evidence does not support. If something a
  bank normally has is absent, say it is absent rather than describing it as present.
- Return ONLY the JSON object, no prose.`;

const META = '"evidence": ["path:line"], "confidence": 0.9, "basis": "observed"';

function arr(out: any, key: string, min = 1): string[] {
  return Array.isArray(out?.[key]) && out[key].length >= min
    ? []
    : [`"${key}" must be an array with at least ${min} item(s)`];
}

export const STAGES: Stage[] = [
  {
    name: 'inventory',
    title: 'System inventory (code, schema, screens, logs, telemetry, deployment)',
    needs: [],
    usesEvidencePack: true,
    instructions: `You are a senior reverse-engineering analyst. Read the whole evidence pack, including the attached
screenshots, and produce a precise factual inventory of the system. Cover every service, every HTTP endpoint,
every database table and column, every UI screen (from templates AND screenshots), every external system,
every business rule enforced in code (validation, limits, formats, auth checks), the meaningful business
events visible in the log catalogue, the telemetry signals (tracing, metrics, dashboards), and the deployment
units. Also list what evidence is missing that a bank would normally have.`,
    shape: `{
  "system": { "name": "", "description": "2-3 sentences, business view", "businessPurpose": "", "tags": [""] },
  "services": [{ "id": "svc-...", "name": "", "technology": "", "responsibility": "", "datastoreId": "ds-... or null", ${META} }],
  "serviceCalls": [{ "from": "svc-...", "to": "svc-... or ds-...", "label": "what is exchanged", "protocol": "", ${META} }],
  "endpoints": [{ "service": "svc-...", "method": "GET", "path": "/...", "purpose": "", "requiresAuth": true, ${META} }],
  "dataStores": [{ "id": "ds-...", "name": "", "technology": "", "tables": [{ "name": "", "purpose": "", "columns": [{ "name": "", "type": "", "constraints": "PK / FK -> x / NOT NULL / UNIQUE" }] }], ${META} }],
  "screens": [{ "id": "scr-...", "name": "", "route": "/...", "purpose": "", "elements": ["field or action visible"], "screenshot": "docs/img/... or null", ${META} }],
  "externalSystems": [{ "id": "ext-...", "name": "", "description": "", "direction": "outbound|inbound|bidirectional", "protocol": "", "dataExchanged": "", ${META} }],
  "businessRules": [{ "id": "br-...", "rule": "", ${META} }],
  "logEvents": [{ "event": "business meaning", "level": "info|warn|error", "service": "svc-...", ${META} }],
  "telemetry": [{ "signal": "", "kind": "trace|metric|log|dashboard|health-check", "purpose": "", ${META} }],
  "deployment": [{ "id": "dep-...", "name": "", "kind": "environment|instance", "environmentId": "dep-... or null", "serviceId": "svc-... or null", "runtime": "", "scale": "", ${META} }],
  "security": [{ "fact": "", ${META} }],
  "missingEvidence": ["artifact a bank would normally have that is not in this repository"]
}`,
    // Uploads without code have no services or endpoints; ask only for what any input yields.
    validate: (o) =>
      !o?.system?.name
        ? ['"system.name" missing']
        : (o.screens?.length ?? 0) + (o.services?.length ?? 0) === 0
          ? [
              'no screens or services found: list at least the screens or services the evidence shows',
            ]
          : [],
  },
  {
    name: 'domains',
    title: 'Business domains & domain model',
    needs: ['inventory'],
    usesEvidencePack: false,
    instructions: `From the inventory, derive (1) the business domains and (2) the domain model.
Map each domain to the Modules workspace modules it belongs to. Modules (id: name -- scope):
${MODULES.map((m) => `  ${m.id}: ${m.name} -- ${m.hint}`).join('\n')}
For each module also state how much of it this system implements (full / partial / none) with a one-line summary.
Entities must come from real tables/classes where they exist; list every attribute with type and meaning.
Group entities into aggregates. Give relationships with cardinality. Add a glossary of business terms.`,
    shape: `{
  "modules": [{ "id": "module-1", "coverage": "full|partial|none", "summary": "" }],
  "domains": [{ "id": "dom-...", "name": "", "description": "", "moduleIds": ["module-2"], "responsibilities": [""], "owningServices": ["svc-..."],
               "aggregates": [{ "id": "agg-...", "name": "", "entityIds": ["ent-..."], ${META} }], ${META} }],
  "entities": [{ "id": "ent-...", "name": "", "domainId": "dom-...", "description": "", "storage": "e.g. PostgreSQL accounts-db.users",
                "attributes": [{ "name": "", "type": "", "description": "", "key": "pk|fk|unique or omit", "required": true }], ${META} }],
  "relationships": [{ "id": "rel-...", "from": "ent-...", "to": "ent-...", "cardinality": "1:1|1:N|N:1|N:M", "label": "verb phrase", ${META} }],
  "glossary": [{ "term": "", "definition": "" }]
}`,
    validate: (o) => [
      ...arr(o, 'modules', 6),
      ...arr(o, 'domains', 2),
      ...arr(o, 'entities', 2),
      ...arr(o, 'relationships'),
    ],
  },
  {
    name: 'activities',
    title: 'Actions / activities & reports',
    needs: ['inventory', 'domains'],
    usesEvidencePack: false,
    instructions: `Derive (3) the business actions/activities and (6) the reports.
Activities: every distinct thing an actor (customer, system, operator, scheduler) does -- e.g. sign up, log in,
view balance, add payee, transfer funds, deposit funds, view history, and system-side activities such as
validating a transaction or refreshing a balance cache. Tie each to its endpoint/service, domain and module,
and list inputs, outputs and the business rules applied.
Reports: every read-out the system produces today (statements, balance views, transaction history, dashboards,
operational metrics) with implemented=true, PLUS the reports a bank of this kind needs but lacks
(e.g. regulatory, reconciliation, fraud, card or loan reports) with implemented=false and basis "inferred".
Cover all six modules; modules with coverage "none" get only implemented=false reports.`,
    shape: `{
  "activities": [{ "id": "act-...", "name": "verb + object", "moduleId": "module-3", "domainId": "dom-...", "actor": "", "trigger": "",
                  "description": "", "inputs": [""], "outputs": [""], "businessRules": [""], "endpoint": "POST /... or null", "service": "svc-... or null", ${META} }],
  "reports": [{ "id": "rep-...", "name": "", "moduleId": "module-2", "purpose": "", "audience": [""], "fields": [""], "sourceEntityIds": ["ent-..."],
               "frequency": "on demand|daily|real-time|monthly", "implemented": true, ${META} }]
}`,
    validate: (o) => [...arr(o, 'activities', 6), ...arr(o, 'reports', 4)],
  },
  {
    name: 'flows',
    title: 'Execution / business flows, personas & user journeys',
    needs: ['inventory', 'domains', 'activities'],
    usesEvidencePack: false,
    instructions: `Derive (4) the execution/business flows and (5) the personas and their user journeys.
Flows: end-to-end sequences across screens and services (e.g. sign-up, login, payment, deposit, view history),
each step naming the service, the activity it performs and the entities it reads/writes (entity ids).
Personas: the real user types evidenced by the system (customers, plus operators/engineers from deployment,
telemetry and load-generator evidence). Give goals and pain points grounded in what the UI and rules show.
Journeys: for each persona, journeys made of stages (stage, action, touchpoint, optional pain point),
linked to the flows that realise them.`,
    shape: `{
  "executionFlows": [{ "id": "flow-...", "name": "", "description": "", "moduleId": "module-3", "actor": "", "triggerScreen": "scr-... name",
                      "steps": [{ "id": "step-...", "name": "", "description": "", "service": "svc-...", "activityId": "act-...", "readsEntities": ["ent-..."], "writesEntities": ["ent-..."], ${META} }], ${META} }],
  "personas": [{ "id": "per-...", "name": "first name + role tag", "role": "", "goals": [""], "painPoints": [""], "moduleIds": ["module-2"], ${META} }],
  "journeys": [{ "id": "jrn-...", "name": "", "personaId": "per-...", "moduleId": "module-3", "description": "", "flowIds": ["flow-..."],
                "stages": [{ "stage": "Discover|Onboard|Transact|Review|...", "action": "", "touchpoint": "screen or channel", "painPoint": "optional" }], ${META} }]
}`,
    validate: (o) => [
      ...arr(o, 'executionFlows', 3),
      ...arr(o, 'personas', 2),
      ...arr(o, 'journeys', 2),
    ],
  },
  {
    name: 'backlog',
    title: 'Capabilities, epics, features & user stories (per module)',
    needs: ['inventory', 'domains', 'activities', 'flows'],
    usesEvidencePack: false,
    instructions: `Derive (7) business capabilities and the product backlog, organised by the six modules.
Capabilities: what the business can do, per module; status "implemented" / "partial" / "gap" (gap = the module
needs it but the system has none of it). Link to the activities that realise it.
Backlog: for EVERY module, 1-3 epics, each with 1-3 features, each with 2-4 user stories written as
"As a <persona>, I want <goal>, so that <benefit>" with 2-4 testable acceptance criteria in Given/When/Then form.
Stories for implemented behaviour describe what exists (basis "observed", cite evidence); stories for gaps
(e.g. Cards, Loans if absent) describe what must be built (basis "inferred", evidence []).`,
    shape: `{
  "capabilities": [{ "id": "cap-...", "name": "", "description": "", "moduleId": "module-2", "domainId": "dom-...", "status": "implemented|partial|gap", "activityIds": ["act-..."], ${META} }],
  "epics": [{ "id": "epic-...", "name": "", "description": "", "moduleId": "module-2", "capabilityIds": ["cap-..."], ${META},
             "features": [{ "id": "feat-...", "name": "", "description": "", ${META},
                            "stories": [{ "id": "story-...", "title": "", "asA": "", "iWant": "", "soThat": "", "priority": "must|should|could",
                                          "acceptanceCriteria": ["Given ..., when ..., then ..."], ${META} }] }] }]
}`,
    validate: (o) => {
      const p = [...arr(o, 'capabilities', 6), ...arr(o, 'epics', 6)];
      const covered = new Set((o?.epics ?? []).map((e: any) => e.moduleId));
      for (const m of MODULES) if (!covered.has(m.id)) p.push(`no epic for ${m.id} (${m.name})`);
      return p;
    },
  },
  {
    name: 'architecture',
    title: 'Architecture, integrations, deployment & NFRs',
    needs: ['inventory', 'domains'],
    usesEvidencePack: false,
    instructions: `Derive the C4 context and container views, integrations, deployment topology and non-functional
requirements. Context nodes: people, the system itself, and external systems. Container nodes: every deployable
service and datastore (ids should reuse the inventory's svc-/ds- ids). Integrations: every interface between this
system and something outside a single service boundary (external systems, databases, the browser), with protocol
and data exchanged. Deployment: environments and instances as found in the manifests. NFRs: performance,
availability, security, compliance and scalability requirements that are evidenced (timeouts, replicas, health
checks, JWT expiry, TLS, resource limits) -- and those a bank requires but are absent (basis "inferred").
"category" must be one of performance, availability, security, compliance, scalability.`,
    shape: `{
  "contextNodes": [{ "id": "ctx-...", "name": "", "description": "", "technology": "optional", ${META} }],
  "contextEdges": [{ "id": "ce-...", "source": "ctx-...", "target": "ctx-...", "label": "", ${META} }],
  "containerNodes": [{ "id": "svc-... or ds-...", "name": "", "description": "", "technology": "", ${META} }],
  "containerEdges": [{ "id": "cte-...", "source": "", "target": "", "label": "", ${META} }],
  "integrations": [{ "id": "int-...", "name": "", "counterpart": "", "direction": "outbound|inbound|bidirectional", "protocol": "", "dataExchanged": "", ${META} }],
  "deployment": [{ "id": "dep-...", "kind": "environment|instance", "name": "", "environmentId": "dep-... (instances only)", "containerId": "svc-... (instances only)", "runtime": "", "scale": "", ${META} }],
  "nfrs": [{ "id": "nfr-...", "category": "security", "requirement": "", "target": "", "appliesTo": ["svc-..."], ${META} }]
}`,
    validate: (o) => [
      ...arr(o, 'contextNodes', 2),
      ...arr(o, 'containerNodes', 3),
      ...arr(o, 'integrations'),
      ...arr(o, 'nfrs', 3),
    ],
  },
  {
    name: 'brd',
    title: 'Business requirements document & gap analysis',
    needs: ['inventory', 'domains', 'activities', 'flows', 'backlog', 'architecture'],
    usesEvidencePack: false,
    instructions: `Write the narrative sections of a Business Requirements Document for this system, as reverse-engineered,
so that a business stakeholder who never saw the code understands what the system does, for whom, under which
rules, and what is missing. Consolidate business rules (one per line, tied to a module, with evidence). Then
produce a gap analysis: what could not be determined or is missing (per module and per artifact type, e.g. no
runtime logs, no card/loan functionality), with severity and the input that would close each gap.

If an "Initial BRD supplied by the business" section is present, it is the starting point you are enriching:
- Keep its intent, objectives and terminology in the executive summary, objectives and scope, and strengthen
  them with what the evidence shows.
- Split it into individual requirements (one per stated need) and check EACH against the stage outputs:
  "confirmed" = the system does it as stated; "partial" = does part of it or differently; "not-implemented" =
  nothing in the evidence does it; "contradicted" = the system enforces a rule or value that conflicts with the
  requirement (e.g. the BRD allows an overdraft but the code rejects payments above the balance; the BRD asks for a
  15-minute timeout but the code sets 1 hour). Prefer "contradicted" over "not-implemented" or "partial" whenever
  the code actively does something different. Explain the finding in one or
  two sentences, cite evidence, and list the ids (act-, cap-, br-, rep-, flow-, ent-...) that relate to it.
- Put requirements the evidence shows but the initial BRD never mentions into scopeIn/businessRules, so the
  enriched BRD is a superset of the initial one.
Without an initial BRD, return "inputTraceability": [].`,
    shape: `{
  "brd": {
    "executiveSummary": "1-2 paragraphs", "businessContext": "1 paragraph",
    "objectives": [""], "scopeIn": [""], "scopeOut": [""],
    "stakeholders": [{ "role": "", "interest": "" }],
    "businessRules": [{ "id": "br-...", "rule": "", "moduleId": "module-3", "evidence": ["path:line"] }],
    "assumptions": [""], "constraints": [""],
    "risks": [{ "risk": "", "impact": "high|medium|low", "mitigation": "" }],
    "openQuestions": [""], "glossary": [{ "term": "", "definition": "" }]
  },
  "gaps": [{ "id": "gap-...", "area": "", "description": "", "missingInputs": [""], "severity": "blocking|high|medium|low", "suggestedAction": "" }],
  "inputTraceability": [{ "id": "IN-01", "requirement": "as stated in the initial BRD", "moduleId": "module-3",
                          "status": "confirmed|partial|not-implemented|contradicted", "finding": "", "evidence": ["path:line"], "relatedIds": ["act-..."] }]
}`,
    validate: (o) =>
      o?.brd?.executiveSummary ? arr(o, 'gaps', 2) : ['"brd.executiveSummary" missing'],
  },
];

export function systemPrompt(stage: Stage): string {
  return `${stage.instructions}\n${COMMON_RULES}\n\nReturn JSON with exactly this shape (arrays may hold many items):\n${stage.shape}`;
}

/** Compact JSON of earlier stages, so later prompts stay small. */
export function priorContext(stage: Stage, outputs: Record<string, unknown>): string {
  return stage.needs
    .map((name) => `## Output of stage "${name}"\n${JSON.stringify(outputs[name])}`)
    .join('\n\n');
}
