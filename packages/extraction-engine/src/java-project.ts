/**
 * P3-03 -- Java source discovery and project structure (FR-DET-01).
 *
 * Filesystem/build-file discovery ONLY -- no Java parsing happens here.
 * Classifies every `.java` artifact into a Maven/Gradle module by walking
 * its path upward to the nearest ancestor `pom.xml`/`build.gradle[.kts]`
 * (the same "resolve upward from a leaf" shape a module boundary actually
 * has), then splits each module's files into `main`/`test` by the
 * `src/main/java`/`src/test/java` convention.
 *
 * POM coordinates (`groupId`/`artifactId`/`version`/`packaging`) are read
 * with a narrow, depth-tracking tag reader scoped to the root `<project>`
 * element's DIRECT children only -- not a general XML parser, mirroring
 * `packages/ingestion-connectors/src/filter.ts`'s own precedent of a
 * hand-rolled parser for a well-known, bounded grammar. The depth tracking
 * is what stops a `<parent>` or `<dependency>` block's own `<groupId>` from
 * being misread as the module's -- a common bug in naive regex POM readers.
 * `<parent>` inheritance itself is NOT resolved (an honest, documented gap):
 * a child POM that omits `<groupId>`/`<version>` simply has them undefined
 * here, never guessed.
 */

import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';

export interface JavaModuleCoordinates {
  groupId?: string;
  artifactId?: string;
  version?: string;
  packaging?: string;
}

export type JavaBuildSystem = 'maven' | 'gradle';

export interface JavaModule {
  /** Deterministic: the build file's own path. */
  id: string;
  buildSystem: JavaBuildSystem;
  buildFilePath: string;
  /** Directory containing the build file -- the module's root. */
  directory: string;
  coordinates?: JavaModuleCoordinates;
  mainSourceFiles: string[];
  testSourceFiles: string[];
}

export interface JavaProjectLayout {
  modules: JavaModule[];
  /** `.java` artifacts with no ancestor build file -- not dropped, surfaced so a caller can still parse them. */
  unassignedJavaFiles: string[];
}

const MAVEN_BUILD_FILE = 'pom.xml';
const GRADLE_BUILD_FILES = ['build.gradle', 'build.gradle.kts'];

function dirnameOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function isAncestorOrSelf(candidateDir: string, fileDir: string): boolean {
  if (candidateDir === fileDir) return true;
  return fileDir.startsWith(candidateDir.length === 0 ? '' : `${candidateDir}/`);
}

// ---------------------------------------------------------------------------
// Maven POM coordinate reader -- narrow, depth-tracking, not a general XML parser.
// ---------------------------------------------------------------------------

const POM_COORDINATE_TAGS = new Set(['groupId', 'artifactId', 'version', 'packaging']);
const XML_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeXmlEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return XML_ENTITIES[entity] ?? match;
  });
}

function stripXmlNoise(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
}

const TAG_PATTERN = /<(\/?)([A-Za-z][\w.-]*)((?:\s+[^<>]*)?)(\/?)>/g;

/** Reads `groupId`/`artifactId`/`version`/`packaging` from the root `<project>` element's direct children only. */
export function parsePomCoordinates(pomXml: string): JavaModuleCoordinates {
  const cleaned = stripXmlNoise(pomXml);
  const projectStart = cleaned.search(/<project[\s>]/);
  if (projectStart === -1) return {};
  const closeTagIndex = cleaned.lastIndexOf('</project>');
  if (closeTagIndex === -1 || closeTagIndex <= projectStart) return {};
  const openTagEnd = cleaned.indexOf('>', projectStart);
  if (openTagEnd === -1) return {};
  const inner = cleaned.slice(openTagEnd + 1, closeTagIndex);

  const coordinates: Record<string, string> = {};
  let depth = 0;
  let capture: { tag: string; start: number } | undefined;

  TAG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_PATTERN.exec(inner)) !== null) {
    const [full, closing, tagName, , selfClosing] = match;
    if (selfClosing === '/' || full === undefined || tagName === undefined) continue;

    if (closing === '/') {
      if (depth === 1 && capture !== undefined && capture.tag === tagName) {
        coordinates[tagName] = decodeXmlEntities(inner.slice(capture.start, match.index).trim());
        capture = undefined;
      }
      depth -= 1;
    } else {
      depth += 1;
      if (depth === 1 && POM_COORDINATE_TAGS.has(tagName))
        capture = { tag: tagName, start: match.index + full.length };
    }
  }

  return {
    ...(coordinates.groupId === undefined ? {} : { groupId: coordinates.groupId }),
    ...(coordinates.artifactId === undefined ? {} : { artifactId: coordinates.artifactId }),
    ...(coordinates.version === undefined ? {} : { version: coordinates.version }),
    ...(coordinates.packaging === undefined ? {} : { packaging: coordinates.packaging }),
  };
}

