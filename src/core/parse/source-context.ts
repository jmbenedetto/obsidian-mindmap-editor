/** Source contexts shared by parsing and bounded structural writes. */
export interface SourceContext {
  visible: boolean[];
  headings: Set<number>;
  fences: boolean;
  refusal: string | null;
}

export function sourceContext(lines: string[]): SourceContext {
  const visible = lines.map(() => false);
  const headings = new Set<number>();
  let fence: { marker: string; length: number } | null = null;
  let comment: '-->' | '%%' | null = null;
  let frontmatter = /^\uFEFF?---\s*$/.test(lines[0] ?? '');
  let refusal: string | null = null;
  let fences = false;
  const lists: { indent: number; content: number }[] = [];
  let separated = false;
  const column = (text: string): number =>
    [...text].reduce(
      (width, char) => (char === '\t' ? width + 4 - (width % 4) : width + 1),
      0,
    );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (frontmatter) {
      if (i > 0 && /^(?:---|\.\.\.)\s*$/.test(line)) {
        frontmatter = false;
      }
      continue;
    }
    if (comment) {
      if (line.includes(comment)) {
        if (line.slice(line.indexOf(comment) + comment.length).trim()) {
          refusal ??=
            'Trailing content after a multiline comment is unsupported.';
        }
        comment = null;
      }
      continue;
    }
    if (fence) {
      const close = /^ {0,3}(`+|~+)\s*$/.exec(line);

      if (
        close &&
        close[1]![0] === fence.marker &&
        close[1]!.length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }
    const start = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);

    if (start && !(start[1]![0] === '`' && start[2]!.includes('`'))) {
      if (line.startsWith(' ')) {
        refusal ??= 'Indented/container fences are unsupported for map writes.';
      }
      fence = { marker: start[1]![0]!, length: start[1]!.length };
      fences = true;
      continue;
    }
    // Container indentation and raw HTML need a richer block parser. Refuse
    // moves for the whole document rather than guessing their block boundaries.
    if (
      /^\s*(?:(?:>\s*|[-+*]\s+|\d+[.)]\s+)+|\t| {4,})(?:`{3,}|~{3,})/.test(line)
    ) {
      refusal ??=
        'Container/indented fences are unsupported for structural moves.';
    }
    if (/^ {0,3}(?:(?:[-+*]|\d+[.)])\s+|>\s*)*<(?!!--)[A-Za-z/!]/.test(line)) {
      refusal ??= 'Raw HTML blocks are unsupported for structural moves.';
    }
    const html = line.indexOf('<!--');
    const obsidian = line.indexOf('%%');
    const beginsComment = html >= 0 || obsidian >= 0;

    if (beginsComment) {
      const htmlFirst = html >= 0 && (obsidian < 0 || html < obsidian);
      const at = htmlFirst ? html : obsidian;
      const end = htmlFirst ? '-->' : '%%';
      const size = htmlFirst ? 4 : 2;

      const closing = line.indexOf(end, at + size);

      if (closing < 0) {
        comment = end;
      } else if (line.slice(closing + end.length).trim()) {
        refusal ??=
          'Trailing/compound comment content is unsupported for map writes.';
      }
      // A comment after a heading's text does not hide the heading itself.
      visible[i] =
        at > 0 && /^(?:#{1,6}(?:\s|$)|[ \t]*(?:[-+*]|\d+[.)])\s+)/.test(line);
      if (at === 0) {
        lists.length = 0;
      }
    } else {
      visible[i] = true;
    }
    if (visible[i] && /^#{1,6}[ \t]/.test(line)) {
      headings.add(i);
      lists.length = 0;
    }
    if (visible[i]) {
      if (
        /^ {1,3}#{1,6}(?:[ \t]|$)/.test(line) ||
        /^#{1,6}$/.test(line) ||
        /^ {0,3}(?:=+|-+)[ \t]*$/.test(line)
      ) {
        refusal ??=
          'Indented, bare or Setext heading context is unsupported for map writes.';
      }
      if (
        /^(?:#{1,6}|[ \t]*(?:[-+*]|\d+[.)]))[^\S \t]/.test(line) ||
        /^[ \t]*(?:[-+*]|\d+[.)])$/.test(line) ||
        /^[ \t]* [ \t]*\t/.test(line) ||
        (i === 0 && line.startsWith('\uFEFF'))
      ) {
        refusal ??=
          'Unsupported heading/list separator or outline byte-order mark.';
      }
      const item = /^([ \t]*)([-+*]|\d+[.)])([ \t]+)/.exec(line);

      if (item) {
        const indent = item[1]!;
        const width = column(indent);
        const content = column(item[0]);

        while (lists.length && lists[lists.length - 1]!.indent >= width) {
          lists.pop();
        }
        const parent = lists[lists.length - 1];
        const indentedCode = parent ? width > parent.content + 3 : width > 3;
        const mixedIndent = indent.includes(' ') && indent.includes('\t');
        const codePadding = content - width - item[2]!.length > 4;

        if (indentedCode || mixedIndent || codePadding) {
          refusal ??=
            'Ambiguous indented-code/list context is unsupported for map writes.';
        }
        lists.push({ indent: width, content });
      } else if (separated && /^\S/.test(line)) {
        lists.length = 0;
      }
      separated = line.trim() === '';
    }
  }
  if (fence || comment || frontmatter) {
    refusal ??=
      'Unclosed fence, comment or frontmatter: structural move refused.';
  }

  return { visible, headings, fences, refusal };
}

export function requireStructuralContext(lines: string[]): SourceContext {
  const context = sourceContext(lines);

  if (context.refusal) {
    throw new Error(`Mindmap: ${context.refusal}`);
  }

  return context;
}
