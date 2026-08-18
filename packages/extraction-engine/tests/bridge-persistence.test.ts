import { describe, expect, it } from 'vitest';
import { parseJavaSource } from '../src/java-parser-adapter.js';
import { extractJavaStructure } from '../src/java-structure.js';
import { extractJavaPersistence } from '../src/java-persistence.js';
import { bridgeJpaEntity } from '../src/bridge-persistence.js';
import { validateEntityObject } from '@phoenix-ai/knowledge-graph';

const ENTITY_SOURCE = `package com.aurora.checkout;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "checkout_items")
public class CheckoutItem {
  @Id
  private Long id;

  @Column(name = "sku")
  private String sku;
}
`;

function structureOf(path: string, source: string) {
  const result = parseJavaSource(path, source);
  if (!result.ok) throw new Error(`fixture failed to parse: ${result.detail}`);
  return extractJavaStructure(path, source, result.cst);
}

describe('bridgeJpaEntity', () => {
  it('produces a real, valid EntityObject with observed confidence and file+line evidence', () => {
    const { entities } = extractJavaPersistence([structureOf('CheckoutItem.java', ENTITY_SOURCE)]);
    const entity = bridgeJpaEntity(entities[0]!, {
      systemId: 'aurora-commerce',
      sourceId: 'repo://aurora-commerce/services/checkout',
      generatedAt: '2026-08-18T00:00:00.000Z',
    });

    expect(validateEntityObject(entity)).toEqual({ valid: true, errors: [] });
    expect(entity.kind).toBe('domain.entity');
    expect(entity.confidenceDetail).toEqual({ basis: 'observed' });
    expect(entity.metadata.confidence.level).toBe('high');
    expect(entity.evidence[0]?.locator).toMatch(/^CheckoutItem\.java#L\d+/);
    expect(entity.attributes.fields?.map((f) => f.name)).toEqual(['id', 'sku']);
  });

  it('produces the same id for the same system+type across two separate runs', () => {
    const { entities } = extractJavaPersistence([structureOf('CheckoutItem.java', ENTITY_SOURCE)]);
    const options = {
      systemId: 'aurora-commerce',
      sourceId: 'repo://x',
      generatedAt: '2026-08-18T00:00:00.000Z',
    };
    const first = bridgeJpaEntity(entities[0]!, options);
    const second = bridgeJpaEntity(entities[0]!, options);
    expect(first.identity.id).toBe(second.identity.id);
  });
});
