import { createHash } from "node:crypto";
import chalk from "chalk";

/** Module-level ANSI stripping regex (#8) */
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/**
 * Strip ANSI escape codes from a string.
 */
function _stripAnsi(text: string): string {
  ANSI_RE.lastIndex = 0;
  return text.replace(ANSI_RE, "");
}

// ── LRU cache for parsed markdown structure (max 10 entries) ──

interface ParseCacheEntry {
  lines: string[];
}

const parseCache = new Map<string, ParseCacheEntry>();
const PARSE_CACHE_MAX = 10;

function parseCacheKey(markdown: string, width: number): string {
  const hash = createHash("md5").update(markdown).digest("hex");
  return `${width}:${hash}`;
}

function parseCacheSet(key: string, lines: string[]): void {
  if (parseCache.size >= PARSE_CACHE_MAX) {
    // Evict oldest (first key)
    const firstKey = parseCache.keys().next().value;
    if (firstKey !== undefined) parseCache.delete(firstKey);
  }
  parseCache.set(key, { lines });
}

// ── Phase 1: Parse markdown structure (plain text, no ANSI) ──

/**
 * Parse markdown into plain-text lines (no ANSI formatting).
 * Cached by content+width hash.
 */
export function parseMarkdownStructure(markdown: string, width: number): string[] {
  if (!markdown || width <= 0) return [];

  const key = parseCacheKey(markdown, width);
  const cached = parseCache.get(key);
  if (cached) return cached.lines;

  const lines: string[] = [];
  const rawLines = markdown.split(/\r?\n/);
  let inCodeBlock = false;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      lines.push("───CODEBLOCK_SEPARATOR───");
      continue;
    }

    if (inCodeBlock) {
      for (const wrapped of wrapPlainText(line, width)) {
        lines.push(`───CODE───${wrapped}`);
      }
      continue;
    }

    const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = stripInlineMarkdown(headerMatch[2]);
      const prefix = level <= 2 ? "" : "  ";
      for (const wrapped of wrapPlainText(text, width - prefix.length)) {
        lines.push(`───H${level}───${prefix}${wrapped}`);
      }
      if (level <= 2) lines.push("");
      continue;
    }

    if (line.trimStart().startsWith("> ")) {
      const content = stripInlineMarkdown(line.replace(/^\s*>\s?/, ""));
      for (const wrapped of wrapPlainText(content, width - 4)) {
        lines.push(`───QUOTE───${wrapped}`);
      }
      continue;
    }

    const bulletMatch = line.match(/^(\s*)[*\-+]\s+(.*)/);
    if (bulletMatch) {
      const indent = Math.min(bulletMatch[1].length, 8);
      const content = stripInlineMarkdown(bulletMatch[2]);
      const prefix = `${" ".repeat(indent)}• `;
      for (const wrapped of wrapPlainText(content, width - prefix.length)) {
        lines.push(`───BULLET${indent}───${prefix}${wrapped}`);
      }
      continue;
    }

    const numMatch = line.match(/^(\s*)\d+[.)]\s+(.*)/);
    if (numMatch) {
      const indent = Math.min(numMatch[1].length, 8);
      const content = stripInlineMarkdown(numMatch[2]);
      const prefix = `${" ".repeat(indent)}  `;
      for (const wrapped of wrapPlainText(content, width - prefix.length)) {
        lines.push(`───NUM${indent}───${prefix}${wrapped}`);
      }
      continue;
    }

    if (!line.trim()) {
      lines.push("");
      continue;
    }

    const text = stripInlineMarkdown(line);
    for (const wrapped of wrapPlainText(text, width)) {
      lines.push(`───PARA───${wrapped}`);
    }
  }

  parseCacheSet(key, lines);
  return lines;
}

// ── Phase 2: Render visible window with ANSI formatting ──

/**
 * Apply ANSI formatting to a slice of parsed lines.
 * Only formats the visible window for performance.
 */
export function renderMarkdownWindow(parsedLines: string[], start: number, count: number): string[] {
  const end = Math.min(start + count, parsedLines.length);
  const result: string[] = [];

  for (let i = start; i < end; i++) {
    const line = parsedLines[i];
    result.push(formatParsedLine(line));
  }

  return result;
}

function formatParsedLine(line: string): string {
  if (line === "") return "";

  if (line === "───CODEBLOCK_SEPARATOR───") {
    return chalk.dim("─".repeat(60));
  }

  if (line.startsWith("───CODE───")) {
    return chalk.dim(line.slice(10));
  }

  const headerMatch = line.match(/^───H(\d)───(.*)/);
  if (headerMatch) {
    return chalk.bold.blueBright(headerMatch[2]);
  }

  if (line.startsWith("───QUOTE───")) {
    return chalk.dim("│ ") + chalk.italic(line.slice(11));
  }

  if (line.match(/^───BULLET\d───/)) {
    const content = line.replace(/^───BULLET\d───/, "");
    return applyInlineFormatting(content);
  }

  if (line.match(/^───NUM\d───/)) {
    const content = line.replace(/^───NUM\d───/, "");
    return applyInlineFormatting(content);
  }

  if (line.startsWith("───PARA───")) {
    return applyInlineFormatting(line.slice(10));
  }

  return line;
}

// ── Legacy API (kept for compatibility, delegates to two-phase) ──

/**
 * Convert markdown text to styled terminal lines using ANSI codes.
 * Now delegates to two-phase approach internally.
 */
export function renderMarkdownLines(markdown: string, width: number): string[] {
  if (!markdown || width <= 0) return [];

  const parsed = parseMarkdownStructure(markdown, width);
  return renderMarkdownWindow(parsed, 0, parsed.length);
}

// ── Helpers ──

/**
 * Strip inline markdown formatting markers (for plain text phase).
 */
function stripInlineMarkdown(text: string): string {
  let result = text;
  // Inline code — strip backticks
  result = result.replace(/`([^`]+)`/g, "$1");
  // Bold+italic
  result = result.replace(/\*{3}([^*]+)\*{3}/g, "$1");
  result = result.replace(/_{3}([^_]+)_{3}/g, "$1");
  // Bold
  result = result.replace(/\*{2}([^*]+)\*{2}/g, "$1");
  result = result.replace(/_{2}([^_]+)_{2}/g, "$1");
  // Italic
  result = result.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, "$1");
  result = result.replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1");
  return result;
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
 * Simple word-wrap on plain text (no ANSI codes).
 */
function wrapPlainText(text: string, width: number): string[] {
  if (width <= 0) return [];
  if (text.length <= width) return [text];

  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!word) continue;
    if (current.length + word.length <= width) {
      current += word;
    } else {
      if (current.trim()) lines.push(current.trimEnd());
      current = word.trim() ? word : "";
    }
  }
  if (current.trim()) lines.push(current.trimEnd());

  return lines.length > 0 ? lines : [text];
}
