import { describe, expect, it } from 'vitest';
import { parseJavaSource } from '../src/java-parser-adapter.js';
import { extractJavaStructure } from '../src/java-structure.js';
import { extractJavaPersistence } from '../src/java-persistence.js';

const ENTITY_SOURCE = `package com.aurora.checkout;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import java.util.List;

@Entity
@Table(name = "checkout_items")
public class CheckoutItem {

  @Id
  @GeneratedValue
  private Long id;

  @Column(name = "sku")
  private String sku;

  @OneToMany(mappedBy = "item")
  private List<CheckoutLine> lines;
}
`;

const REPOSITORY_SOURCE = `package com.aurora.checkout;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CheckoutItemRepository extends JpaRepository<CheckoutItem, Long> {
  CheckoutItem findBySku(String sku);

  @Query("select c from CheckoutItem c where c.sku = :sku")
  CheckoutItem findCustomBySku(String sku);
}
`;

function factsOf(path: string, source: string) {
  const result = parseJavaSource(path, source);
  if (!result.ok) throw new Error(`fixture failed to parse: ${result.detail}`);
  return extractJavaStructure(path, source, result.cst);
}

describe('extractJavaPersistence -- entities', () => {
  it('extracts a JPA entity with its table, id fields, columns, and associations', () => {
    const { entities } = extractJavaPersistence([factsOf('CheckoutItem.java', ENTITY_SOURCE)]);
    expect(entities).toHaveLength(1);
    const entity = entities[0]!;
    expect(entity.qualifiedName).toBe('com.aurora.checkout.CheckoutItem');
    expect(entity.tableName).toBe('checkout_items');
    expect(entity.idFields).toEqual(['id']);
    expect(entity.columns).toContainEqual({
      fieldName: 'sku',
      columnName: 'sku',
      javaType: 'String',
    });
    expect(entity.associations).toEqual([
      { fieldName: 'lines', kind: 'OneToMany', targetJavaType: 'CheckoutLine', mappedBy: 'item' },
    ]);
  });

  it('does not treat a plain class as an entity', () => {
    const { entities } = extractJavaPersistence([
      factsOf('Plain.java', 'class Plain { private String x; }\n'),
    ]);
    expect(entities).toEqual([]);
  });
});

describe('extractJavaPersistence -- repositories', () => {
  it('extracts a Spring Data repository with its type arguments and declared query methods', () => {
    const { repositories } = extractJavaPersistence([
      factsOf('CheckoutItemRepository.java', REPOSITORY_SOURCE),
    ]);
    expect(repositories).toHaveLength(1);
    const repo = repositories[0]!;
    expect(repo.qualifiedName).toBe('com.aurora.checkout.CheckoutItemRepository');
    expect(repo.extendsRepositoryType).toBe('JpaRepository');
    expect(repo.entityTypeArgument).toBe('CheckoutItem');
    expect(repo.idTypeArgument).toBe('Long');
    expect(repo.declaredQueryMethods).toEqual([
      { methodName: 'findBySku' },
      {
        methodName: 'findCustomBySku',
        queryAnnotationText: 'select c from CheckoutItem c where c.sku = :sku',
      },
    ]);
  });
});
