import { describe, expect, it } from 'vitest';
import { MindNode, parseMarkdown } from '../src/core/parse/parser';
import { sourceContext } from '../src/core/parse/source-context';
import {
  moveNodesOp,
  reorderSiblingOp,
  setTextOp,
} from '../src/core/write/ops';
import { joinLike } from '../src/obsidian/markdown/file-io';

function named(root: MindNode, text: string): MindNode {
  if (root.text === text) {
    return root;
  }
  for (const child of root.children) {
    try {
      return named(child, text);
    } catch {
      /* Search the next branch. */
    }
  }
  throw new Error(`Missing ${text}`);
}

const FRONT = '---\ntitle: "Português 👩🏽‍💻"\nother: "# not a heading"\n---\n';
const RICH =
  '| A | B |\n| - | - |\n| é | ✅ |\n[[Linked|ligação]] ![[local.png]]\n- [ ] tarefa 📅 2026-12-31\n';

describe('structural byte and hierarchy preservation', () => {
  for (const [opening, closing, inner] of [
    ['```js', '```', '# literal\n~~~\n## literal too'],
    ['~~~text', '~~~~~', '# literal\n```\n## literal too'],
    ['````text', '`````', '```\n# literal\n~~~'],
    ['~~~~~', '~~~~~', '~~~\n# literal\n````'],
  ]) {
    for (const eol of ['\n', '\r\n']) {
      it(`moves real hierarchy only: ${opening}, ${JSON.stringify(eol)}`, () => {
        const sourceBlock = `# Source\n${RICH}${opening}\n${inner}\n${closing}\n<!-- retained original\n# comment literal\n-->\n## Child\nbody\n`;
        const targetBlock = '# Target\nadjacent prose\n';
        const original = (FRONT + sourceBlock + targetBlock).replace(
          /\n/g,
          eol,
        );
        const root = parseMarkdown(original, 'Note');
        const lines = original.split(/\r?\n/);
        const result = moveNodesOp(
          lines,
          [named(root, 'Source')],
          named(root, 'Target'),
        );
        const after = joinLike(result, original);
        const expected = (
          FRONT +
          targetBlock +
          sourceBlock
            .replace('# Source', '## Source')
            .replace('## Child', '### Child')
        ).replace(/\n/g, eol);

        expect(after).toBe(expected);
        expect(lines.join(eol)).toBe(original);
        const tree = parseMarkdown(after, 'Note');

        expect(named(tree, 'Source').parent?.text).toBe('Target');
        expect(named(tree, 'Child').parent?.text).toBe('Source');
        expect(() => named(tree, 'literal')).toThrow();
      });
    }
  }

  for (const suffix of ['', '\n', '\r\n']) {
    it(`preserves final-newline state in a Unicode label edit: ${JSON.stringify(suffix)}`, () => {
      const original = '# Draft' + suffix;
      const root = parseMarkdown(original, 'Note');
      const after = joinLike(
        setTextOp(original.split(/\r?\n/), root.children[0]!, 'ação é 🧠'),
        original,
      );

      expect(after).toBe('# ação é 🧠' + suffix);
    });
  }

  for (const unsupported of [
    '# Source\n```\n# literal\n# Target\n',
    '# Source\nbody\n# Target\n~~~~\n# hidden destination\n',
    '# Source\n- ```text\n# literal\n- ```\n# Target\n',
    '# Source\n> ~~~\n# literal\n> ~~~\n# Target\n',
    '# Source\n    ```\n# literal\n    ```\n# Target\n',
    '# Source\n  ~~~\n# literal\n  ~~~\n# Target\n',
    '---\nkey: x\n# Source\n# Target\n',
    '# Source\n<!-- unclosed\n# Target\n',
    '# Source\n%% unclosed\n# Target\n',
    '# Source\n<!-- one --> <!-- two\n# Target\n',
    '# Source\n<pre>\n# literal\n</pre>\n# Target\n',
    '# Source\n    - literal code\n# Target\n',
    '# Source\n- real item\n      - literal code\n# Target\n',
    '# Source\n- real item\n \t- ambiguous indentation\n# Target\n',
    '# Source\n- <div>\n# literal\n</div>\n# Target\n',
    '# Source\n> - ~~~\n# literal\n> - ~~~\n# Target\n',
    '# Source\n> - <div>\n# literal\n# Target\n',
    '# Source\n  ## Indented heading\n# Target\n',
    '# Source\n#\n# Target\n',
    '# Source\nSetext child\n-----\n# Target\n',
    '\uFEFF# Source\n# Target\n',
    '# Source\n##\u00A0not ATX\n# Target\n',
    '# Source\n*\n# Target\n',
  ]) {
    it(`safely refuses ambiguous source/destination without mutating input: ${JSON.stringify(unsupported)}`, () => {
      const fallback = parseMarkdown('# Source\n# Target\n', 'Note');
      const lines = unsupported.split('\n');

      expect(sourceContext(lines).refusal).not.toBeNull();
      expect(() =>
        moveNodesOp(lines, [fallback.children[0]!], fallback.children[1]!),
      ).toThrow();
      expect(lines.join('\n')).toBe(unsupported);
    });
  }

  it('refuses heading overflow instead of clamping the hierarchy', () => {
    const text = '# Source\n## Child\n# Other\n###### Target\n';
    const root = parseMarkdown(text, 'Note');
    const lines = text.split('\n');

    expect(() =>
      moveNodesOp(lines, [named(root, 'Source')], named(root, 'Target')),
    ).toThrow('overflow');
    expect(lines.join('\n')).toBe(text);
  });

  for (const [body, shifted] of [
    ['    # literal code', '    # literal code'],
    ['## ', '### '],
  ]) {
    it(`preserves indented literal code or shifts a genuine empty heading: ${JSON.stringify(body)}`, () => {
      const text = `# Source\n${body}\n# Target\n`;
      const root = parseMarkdown(text, 'Note');
      const after = moveNodesOp(
        text.split('\n'),
        [named(root, 'Source')],
        named(root, 'Target'),
      ).join('\n');

      expect(after).toBe(`# Target\n## Source\n${shifted}\n`);
    });
  }

  it('keeps a genuine list item with an inline comment visible and movable', () => {
    const text = '# A\n- parent <!-- retained marker -->\n- Target\n';
    const root = parseMarkdown(text, 'Note');
    const source = named(root, 'parent <!-- retained marker -->');
    const after = moveNodesOp(
      text.split('\n'),
      [source],
      named(root, 'Target'),
    ).join('\n');

    expect(after).toBe('# A\n- Target\n\t- parent <!-- retained marker -->\n');
  });

  it('preserves duplicate labels by actual source range during reordering', () => {
    const text = '# A\n- duplicate\n  um\n- duplicate\n  dois\n';
    const root = parseMarkdown(text, 'Note');
    const [a, b] = root.children[0]!.children;
    const after = reorderSiblingOp(text.split('\n'), a!, b!).join('\n');

    expect(after).toBe('# A\n- duplicate\n  dois\n- duplicate\n  um\n');
  });

  it('preserves a mixed-EOL no-op and refuses a mutation rather than normalizing bytes', () => {
    const text = '# Draft\r\nbody\n# Next\r\n';
    const lines = text.split(/\r?\n/);

    expect(joinLike(lines, text)).toBe(text);
    expect(() => joinLike(['# Changed', ...lines.slice(1)], text)).toThrow(
      'Mixed',
    );
    expect(text).toBe('# Draft\r\nbody\n# Next\r\n');
  });
});
