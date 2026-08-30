/**
 * Subsequence matching for the command palette. Typing "lmp" should find
 * "The Lamplighter"; a library of a few thousand books is small enough that a
 * scan per keystroke is imperceptible, so nothing more elaborate is warranted.
 */

export interface FuzzyResult {
  score: number;
  /** Indices in the haystack that matched, for highlighting. */
  matches: number[];
}

export function fuzzyMatch(needle: string, haystack: string): FuzzyResult | null {
  const query = needle.trim().toLowerCase();
  if (!query) return { score: 0, matches: [] };

  const target = haystack.toLowerCase();
  const matches: number[] = [];
  let score = 0;
  let at = 0;
  let previous = -2;

  for (const char of query) {
    const found = target.indexOf(char, at);
    if (found === -1) return null;

    // Consecutive letters and word starts are what people actually mean.
    if (found === previous + 1) score += 8;
    if (found === 0 || /[\s\-—:_/.,(]/.test(target[found - 1] ?? "")) score += 6;
    score += Math.max(0, 4 - (found - at));

    matches.push(found);
    previous = found;
    at = found + 1;
  }

  // A short haystack that matched is a better hit than a long one.
  score += Math.max(0, 20 - haystack.length / 4);
  return { score, matches };
}

/** Ranks items by their best matching field, dropping anything that misses. */
export function fuzzyRank<T>(
  items: T[],
  query: string,
  fields: (item: T) => string[],
  limit = 40,
): Array<{ item: T; score: number; matches: number[] }> {
  const scored: Array<{ item: T; score: number; matches: number[] }> = [];

  for (const item of items) {
    let best: { score: number; matches: number[] } | null = null;
    for (const field of fields(item)) {
      const result = fuzzyMatch(query, field);
      if (result && (!best || result.score > best.score)) best = result;
      // Only the first field carries highlight positions, since that is the one
      // the palette renders.
      if (best && field !== fields(item)[0]) best = { score: best.score, matches: [] };
    }
    if (best) scored.push({ item, ...best });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
