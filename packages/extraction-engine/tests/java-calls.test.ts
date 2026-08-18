import { describe, expect, it } from 'vitest';
import { parseJavaSource } from '../src/java-parser-adapter.js';
import { extractJavaStructure, type JavaFileFacts } from '../src/java-structure.js';
import { extractJavaCallGraph } from '../src/java-calls.js';
import type { CstNode } from 'java-parser';

const CONTROLLER_SOURCE = `package com.aurora.checkout;

public class CheckoutController {
  private final PaymentClient paymentClient;

  public CheckoutController(PaymentClient paymentClient) {
    this.paymentClient = paymentClient;
  }

  public void checkout(String orderId) {
    // bare call -- resolves to this.validate (same type, implicit this)
    validate(orderId);
    // explicit this.<method>() -- resolves the same way
    this.finalize(orderId);
    // static-style call through an imported/local type name -- resolves to the type
    CheckoutSupport.audit(orderId);
    // call through an instance field -- NOT resolvable without type inference
    paymentClient.charge(orderId);
  }

  private void validate(String orderId) {
  }

  private void finalize(String orderId) {
  }
}
`;

const SUPPORT_SOURCE = `package com.aurora.checkout;

public class CheckoutSupport {
  public static void audit(String orderId) {
  }
}
`;

function facts(
  path: string,
  source: string,
): { facts: JavaFileFacts; cst: CstNode; source: string } {
  const result = parseJavaSource(path, source);
  if (!result.ok) throw new Error(`fixture failed to parse: ${result.detail}`);
  return { facts: extractJavaStructure(path, source, result.cst), cst: result.cst, source };
}

describe('extractJavaCallGraph -- calls', () => {
  it('resolves bare/this-qualified calls to the enclosing type, and Type.method() calls to a known local type', () => {
    const controller = facts('CheckoutController.java', CONTROLLER_SOURCE);
    const support = facts('CheckoutSupport.java', SUPPORT_SOURCE);

    const cstsByPath = new Map([
      [controller.facts.path, controller.cst],
      [support.facts.path, support.cst],
    ]);
    const sourcesByPath = new Map([
      [controller.facts.path, controller.source],
      [support.facts.path, support.source],
    ]);

    const { calls } = extractJavaCallGraph(
      [controller.facts, support.facts],
      cstsByPath,
      sourcesByPath,
    );
    const checkoutCalls = calls.filter((c) => c.callerMethod === 'checkout');

    expect(checkoutCalls).toContainEqual(
      expect.objectContaining({
        calleeName: 'validate',
        calleeQualifiedName: 'com.aurora.checkout.CheckoutController.validate',
        unresolved: false,
      }),
    );
    expect(checkoutCalls).toContainEqual(
      expect.objectContaining({
        calleeName: 'finalize',
        calleeQualifiedName: 'com.aurora.checkout.CheckoutController.finalize',
        unresolved: false,
      }),
    );
    expect(checkoutCalls).toContainEqual(
      expect.objectContaining({
        calleeQualifiedName: 'com.aurora.checkout.CheckoutSupport.audit',
        unresolved: false,
      }),
    );
  });

  it('leaves a call through an instance field unresolved -- no type inference is performed', () => {
    const controller = facts('CheckoutController.java', CONTROLLER_SOURCE);
    const cstsByPath = new Map([[controller.facts.path, controller.cst]]);
    const sourcesByPath = new Map([[controller.facts.path, controller.source]]);

    const { calls } = extractJavaCallGraph([controller.facts], cstsByPath, sourcesByPath);
    const fieldCall = calls.find((c) => c.calleeName === 'paymentClient.charge');
    expect(fieldCall).toMatchObject({ unresolved: true });
    expect(fieldCall?.calleeQualifiedName).toBeUndefined();
  });
});

describe('extractJavaCallGraph -- type dependencies', () => {
  it('derives field/param/return type dependencies from structure facts alone', () => {
    const controller = facts('CheckoutController.java', CONTROLLER_SOURCE);
    const support = facts('CheckoutSupport.java', SUPPORT_SOURCE);
    const cstsByPath = new Map([[controller.facts.path, controller.cst]]);
    const sourcesByPath = new Map([[controller.facts.path, controller.source]]);

    const { typeDependencies } = extractJavaCallGraph(
      [controller.facts, support.facts],
      cstsByPath,
      sourcesByPath,
    );
    expect(typeDependencies).toContainEqual(
      expect.objectContaining({
        fromQualifiedName: 'com.aurora.checkout.CheckoutController',
        relation: 'fieldType',
        toName: 'PaymentClient',
        unresolved: true,
      }),
    );
  });
});