// ---------------------------------------------------------------------------
// Gradle coordinate reader -- top-level `group`/`version` assignments only.
// ---------------------------------------------------------------------------

const GRADLE_GROUP_PATTERN = /^\s*group\s*(?:=)?\s*['"]([^'"]+)['"]/m;
const GRADLE_VERSION_PATTERN = /^\s*version\s*(?:=)?\s*['"]([^'"]+)['"]/m;

/** Reads top-level `group`/`version` assignments. `artifactId` has no Gradle equivalent in scope (project name lives in `settings.gradle`, out of scope). */
export function parseGradleCoordinates(buildScript: string): JavaModuleCoordinates {
  const group = GRADLE_GROUP_PATTERN.exec(buildScript)?.[1];
  const version = GRADLE_VERSION_PATTERN.exec(buildScript)?.[1];
  return {
    ...(group === undefined ? {} : { groupId: group }),
    ...(version === undefined ? {} : { version }),
  };
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

interface BuildFileCandidate {
  path: string;
  directory: string;
  buildSystem: JavaBuildSystem;
}

function findBuildFiles(artifacts: readonly RawArtifact[]): BuildFileCandidate[] {
  const candidates: BuildFileCandidate[] = [];
  for (const artifact of artifacts) {
    const fileName = artifact.path.slice(artifact.path.lastIndexOf('/') + 1);
    if (fileName === MAVEN_BUILD_FILE) {
      candidates.push({
        path: artifact.path,
        directory: dirnameOf(artifact.path),
        buildSystem: 'maven',
      });
    } else if (GRADLE_BUILD_FILES.includes(fileName)) {
      candidates.push({
        path: artifact.path,
        directory: dirnameOf(artifact.path),
        buildSystem: 'gradle',
      });
    }
  }
  // Deepest (most specific) directory first, so the nearest-ancestor search below finds the closest module, not the root.
  return candidates.sort(
    (a, b) => b.directory.length - a.directory.length || a.path.localeCompare(b.path),
  );
}

function nearestBuildFile(
  fileDir: string,
  candidates: readonly BuildFileCandidate[],
): BuildFileCandidate | undefined {
  return candidates.find((candidate) => isAncestorOrSelf(candidate.directory, fileDir));
}

function scopeOf(path: string): 'main' | 'test' {
  if (path.includes('/src/test/java/') || path.startsWith('src/test/java/')) return 'test';
  if (path.includes('/src/main/java/') || path.startsWith('src/main/java/')) return 'main';
  return path.includes('/test/') ? 'test' : 'main';
}

function coordinatesFor(buildSystem: JavaBuildSystem, content: string): JavaModuleCoordinates {
  return buildSystem === 'maven' ? parsePomCoordinates(content) : parseGradleCoordinates(content);
}

/** Classifies `.java` artifacts into Maven/Gradle modules by nearest ancestor build file. Performs no parsing. */
export function discoverJavaProject(artifacts: readonly RawArtifact[]): JavaProjectLayout {
  const byPath = new Map(artifacts.map((a) => [a.path, a]));
  const buildFileCandidates = findBuildFiles(artifacts);

  const modules = new Map<string, JavaModule>();
  for (const candidate of buildFileCandidates) {
    const artifact = byPath.get(candidate.path);
    const coordinates =
      artifact === undefined ? {} : coordinatesFor(candidate.buildSystem, artifact.content);
    const hasCoordinates = Object.keys(coordinates).length > 0;
    modules.set(candidate.path, {
      id: candidate.path,
      buildSystem: candidate.buildSystem,
      buildFilePath: candidate.path,
      directory: candidate.directory,
      ...(hasCoordinates ? { coordinates } : {}),
      mainSourceFiles: [],
      testSourceFiles: [],
    });
  }

  const unassignedJavaFiles: string[] = [];
  const javaFiles = artifacts
    .filter((a) => a.path.endsWith('.java'))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const artifact of javaFiles) {
    const nearest = nearestBuildFile(dirnameOf(artifact.path), buildFileCandidates);
    if (nearest === undefined) {
      unassignedJavaFiles.push(artifact.path);
      continue;
    }
    const module = modules.get(nearest.path);
    if (module === undefined) continue;
    if (scopeOf(artifact.path) === 'test') module.testSourceFiles.push(artifact.path);
    else module.mainSourceFiles.push(artifact.path);
  }

  return {
    modules: [...modules.values()].sort((a, b) => a.id.localeCompare(b.id)),
    unassignedJavaFiles,
  };
}
