/**
 * P8 -- BR-10 / FR-OKF-13 / FR-IF-03: a portable export of everything
 * Phoenix knows about a system, as plain files any tool can read without
 * Phoenix:
 *
 *   index.md                       what is in the package, artifact by artifact
 *   manifest.json                  every file with its SHA-256 and size
 *   okf/knowledge.okf.yaml         the canonical OKF document (validated)
 *   artifacts/<artifact-id>/...    the eleven rendered artifacts + trace.json
 *
 * Deterministic: the bundle's own `generatedAt` is the only time in it, so
 * the same knowledge always exports to byte-identical files (FR-DET-07).
 */

import { createHash } from 'node:crypto';
import {
  serializeOkfYaml,
  toOkfDocument,
  validateOkfDocument,
  type CanonicalKnowledgeBundle,
} from '@phoenix-ai/knowledge-graph';
import { compareCodeUnits } from '@phoenix-ai/shared';
import { renderAllArtifacts } from './renderers.js';
import type { RenderedArtifact, RenderedFile } from './render-support.js';

export interface ExportManifest {
  readonly format: 'phoenix-okf-export';
  readonly formatVersion: 1;
  readonly systemId: string;
  readonly generatedAt: string;
  readonly artifacts: readonly {
    readonly id: string;
    readonly status: RenderedArtifact['status'];
    readonly elementCount: number;
    readonly missingInputs: readonly string[];
  }[];
  readonly files: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  }[];
}

export interface ExportPackage {
  readonly manifest: ExportManifest;
  /** Every file, `manifest.json` included, ordered by path. */
  readonly files: readonly RenderedFile[];
  readonly artifacts: readonly RenderedArtifact[];
}

export function exportOkfPackage(bundle: CanonicalKnowledgeBundle): ExportPackage {
  const document = toOkfDocument(bundle);
  const validation = validateOkfDocument(document);
  if (!validation.valid) {
    // Refuse to export something that is not valid OKF rather than ship it.
    throw new Error(
      `cannot export: the OKF document is invalid: ${validation.errors.slice(0, 5).join('; ')}`,
    );
  }
  const artifacts = renderAllArtifacts(bundle);

  const files: RenderedFile[] = [
    {
      path: 'okf/knowledge.okf.yaml',
      mediaType: 'application/yaml',
      content: serializeOkfYaml(document),
    },
  ];
  for (const artifact of artifacts) {
    for (const file of artifact.files) {
      files.push({ ...file, path: `artifacts/${artifact.id}/${file.path}` });
    }
  }

  const index = [
    `# ${bundle.systemId} — Phoenix knowledge export`,
    '',
    `Knowledge generated ${bundle.generatedAt}. Every statement in these files is drawn from the knowledge graph and carries its provenance; inferred statements are marked as such and await review.`,
    '',
    '| Artifact | Status | Elements | Files | Needs |',
    '| --- | --- | --- | --- | --- |',
    ...artifacts.map(
      (a) =>
        `| ${a.label} | ${a.status} | ${a.elements.length} | ${a.files.map((f) => `[${f.path}](artifacts/${a.id}/${f.path})`).join(', ')} | ${a.missingInputs.length === 0 ? '—' : a.missingInputs.join('; ').replace(/\|/g, '\\|')} |`,
    ),
    '',
    'The canonical, machine-readable form is [okf/knowledge.okf.yaml](okf/knowledge.okf.yaml); [manifest.json](manifest.json) lists every file with its SHA-256.',
    '',
  ].join('\n');
  files.push({ path: 'index.md', mediaType: 'text/markdown', content: index });
  files.sort((a, b) => compareCodeUnits(a.path, b.path));

  const manifest: ExportManifest = {
    format: 'phoenix-okf-export',
    formatVersion: 1,
    systemId: bundle.systemId,
    generatedAt: bundle.generatedAt,
    artifacts: artifacts.map((a) => ({
      id: a.id,
      status: a.status,
      elementCount: a.elements.length,
      missingInputs: a.missingInputs,
    })),
    files: files.map((f) => ({
      path: f.path,
      sha256: createHash('sha256').update(f.content, 'utf8').digest('hex'),
      bytes: Buffer.byteLength(f.content, 'utf8'),
    })),
  };
  const manifestFile: RenderedFile = {
    path: 'manifest.json',
    mediaType: 'application/json',
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  };
  return {
    manifest,
    files: [...files, manifestFile].sort((a, b) => compareCodeUnits(a.path, b.path)),
    artifacts,
  };
}
