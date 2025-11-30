const CANONICAL_TAGS = ['games', 'quiz', 'learning', 'tools', 'business', 'entertainment', 'other'] as const;

export type CanonicalTag = (typeof CANONICAL_TAGS)[number];

const TAG_FALLBACK_LABELS: Record<CanonicalTag, string> = {
  games: 'Games',
  quiz: 'Quizzes',
  learning: 'Learning',
  tools: 'Tools',
  business: 'Business',
  entertainment: 'Entertainment',
  other: 'Other',
};

const SYNONYM_MAP: Record<string, CanonicalTag> = (() => {
  const pairs: Array<[string, CanonicalTag]> = [
    ['games', 'games'],
    ['game', 'games'],
    ['igre', 'games'],
    ['spiele', 'games'],
    ['kvizovi', 'quiz'],
    ['kviz', 'quiz'],
    ['quiz', 'quiz'],
    ['quizzes', 'quiz'],
    ['learning', 'learning'],
    ['ucenje', 'learning'],
    ['lernen', 'learning'],
    ['alati', 'tools'],
    ['alat', 'tools'],
    ['tools', 'tools'],
    ['tool', 'tools'],
    ['business', 'business'],
    ['posao', 'business'],
    ['geschaft', 'business'],
    ['entertainment', 'entertainment'],
    ['zabava', 'entertainment'],
    ['unterhaltung', 'entertainment'],
    ['other', 'other'],
    ['ostalo', 'other'],
    ['sonstiges', 'other'],
  ];
  return pairs.reduce<Record<string, CanonicalTag>>((acc, [key, value]) => {
    acc[normalizeLookupKey(key)] = value;
    return acc;
  }, {});
})();

function normalizeLookupKey(value?: string | null): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function canonicalizeTag(tag?: string | null): string | null {
  if (typeof tag !== 'string') return null;
  const trimmed = tag.trim();
  if (!trimmed) return null;
  const lookup = normalizeLookupKey(trimmed);
  if (!lookup) return trimmed;
  return SYNONYM_MAP[lookup] ?? trimmed;
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const tag of tags) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    ordered.push(tag);
  }
  return ordered;
}

export function normalizeTags(
  raw?: string[] | null,
  options?: { fallbackToOther?: boolean },
): string[] {
  const canonicalized = (Array.isArray(raw) ? raw : [])
    .map((tag) => canonicalizeTag(tag))
    .filter((tag): tag is string => Boolean(tag));
  const result = dedupeTags(canonicalized);
  if (result.length) return result;
  if (options?.fallbackToOther === false) return [];
  return ['other'];
}

export function getTagFallbackLabel(tag: string): string {
  if (TAG_FALLBACK_LABELS[tag as CanonicalTag]) {
    return TAG_FALLBACK_LABELS[tag as CanonicalTag];
  }
  return tag
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function formatTagLabel(
  tag: string,
  translate?: (key: string, fallback: string) => string,
): string {
  const fallback = getTagFallbackLabel(tag);
  if (!translate) return fallback;
  return translate(`tags.${tag}`, fallback);
}

export function isCanonicalTag(tag: string): tag is CanonicalTag {
  return (CANONICAL_TAGS as readonly string[]).includes(tag);
}
