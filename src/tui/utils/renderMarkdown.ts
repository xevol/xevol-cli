import chalk from "chalk";

/**
 * Convert markdown text to styled terminal lines using ANSI codes.
 * Handles: headers, bold, italic, inline code, code blocks, blockquotes, bullet lists.
 */
export function renderMarkdownLines(markdown: string, width: number): string[] {
  if (!markdown || width <= 0) return [];

  const lines: string[] = [];
  const rawLines = markdown.split(/\r?\n/);
  let inCodeBlock = false;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // Code block toggle
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        lines.push(chalk.dim("─".repeat(Math.min(width, 60))));
      } else {
        lines.push(chalk.dim("─".repeat(Math.min(width, 60))));
      }
      continue;
    }

    if (inCodeBlock) {
      // Code block content — dim styling
      for (const wrapped of wrapPlain(line, width)) {
        lines.push(chalk.dim(wrapped));
      }
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = applyInlineFormatting(headerMatch[2]);
      const prefix = level <= 2 ? "" : "  ";
      for (const wrapped of wrapPlain(text, width - prefix.length)) {
        lines.push(prefix + chalk.bold.blueBright(wrapped));
      }
      if (level <= 2) lines.push("");
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith("> ")) {
      const content = applyInlineFormatting(line.replace(/^\s*>\s?/, ""));
      for (const wrapped of wrapPlain(content, width - 4)) {
        lines.push(chalk.dim("│ ") + chalk.italic(wrapped));
      }
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^(\s*)[*\-+]\s+(.*)/);
    if (bulletMatch) {
      const indent = Math.min(bulletMatch[1].length, 8);
      const content = applyInlineFormatting(bulletMatch[2]);
      const prefix = " ".repeat(indent) + "• ";
      for (const wrapped of wrapPlain(content, width - prefix.length)) {
        lines.push(prefix + wrapped);
      }
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\s*)\d+[.)]\s+(.*)/);
    if (numMatch) {
      const indent = Math.min(numMatch[1].length, 8);
      const content = applyInlineFormatting(numMatch[2]);
      const prefix = " ".repeat(indent) + "  ";
      for (const wrapped of wrapPlain(content, width - prefix.length)) {
        lines.push(prefix + wrapped);
      }
      continue;
    }

    // Empty line
    if (!line.trim()) {
      lines.push("");
      continue;
    }

    // Regular paragraph with inline formatting
    const formatted = applyInlineFormatting(line);
    for (const wrapped of wrapPlain(formatted, width)) {
      lines.push(wrapped);
    }
  }

  return lines;
}

/**
 * Apply inline markdown formatting: bold, italic, inline code.
 * Uses chalk for ANSI styling.
 */
function applyInlineFormatting(text: string): string {
  // Inline code first (so bold/italic inside code is ignored)
  let result = text.replace(/`([^`]+)`/g, (_m, code) => chalk.dim(`\`${code}\``));

  // Bold + italic: ***text*** or ___text___
  result = result.replace(/\*{3}([^*]+)\*{3}/g, (_m, t) => chalk.bold.italic(t));
  result = result.replace(/_{3}([^_]+)_{3}/g, (_m, t) => chalk.bold.italic(t));

  // Bold: **text** or __text__
  result = result.replace(/\*{2}([^*]+)\*{2}/g, (_m, t) => chalk.bold(t));
  result = result.replace(/_{2}([^_]+)_{2}/g, (_m, t) => chalk.bold(t));

  // Italic: *text* or _text_
  result = result.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, (_m, t) => chalk.italic(t));
  result = result.replace(/(?<!\w)_([^_]+)_(?!\w)/g, (_m, t) => chalk.italic(t));

  return result;
}

/**
 * Wrap a single line of text (which may contain ANSI codes) to fit within width.
 * This is a simple word-wrap that accounts for visible character width.
 */
function wrapPlain(text: string, width: number): string[] {
  if (width <= 0) return [];

  // Strip ANSI to measure visible length
  const visible = stripAnsi(text);
  if (visible.length <= width) return [text];

  // For ANSI-styled text, do character-level wrapping on visible chars
  // This is a simplified approach: split by words on visible text, then reconstruct
  const words = visible.split(/(\s+)/);
  const lines: string[] = [];
  let currentVisible = "";

  for (const word of words) {
    if (!word) continue;
    if (currentVisible.length + word.length <= width) {
      currentVisible += word;
    } else {
      if (currentVisible.trim()) lines.push(currentVisible.trimEnd());
      if (word.trim()) {
        currentVisible = word;
      } else {
        currentVisible = "";
      }
    }
  }
  if (currentVisible.trim()) lines.push(currentVisible.trimEnd());

  // If the text had ANSI codes but we've lost them in word splitting,
  // re-apply the formatting to each line by re-processing from original
  if (text !== visible && lines.length > 0) {
    // Rebuild using the original styled text, splitting at same positions
    return rebuildStyledLines(text, lines, width);
  }

  return lines.length > 0 ? lines : [text];
}

/**
 * Rebuild styled lines from original ANSI text matching the plain-text line breaks.
 */
function rebuildStyledLines(styledText: string, plainLines: string[], _width: number): string[] {
  // Simple approach: for short texts, just return the original
  // For longer ones, try to split at line boundaries
  if (plainLines.length <= 1) return [styledText];

  const result: string[] = [];
  let remaining = styledText;
  
  for (let i = 0; i < plainLines.length; i++) {
    const plainLine = plainLines[i];
    // Find where this plain line ends in the styled text
    let visibleCount = 0;
    let styledIdx = 0;
    const targetLen = plainLine.length;

    while (styledIdx < remaining.length && visibleCount < targetLen) {
      // Skip ANSI escape sequences
      const ansiMatch = remaining.slice(styledIdx).match(/^\x1b\[[0-9;]*m/);
      if (ansiMatch) {
        styledIdx += ansiMatch[0].length;
        continue;
      }
      visibleCount++;
      styledIdx++;
    }

    // Skip trailing whitespace in styled text
    while (styledIdx < remaining.length) {
      const ansiMatch = remaining.slice(styledIdx).match(/^\x1b\[[0-9;]*m/);
      if (ansiMatch) {
        styledIdx += ansiMatch[0].length;
        continue;
      }
      if (remaining[styledIdx] === " " || remaining[styledIdx] === "\t") {
        styledIdx++;
      } else {
        break;
      }
    }

    result.push(remaining.slice(0, styledIdx).trimEnd());
    remaining = remaining.slice(styledIdx);
  }

  if (remaining.trim()) {
    result.push(remaining.trimEnd());
  }

  return result.length > 0 ? result : [styledText];
}

/**
 * Strip ANSI escape codes from a string.
 */
function stripAnsi(text: string): string {
  // biome-ignore lint: regex for ANSI codes
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
