import { describe, expect, it } from 'vitest';
import { KNOWN_OBJECT_KINDS } from '@phoenix-ai/graph-persistence';
import {
  artifactsForObjectKind,
  okfArtifact,
  OKF_ARTIFACT_IDS,
  OKF_ARTIFACTS,
} from '../src/artifacts.js';

/**
 * P8 -- the registry integrity check `artifacts.ts` has always cited
 * ("cross-checked against `KNOWN_OBJECT_KINDS` ... by `tests/artifacts.test.ts`")
 * but which did not exist. Without it nothing stopped the registry from naming
 * an object kind the canonical vocabulary does not have, which would make
 * `affectedArtifacts` silently report nothing for a real correction.
 */

describe('OKF artifact registry integrity (P8)', () => {
  it('registers exactly the eleven FRD output artifact types, each once, in declaration order', () => {
    expect(OKF_ARTIFACT_IDS).toHaveLength(11);
    expect(new Set(OKF_ARTIFACT_IDS).size).toBe(11);
    expect(OKF_ARTIFACTS.map((artifact) => artifact.id)).toEqual([...OKF_ARTIFACT_IDS]);
  });

  it('names only object kinds that exist in the canonical vocabulary', () => {
    const known = new Set(KNOWN_OBJECT_KINDS);
    for (const artifact of OKF_ARTIFACTS) {
      for (const kind of artifact.objectKinds) {
        expect(known.has(kind), `${artifact.id} -> ${kind}`).toBe(true);
      }
    }
  });

  it('marks an artifact as modelled exactly when at least one kind feeds it', () => {
    for (const artifact of OKF_ARTIFACTS) {
      expect(artifact.modelled).toBe(artifact.objectKinds.length > 0);
    }
  });

  it('never lists a kind twice within one artifact', () => {
    for (const artifact of OKF_ARTIFACTS) {
      expect(new Set(artifact.objectKinds).size).toBe(artifact.objectKinds.length);
    }
  });

  it('artifactsForObjectKind is the exact inverse of the registry', () => {
    for (const kind of new Set(OKF_ARTIFACTS.flatMap((artifact) => artifact.objectKinds))) {
      const expected = OKF_ARTIFACTS.filter((artifact) => artifact.objectKinds.includes(kind)).map(
        (artifact) => artifact.id,
      );
      expect(artifactsForObjectKind(kind)).toEqual(expected);
    }
  });

  it('answers an unknown kind with nothing, never a guess', () => {
    expect(artifactsForObjectKind('no.such-kind')).toEqual([]);
    expect(() => okfArtifact('no-such-artifact' as never)).toThrow(/unknown OKF artifact/);
  });
});
