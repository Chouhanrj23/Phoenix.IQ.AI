import { describe, expect, it } from 'vitest';
import { validateCanonicalKnowledgeRelationship } from '@phoenix-ai/knowledge-graph';
import { parseJavaSource } from '../src/java-parser-adapter.js';
import { extractJavaStructure, type JavaFileFacts } from '../src/java-structure.js';
import { extractJavaCallGraph } from '../src/java-calls.js';
import { extractJavaHttp } from '../src/java-http.js';
import { extractJavaPersistence } from '../src/java-persistence.js';
import { bridgeSpringController } from '../src/bridge-http.js';
import { bridgeJpaEntity } from '../src/bridge-persistence.js';
import { bridgeJpaAssociations, bridgeTypeDependencies } from '../src/bridge-relationships.js';
import type { BridgeOptions } from '../src/bridge-shared.js';

const OPTIONS: BridgeOptions = {
  systemId: 'aurora-commerce',
  sourceId: 'repo://aurora-commerce/services/orders',
  generatedAt: '2026-08-20T00:00:00.000Z',
};

const ORDER_JAVA = `package com.aurora.orders;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import java.util.List;

@Entity
public class Order {
  @Id
  private Long id;

  @OneToMany(mappedBy = "order")
  private List<OrderItem> items;
}
`;

const ORDER_ITEM_JAVA = `package com.aurora.orders;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class OrderItem {
  @Id
  private Long id;

  private Integer quantity;
}
`;

const ORDER_CONTROLLER_JAVA = `package com.aurora.orders;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OrderController {
  @GetMapping("/orders/{id}")
  public Order getOrder(@PathVariable Long id) {
    return null;
  }
}
`;

function parse(path: string, source: string) {
  const result = parseJavaSource(path, source);
  if (!result.ok) throw new Error(`fixture failed to parse: ${result.detail}`);
  return result;
}

/** Builds real structural facts + call graph/type-dependency graph over a small multi-file fixture, mirroring `extractJavaProject`'s own wiring but without the connector/artifact plumbing. */
function buildFixture() {
  const files: [string, string][] = [
    ['Order.java', ORDER_JAVA],
    ['OrderItem.java', ORDER_ITEM_JAVA],
    ['OrderController.java', ORDER_CONTROLLER_JAVA],
  ];

  const cstsByPath = new Map();
  const sourcesByPath = new Map();
  const filesFacts: JavaFileFacts[] = [];

  for (const [path, source] of files) {
    const parsed = parse(path, source);
    cstsByPath.set(path, parsed.cst);
    sourcesByPath.set(path, source);
    filesFacts.push(extractJavaStructure(path, source, parsed.cst));
  }

  const { typeDependencies } = extractJavaCallGraph(filesFacts, cstsByPath, sourcesByPath);
  const controllers = extractJavaHttp(filesFacts);
  const { entities } = extractJavaPersistence(filesFacts);

  const controllerObjects = controllers.map((c) => bridgeSpringController(c, OPTIONS));
  const entityObjects = entities.map((e) => bridgeJpaEntity(e, OPTIONS));

  const bridgedObjectIdsByQualifiedName = new Map<string, string>();
  controllers.forEach((c, i) => {
    bridgedObjectIdsByQualifiedName.set(c.qualifiedName, controllerObjects[i]!.identity.id);
  });
  entities.forEach((e, i) => {
    bridgedObjectIdsByQualifiedName.set(e.qualifiedName, entityObjects[i]!.identity.id);
  });
  const entityQualifiedNames = new Set(entities.map((e) => e.qualifiedName));

  return {
    typeDependencies,
    entities,
    controllerObjects,
    entityObjects,
    bridgedObjectIdsByQualifiedName,
    entityQualifiedNames,
  };
}

