import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerArchitectureRoutes } from '../src/routes/architecture.js';

// GET /api/architecture?level= — "empty/no-data" doesn't apply: context and
// container both always have seed data, and component falls back to
// container rather than returning an empty view. Server-error handling is
// covered separately in architecture.error.test.ts.

function expectValidC4Node(node: Record<string, unknown>): void {
  expect(typeof node.id).toBe('string');
  expect(['context', 'container', 'component']).toContain(node.level);
  expect(typeof node.name).toBe('string');
  expect(typeof node.description).toBe('string');
  if ('technology' in node) expect(typeof node.technology).toBe('string');
  const metadata = node.metadata as { provenance: unknown[]; confidence: Record<string, unknown> };
  expect(Array.isArray(metadata.provenance)).toBe(true);
  expect(metadata.provenance.length).toBeGreaterThan(0);
  for (const p of metadata.provenance as Record<string, unknown>[]) {
    expect(typeof p.sourceId).toBe('string');
    expect(typeof p.sourceType).toBe('string');
    expect(typeof p.derivedBy).toBe('string');
    expect(() => new Date(p.derivedAt as string).toISOString()).not.toThrow();
  }
  expect(['high', 'medium', 'low', 'inferred']).toContain(metadata.confidence.level);
}

function expectValidC4Edge(edge: Record<string, unknown>, nodeIds: Set<string>): void {
  expect(typeof edge.id).toBe('string');
  expect(nodeIds.has(edge.source as string)).toBe(true);
  expect(nodeIds.has(edge.target as string)).toBe(true);
  expect(typeof edge.label).toBe('string');
  expect(['context', 'container', 'component']).toContain(edge.level);
}

describe('GET /api/architecture', () => {
  it('returns the context view by default, matching the C4Node/C4Edge contract (response contract)', async () => {
    const app = Fastify();
    registerArchitectureRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/architecture' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(['edges', 'nodes']);
    expect(body.nodes.length).toBeGreaterThan(0);
    const ids = new Set<string>(body.nodes.map((n: { id: string }) => n.id));
    for (const node of body.nodes) expectValidC4Node(node);
    for (const edge of body.edges) expectValidC4Edge(edge, ids);
  });

  it('returns the container view when level=container', async () => {
    const app = Fastify();
    registerArchitectureRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/architecture?level=container' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.nodes.length).toBeGreaterThan(0);
    const ids = new Set<string>(body.nodes.map((n: { id: string }) => n.id));
    for (const node of body.nodes) expectValidC4Node(node);
    for (const edge of body.edges) expectValidC4Edge(edge, ids);
  });

  it('falls back to the container view when level=component', async () => {
    const app = Fastify();
    registerArchitectureRoutes(app);
    const container = await app.inject({ method: 'GET', url: '/api/architecture?level=container' });
    const component = await app.inject({ method: 'GET', url: '/api/architecture?level=component' });
    expect(component.json()).toEqual(container.json());
  });

  it('rejects an invalid level (invalid request)', async () => {
    const app = Fastify();
    registerArchitectureRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/architecture?level=bogus' });
    expect(res.statusCode).toBe(400);
  });

  it('returns a deterministic response across repeated calls (same process)', async () => {
    const app = Fastify();
    registerArchitectureRoutes(app);
    const first = await app.inject({ method: 'GET', url: '/api/architecture?level=context' });
    const second = await app.inject({ method: 'GET', url: '/api/architecture?level=context' });
    expect(first.json()).toEqual(second.json());
  });
});
