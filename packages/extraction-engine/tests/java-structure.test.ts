import { describe, expect, it } from 'vitest';
import { parseJavaSource } from '../src/java-parser-adapter.js';
import { extractJavaStructure } from '../src/java-structure.js';

function structureOf(path: string, source: string) {
  const result = parseJavaSource(path, source);
  if (!result.ok) throw new Error(`fixture failed to parse: ${result.detail}`);
  return extractJavaStructure(path, source, result.cst);
}

const CONTROLLER_SOURCE = `package com.aurora.checkout;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/checkout")
public class CheckoutController {

  private final CheckoutService checkoutService;

  public CheckoutController(CheckoutService checkoutService) {
    this.checkoutService = checkoutService;
  }

  @GetMapping("/{id}")
  public CheckoutItem getById(@PathVariable String id) {
    return checkoutService.find(id);
  }

  @PostMapping
  public CheckoutItem create(@RequestBody CheckoutItem item) {
    return checkoutService.save(item);
  }

  static class Nested {
    private int count;

    int getCount() {
      return count;
    }
  }
}
`;

describe('extractJavaStructure', () => {
  it('captures package and imports', () => {
    const facts = structureOf('CheckoutController.java', CONTROLLER_SOURCE);
    expect(facts.packageName).toBe('com.aurora.checkout');
    expect(facts.imports).toContainEqual({
      name: 'org.springframework.web.bind.annotation.RestController',
      isStatic: false,
      isWildcard: false,
    });
    expect(facts.imports).toContainEqual({
      name: 'java.util.List',
      isStatic: false,
      isWildcard: false,
    });
  });

  it('captures the type, its annotations, and its qualified name', () => {
    const facts = structureOf('CheckoutController.java', CONTROLLER_SOURCE);
    expect(facts.types).toHaveLength(1);
    const type = facts.types[0]!;
    expect(type.kind).toBe('class');
    expect(type.simpleName).toBe('CheckoutController');
    expect(type.qualifiedName).toBe('com.aurora.checkout.CheckoutController');
    expect(type.modifiers).toContain('Public');

    const annotationNames = type.annotations.map((a) => a.name);
    expect(annotationNames).toEqual(['RestController', 'RequestMapping']);
    const requestMapping = type.annotations.find((a) => a.name === 'RequestMapping');
    expect(requestMapping?.attributes.value).toEqual({
      raw: '"/checkout"',
      resolved: true,
      value: '/checkout',
    });
  });

  it('captures fields', () => {
    const facts = structureOf('CheckoutController.java', CONTROLLER_SOURCE);
    const type = facts.types[0]!;
    expect(type.fields).toHaveLength(1);
    expect(type.fields[0]).toMatchObject({ name: 'checkoutService', type: 'CheckoutService' });
  });

  it('captures methods with parameters, annotations, and return types', () => {
    const facts = structureOf('CheckoutController.java', CONTROLLER_SOURCE);
    const type = facts.types[0]!;
    const methodNames = type.methods.map((m) => m.name);
    expect(methodNames).toEqual(['getById', 'create']);

    const getById = type.methods.find((m) => m.name === 'getById')!;
    expect(getById.returnType).toBe('CheckoutItem');
    expect(getById.annotations.map((a) => a.name)).toEqual(['GetMapping']);
    expect(getById.parameters).toEqual([
      {
        name: 'id',
        type: 'String',
        annotations: [expect.objectContaining({ name: 'PathVariable' })],
      },
    ]);
  });

  it('captures a nested class and ITS fields/methods -- the visitor-recursion risk this design avoids', () => {
    const facts = structureOf('CheckoutController.java', CONTROLLER_SOURCE);
    const type = facts.types[0]!;
    expect(type.nestedTypes).toHaveLength(1);
    const nested = type.nestedTypes[0]!;
    expect(nested.simpleName).toBe('Nested');
    expect(nested.fields).toEqual([expect.objectContaining({ name: 'count', type: 'int' })]);
    expect(nested.methods.map((m) => m.name)).toEqual(['getCount']);
  });

  it('records file-and-line evidence for every fact (FR-DET-08)', () => {
    const facts = structureOf('CheckoutController.java', CONTROLLER_SOURCE);
    const type = facts.types[0]!;
    expect(type.path).toBe('CheckoutController.java');
    expect(type.startLine).toBeGreaterThan(0);
    const method = type.methods[0]!;
    expect(method.startLine).toBeGreaterThan(type.startLine);
  });
});

const ENTITY_SOURCE = `package com.aurora.checkout;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import java.util.List;

@Entity
@Table(name = "checkout_items", schema = "checkout")
public class CheckoutItem {

  @Id
  @GeneratedValue
  private Long id;

  @Column(name = "sku", nullable = false)
  private String sku;

  @OneToMany(mappedBy = "item")
  private List<CheckoutLine> lines;
}
`;

describe('extractJavaStructure -- JPA entity', () => {
  it('captures multi-attribute annotations', () => {
    const facts = structureOf('CheckoutItem.java', ENTITY_SOURCE);
    const type = facts.types[0]!;
    const table = type.annotations.find((a) => a.name === 'Table')!;
    expect(table.attributes.name).toEqual({
      raw: '"checkout_items"',
      resolved: true,
      value: 'checkout_items',
    });
    expect(table.attributes.schema).toEqual({
      raw: '"checkout"',
      resolved: true,
      value: 'checkout',
    });
  });

  it('captures field-level annotations for id/column/relationship fields', () => {
    const facts = structureOf('CheckoutItem.java', ENTITY_SOURCE);
    const type = facts.types[0]!;
    expect(type.fields.map((f) => f.name)).toEqual(['id', 'sku', 'lines']);
    const idField = type.fields.find((f) => f.name === 'id')!;
    expect(idField.annotations.map((a) => a.name)).toEqual(['Id', 'GeneratedValue']);
    const linesField = type.fields.find((f) => f.name === 'lines')!;
    expect(linesField.type).toBe('List<CheckoutLine>');
    expect(linesField.annotations[0]?.attributes.mappedBy).toEqual({
      raw: '"item"',
      resolved: true,
      value: 'item',
    });
  });
});

const REPOSITORY_SOURCE = `package com.aurora.checkout;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CheckoutItemRepository extends JpaRepository<CheckoutItem, Long> {
  CheckoutItem findBySku(String sku);

  @Query("select c from CheckoutItem c where c.sku = :sku")
  CheckoutItem findCustomBySku(String sku);
}
`;

describe('extractJavaStructure -- interface', () => {
  it('captures an interface, its extends list, and its methods', () => {
    const facts = structureOf('CheckoutItemRepository.java', REPOSITORY_SOURCE);
    const type = facts.types[0]!;
    expect(type.kind).toBe('interface');
    expect(type.extendsTypes).toEqual(['JpaRepository<CheckoutItem, Long>']);
    expect(type.methods.map((m) => m.name)).toEqual(['findBySku', 'findCustomBySku']);
    const custom = type.methods.find((m) => m.name === 'findCustomBySku')!;
    expect(custom.annotations[0]?.name).toBe('Query');
  });
});
