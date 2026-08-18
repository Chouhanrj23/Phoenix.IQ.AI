import { describe, expect, it } from 'vitest';
import { discoverJavaProject } from '../src/index.js';

describe('extraction-engine barrel export', () => {
  it('re-exports the package public API from a single entry point', () => {
    expect(typeof discoverJavaProject).toBe('function');
  });
});