describe('bridgeTypeDependencies', () => {
  it('bridges a real returnType dependency between a bridged Api and a bridged Entity, backed by direct source evidence', () => {
    const { typeDependencies, bridgedObjectIdsByQualifiedName, entityQualifiedNames } =
      buildFixture();

    const relationships = bridgeTypeDependencies(
      typeDependencies,
      bridgedObjectIdsByQualifiedName,
      entityQualifiedNames,
      OPTIONS,
    );

    const controllerId = bridgedObjectIdsByQualifiedName.get('com.aurora.orders.OrderController');
    const orderId = bridgedObjectIdsByQualifiedName.get('com.aurora.orders.Order');
    const dependency = relationships.find(
      (r) => r.sourceObjectId === controllerId && r.targetObjectId === orderId,
    );

    expect(dependency).toBeDefined();
    expect(validateCanonicalKnowledgeRelationship(dependency)).toEqual({ valid: true, errors: [] });
    expect(dependency?.kind).toBe('dependsOn');
    expect(dependency?.category).toBe('association');
    expect(dependency?.attributes).toEqual({ relation: 'returnType' });
    expect(dependency?.confidenceDetail).toEqual({ basis: 'observed' });
    expect(dependency?.evidence?.[0]?.locator).toMatch(/^OrderController\.java#L\d+/);
  });

  it('does not bridge fieldType dependencies originating from a bridged Entity (left to bridgeJpaAssociations, which unwraps collections correctly)', () => {
    const { typeDependencies, bridgedObjectIdsByQualifiedName, entityQualifiedNames } =
      buildFixture();

    const relationships = bridgeTypeDependencies(
      typeDependencies,
      bridgedObjectIdsByQualifiedName,
      entityQualifiedNames,
      OPTIONS,
    );

    const orderId = bridgedObjectIdsByQualifiedName.get('com.aurora.orders.Order');
    const orderItemId = bridgedObjectIdsByQualifiedName.get('com.aurora.orders.OrderItem');
    const fromOrderToOrderItem = relationships.filter(
      (r) => r.sourceObjectId === orderId && r.targetObjectId === orderItemId,
    );
    expect(fromOrderToOrderItem).toEqual([]);
  });

  it('produces no relationship when the dependency target has no canonical object (e.g. a plain, unbridged class)', () => {
    const relationships = bridgeTypeDependencies(
      [
        {
          fromQualifiedName: 'com.aurora.orders.OrderController',
          toName: 'com.aurora.orders.OrderService',
          toQualifiedName: 'com.aurora.orders.OrderService',
          relation: 'fieldType',
          unresolved: false,
          span: { path: 'OrderController.java', startLine: 5 },
        },
      ],
      new Map([['com.aurora.orders.OrderController', 'api-abc']]),
      new Set(),
      OPTIONS,
    );
    expect(relationships).toEqual([]);
  });

  it('produces no relationship for an unresolved dependency (no guessing)', () => {
    const relationships = bridgeTypeDependencies(
      [
        {
          fromQualifiedName: 'com.aurora.orders.OrderController',
          toName: 'PaymentClient',
          relation: 'fieldType',
          unresolved: true,
          span: { path: 'OrderController.java', startLine: 5 },
        },
      ],
      new Map([
        ['com.aurora.orders.OrderController', 'api-abc'],
        ['PaymentClient', 'entity-def'],
      ]),
      new Set(),
      OPTIONS,
    );
    expect(relationships).toEqual([]);
  });
});

describe('bridgeJpaAssociations', () => {
  it('bridges a real @OneToMany association between two bridged Entities, preserving field name and mappedBy', () => {
    const { entities, bridgedObjectIdsByQualifiedName } = buildFixture();

    const relationships = bridgeJpaAssociations(entities, bridgedObjectIdsByQualifiedName, OPTIONS);

    const orderId = bridgedObjectIdsByQualifiedName.get('com.aurora.orders.Order');
    const orderItemId = bridgedObjectIdsByQualifiedName.get('com.aurora.orders.OrderItem');
    expect(relationships).toHaveLength(1);
    const association = relationships[0]!;

    expect(validateCanonicalKnowledgeRelationship(association)).toEqual({
      valid: true,
      errors: [],
    });
    expect(association.sourceObjectId).toBe(orderId);
    expect(association.targetObjectId).toBe(orderItemId);
    expect(association.kind).toBe('hasAssociation');
    expect(association.category).toBe('association');
    expect(association.attributes).toEqual({
      associationKind: 'OneToMany',
      fieldName: 'items',
      mappedBy: 'order',
    });
    expect(association.metadata.provenance[0]).toMatchObject({
      sourceId: OPTIONS.sourceId,
      sourceType: 'source-code',
      derivedBy: 'extraction-engine',
    });
  });

  it('does not guess when an association target simple name is ambiguous across two entities', () => {
    const entities = [
      {
        path: 'a/Pet.java',
        startLine: 1,
        qualifiedName: 'com.aurora.a.Pet',
        idFields: [],
        columns: [],
        associations: [{ fieldName: 'owner', kind: 'ManyToOne' as const, targetJavaType: 'Owner' }],
      },
      {
        path: 'x/Owner.java',
        startLine: 1,
        qualifiedName: 'com.aurora.x.Owner',
        idFields: [],
        columns: [],
        associations: [],
      },
      {
        path: 'y/Owner.java',
        startLine: 1,
        qualifiedName: 'com.aurora.y.Owner',
        idFields: [],
        columns: [],
        associations: [],
      },
    ];
    const ids = new Map([
      ['com.aurora.a.Pet', 'entity-pet'],
      ['com.aurora.x.Owner', 'entity-owner-x'],
      ['com.aurora.y.Owner', 'entity-owner-y'],
    ]);

    const relationships = bridgeJpaAssociations(entities, ids, OPTIONS);
    expect(relationships).toEqual([]);
  });

  it('produces no relationship when the association target has no canonical object at all', () => {
    const entities = [
      {
        path: 'Pet.java',
        startLine: 1,
        qualifiedName: 'com.aurora.Pet',
        idFields: [],
        columns: [],
        associations: [
          { fieldName: 'type', kind: 'ManyToOne' as const, targetJavaType: 'PetType' },
        ],
      },
    ];
    const relationships = bridgeJpaAssociations(
      entities,
      new Map([['com.aurora.Pet', 'entity-pet']]),
      OPTIONS,
    );
    expect(relationships).toEqual([]);
  });
});
