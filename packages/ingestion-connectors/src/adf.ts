/**
 * P6-02 -- a minimal Atlassian Document Format (ADF) renderer.
 *
 * Jira's REST API v3 returns `fields.description` (and comment bodies) as
 * ADF -- a nested JSON document -- not plain text. Serializing that JSON
 * wholesale into `RawArtifact.content` would hand extraction a document tree
 * to re-parse for no benefit; `renderAdfToText` flattens the common node
 * types (paragraph, heading, text, hard break, lists, code block,
 * blockquote, rule) into plain text, which is what a description actually
 * IS as a knowledge-extraction input.
 *
 * Deliberately minimal: list items are rendered as separate lines with no
 * bullet marker or nesting depth, and an unrecognised node type (a table, a
 * panel, an emoji, a mention, embedded media -- ADF has many) has its
 * text-bearing children rendered, if any, rather than the whole render
 * aborting. A connector that drops what it does not understand is more
 * useful than one that throws on the first unfamiliar node. See
 * `docs/architecture/adr/0027-p6-02-jira-connector.md` "Limitations".
 */

export interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
  [key: string]: unknown;
}

const BLOCK_BREAK_TYPES = new Set(['paragraph', 'heading', 'codeBlock', 'listItem', 'rule']);

function collectText(node: AdfNode, into: string[]): void {
  if (node.type === 'text' && typeof node.text === 'string') {
    into.push(node.text);
    return;
  }
  if (node.type === 'hardBreak') {
    into.push('\n');
    return;
  }

  const content = Array.isArray(node.content) ? node.content : undefined;
  for (const child of content ?? []) collectText(child, into);

  if (node.type !== undefined && BLOCK_BREAK_TYPES.has(node.type)) into.push('\n\n');
}

/**
 * Renders an ADF document to plain text. Also accepts a plain string
 * unchanged (older Jira Server APIs return `description` as plain/wiki
 * text, not ADF) and treats `null`/`undefined` as empty content.
 */
export function renderAdfToText(document: unknown): string {
  if (document === null || document === undefined) return '';
  if (typeof document === 'string') return document;
  if (typeof document !== 'object') return '';

  const into: string[] = [];
  collectText(document as AdfNode, into);
  return into
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
