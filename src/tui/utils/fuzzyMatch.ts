import chalk from "chalk";

export interface FuzzyResult {
  match: boolean;
  score: number;
  indices: number[];
}

/**
 * Simple fuzzy match: each query char must appear in text in order (case-insensitive).
 * Score favors consecutive matches and matches at word boundaries.
 */
export function fuzzyMatch(query: string, text: string): FuzzyResult {
  if (!query) return { match: true, score: 0, indices: [] };

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const indices: number[] = [];

  let qi = 0;
  let lastIndex = -1;
  let score = 0;

  for (let ti = 0; ti < textLower.length && qi < queryLower.length; ti++) {
    if (textLower[ti] === queryLower[qi]) {
      indices.push(ti);

      // Bonus for consecutive matches
      if (lastIndex >= 0 && ti === lastIndex + 1) {
        score += 3;
      }
      // Bonus for match at start or after word boundary
      if (ti === 0 || /[\s\-_./]/.test(text[ti - 1])) {
        score += 5;
      }
      // Small bonus for earlier matches
      score += 1;
      // Penalty for distance from last match
      if (lastIndex >= 0) {
        score -= Math.min(ti - lastIndex - 1, 5) * 0.5;
      }

      lastIndex = ti;
      qi++;
    }
  }

  if (qi < queryLower.length) {
    return { match: false, score: 0, indices: [] };
  }

  return { match: true, score, indices };
}

/**
 * Wraps matched characters in chalk.bold for terminal display.
 */
export function highlightMatch(text: string, indices: number[]): string {
  if (indices.length === 0) return text;

  const indexSet = new Set(indices);
  let result = "";
  let i = 0;

  while (i < text.length) {
    if (indexSet.has(i)) {
      // Collect consecutive matched chars
      let run = "";
      while (i < text.length && indexSet.has(i)) {
        run += text[i];
        i++;
      }
      result += chalk.bold(run);
    } else {
      result += text[i];
      i++;
    }
  }

  return result;
}
