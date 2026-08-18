import { describe, expect, it } from 'vitest';
import { parseJavaSource } from '../src/java-parser-adapter.js';
import { extractJavaStructure } from '../src/java-structure.js';
import { extractJavaHttp } from '../src/java-http.js';
import { bridgeSpringController } from '../src/bridge-http.js';
import { deterministicId } from '../src/bridge-shared.js';
import { validateApiObject } from '@phoenix-ai/knowledge-graph';

const CONTROLLER_SOURCE = `package com.aurora.checkout;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/checkout")
public class CheckoutController {
  @GetMapping("/{id}")
  public CheckoutItem getById() {
    return null;
  }
}
`;

function structureOf(path: string, source: string) {
  const result = parseJavaSource(path, source);
  if (!result.ok) throw new Error(`fixture failed to parse: ${result.detail}`);
  return extractJavaStructure(path, source, result.cst);
}

describe('deterministicId', () => {
  it('is stable for identical inputs and different for different inputs (FR-DET-07)', () => {
    expect(
      deterministicId('api', 'aurora-commerce', 'com.aurora.checkout.CheckoutController'),
    ).toBe(deterministicId('api', 'aurora-commerce', 'com.aurora.checkout.CheckoutController'));
    expect(
      deterministicId('api', 'aurora-commerce', 'com.aurora.checkout.CheckoutController'),
    ).not.toBe(deterministicId('api', 'aurora-commerce', 'com.aurora.checkout.OtherController'));
  });
});

describe('bridgeSpringController', () => {
  it('produces a real, valid ApiObject with one operation per route', () => {
    const controllers = extractJavaHttp([
      structureOf('CheckoutController.java', CONTROLLER_SOURCE),
    ]);
    const api = bridgeSpringController(controllers[0]!, {
      systemId: 'aurora-commerce',
      sourceId: 'repo://aurora-commerce/services/checkout',
      generatedAt: '2026-08-18T00:00:00.000Z',
    });

    expect(validateApiObject(api)).toEqual({ valid: true, errors: [] });
    expect(api.kind).toBe('integration.api');
    expect(api.attributes.operations).toEqual([
      {
        name: 'GET /checkout/{id}',
        description: 'Handled by com.aurora.checkout.CheckoutController#getById.',
      },
    ]);
  });

  it('produces the same id for the same system+type across two separate runs', () => {
    const controllers = extractJavaHttp([
      structureOf('CheckoutController.java', CONTROLLER_SOURCE),
    ]);
    const options = {
      systemId: 'aurora-commerce',
      sourceId: 'repo://x',
      generatedAt: '2026-08-18T00:00:00.000Z',
    };
    const first = bridgeSpringController(controllers[0]!, options);
    const second = bridgeSpringController(controllers[0]!, options);
    expect(first.identity.id).toBe(second.identity.id);
  });
});
