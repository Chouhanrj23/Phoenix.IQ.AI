import { describe, expect, it } from 'vitest';
import { renderAdfToText } from '../src/adf.js';

describe('renderAdfToText', () => {
  it('returns empty string for null/undefined', () => {
    expect(renderAdfToText(null)).toBe('');
    expect(renderAdfToText(undefined)).toBe('');
  });

  it('passes a plain string through unchanged (older Jira Server APIs)', () => {
    expect(renderAdfToText('Plain text description.')).toBe('Plain text description.');
  });

  it('renders a single paragraph of plain text runs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Meridian Pay authorization flow.' }],
        },
      ],
    };
    expect(renderAdfToText(doc)).toBe('Meridian Pay authorization flow.');
  });

  it('joins multiple text runs within a paragraph without inserting spaces', () => {
    // ADF splits a sentence into multiple text runs when formatting (bold,
    // links, ...) changes mid-sentence; the runs already carry their own
    // spacing, so concatenation must not add more.
    const doc = {
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'The ' },
            { type: 'text', text: 'checkout service', marks: [{ type: 'strong' }] },
            { type: 'text', text: ' calls Meridian Pay.' },
          ],
        },
      ],
    };
    expect(renderAdfToText(doc)).toBe('The checkout service calls Meridian Pay.');
  });

  it('separates two paragraphs with a blank line', () => {
    const doc = {
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph.' }] },
      ],
    };
    expect(renderAdfToText(doc)).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('renders a hardBreak as a newline within a paragraph', () => {
    const doc = {
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Line one' },
            { type: 'hardBreak' },
            { type: 'text', text: 'Line two' },
          ],
        },
      ],
    };
    expect(renderAdfToText(doc)).toBe('Line one\nLine two');
  });

  it('renders each list item on its own line', () => {
    const doc = {
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }],
            },
          ],
        },
      ],
    };
    expect(renderAdfToText(doc)).toBe('First\n\nSecond');
  });

  it('renders a code block as plain text', () => {
    const doc = {
      content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] }],
    };
    expect(renderAdfToText(doc)).toBe('const x = 1;');
  });

  it('renders children of an unrecognised node type instead of dropping the whole document', () => {
    // "table" is a real ADF node type this renderer does not special-case —
    // its text-bearing children should still surface, per the file header.
    const doc = {
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell text' }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(renderAdfToText(doc)).toBe('Cell text');
  });

  it('does not throw on a node type with no content at all (e.g. an emoji/mention leaf)', () => {
    const doc = { content: [{ type: 'emoji', attrs: { shortName: ':thumbsup:' } }] };
    expect(renderAdfToText(doc)).toBe('');
  });

  it('collapses more than two consecutive blank lines', () => {
    const doc = {
      content: [
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Text after blanks.' }] },
      ],
    };
    expect(renderAdfToText(doc)).toBe('Text after blanks.');
  });
});
