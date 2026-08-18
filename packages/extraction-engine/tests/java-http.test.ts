import { describe, expect, it } from 'vitest';
import { parseJavaSource } from '../src/java-parser-adapter.js';
import { extractJavaStructure } from '../src/java-structure.js';
import { extractJavaHttp, joinPaths } from '../src/java-http.js';

const CONTROLLER_SOURCE = `package com.aurora.checkout;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/checkout")
public class CheckoutController {

  @GetMapping("/{id}")
  public CheckoutItem getById(@PathVariable String id, @RequestParam(required = false) String expand) {
    return null;
  }

  @PostMapping
  public CheckoutItem create(@RequestBody CheckoutItem item) {
    return null;
  }
}

class NotAController {
  public void doThing() {}
}
`;

function extract(source: string) {
  const result = parseJavaSource('CheckoutController.java', source);
  if (!result.ok) throw new Error(`fixture failed to parse: ${result.detail}`);
  const facts = extractJavaStructure('CheckoutController.java', source, result.cst);
  return extractJavaHttp([facts]);
}

describe('joinPaths', () => {
  it('joins a class base path with a method sub-path', () => {
    expect(joinPaths(['/checkout'], ['/{id}'])).toEqual(['/checkout/{id}']);
  });

  it('falls back to the class path alone when the method has none', () => {
    expect(joinPaths(['/checkout'], [])).toEqual(['/checkout']);
  });

  it('produces root "/" when neither side has a path', () => {
    expect(joinPaths([], [])).toEqual(['/']);
  });

  it('de-duplicates and normalizes slashes across multiple class/method paths', () => {
    expect(joinPaths(['/a', '/a/'], ['/x'])).toEqual(['/a/x']);
  });
});

describe('extractJavaHttp', () => {
  it('extracts only annotated controllers, ignoring plain classes', () => {
    const controllers = extract(CONTROLLER_SOURCE);
    expect(controllers).toHaveLength(1);
    expect(controllers[0]?.qualifiedName).toBe('com.aurora.checkout.CheckoutController');
    expect(controllers[0]?.classLevelPaths).toEqual(['/checkout']);
  });

  it('extracts routes with their HTTP method and joined path', () => {
    const [controller] = extract(CONTROLLER_SOURCE);
    expect(controller?.routes).toEqual([
      expect.objectContaining({
        httpMethod: 'GET',
        path: '/checkout/{id}',
        handlerMethod: 'getById',
      }),
      expect.objectContaining({ httpMethod: 'POST', path: '/checkout', handlerMethod: 'create' }),
    ]);
  });

  it('extracts parameter metadata only for annotated parameters', () => {
    const [controller] = extract(CONTROLLER_SOURCE);
    const getRoute = controller?.routes.find((r) => r.handlerMethod === 'getById');
    expect(getRoute?.parameters).toEqual([
      { name: 'id', kind: 'path', javaType: 'String' },
      { name: 'expand', kind: 'query', javaType: 'String' },
    ]);

    const postRoute = controller?.routes.find((r) => r.handlerMethod === 'create');
    expect(postRoute?.parameters).toEqual([
      { name: 'item', kind: 'body', javaType: 'CheckoutItem' },
    ]);
  });
});
