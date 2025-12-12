import { AppRecord } from '../types.js';
import { getFirestore } from 'firebase-admin/firestore';
import { getConfig } from '../config.js';

export type ListingTranslations = {
  [locale: string]: { description: string; longDescription?: string };
};

type ApiConfig = ReturnType<typeof getConfig>;

const DISABLE_VALUES = new Set(['0', 'false', 'off', 'disabled', 'no']);

function translationsFeatureEnabled(): boolean {
  const flag =
    process.env.LISTING_TRANSLATIONS_ENABLED ??
    process.env.LLM_TRANSLATIONS_ENABLED;
  if (!flag) return true;
  return !DISABLE_VALUES.has(flag.trim().toLowerCase());
}

function isTranslationEnabledForConfig(cfg: ApiConfig): boolean {
  if (!cfg.OPENAI_API_KEY) return false;
  const provider = (cfg.LLM_PROVIDER || '').toLowerCase();
  if (provider && DISABLE_VALUES.has(provider)) return false;
  return true;
}

function pickBaseUrl(cfg: ApiConfig): string {
  const { LLM_API_URL } = cfg;
  return (LLM_API_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
}

function toPrompt(item: { title: string; description: string; longDescription?: string }, locales: string[]) {
  const langs = locales.map((l) => l.toLowerCase()).join(', ');
  const hasLongDesc = item.longDescription && item.longDescription.trim().length > 0;
  return (
    'You are a professional translator. Translate the following app description into the requested languages.' +
    ' DO NOT translate the title - return it unchanged in all languages.' +
    ' Keep the tone natural and concise for an app marketplace. Return only valid JSON.' +
    `\nSchema: {"translations": {"<locale>": {"description": string${hasLongDesc ? ', "longDescription": string' : ''}}}}\n` +
    `Locales: [${langs}]` +
    `\nTitle (DO NOT TRANSLATE): ${item.title}` +
    `\nShort Description: ${item.description || ''}` +
    (hasLongDesc ? `\nLong Description: ${item.longDescription}` : '')
  );
}

export async function translateListing(
  item: Pick<AppRecord, 'id' | 'title' | 'description' | 'longDescription'>,
  locales: string[],
  cfg: ApiConfig = getConfig(),
): Promise<ListingTranslations> {
  if (!translationsFeatureEnabled()) {
    return {};
  }
  if (!isTranslationEnabledForConfig(cfg)) {
    return {};
  }
  const { OPENAI_API_KEY, LLM_MODEL } = cfg;
  const base = pickBaseUrl(cfg);
  const body = {
    model: LLM_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Return JSON only.' },
      { role: 'user', content: toPrompt(item, locales) },
    ],
    temperature: 0,
  } as const;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`LLM http_${res.status}`);
  }
  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content: string = j?.choices?.[0]?.message?.content || '{}';
  // Try to extract JSON from common formats (fenced blocks or inline)
  const blockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (blockMatch ? blockMatch[1] : content).trim();
  let parsed: any;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    // Attempt a lenient salvage by trimming leading/trailing text
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
      } catch (e2) {
        console.warn('translate: LLM returned invalid JSON (lenient parse failed)', {
          id: item.id,
        });
        throw new Error('LLM_INVALID_JSON');
      }
    } else {
      console.warn('translate: LLM returned non-JSON content', { id: item.id });
      throw new Error('LLM_INVALID_JSON');
    }
  }
  const tr = (parsed?.translations || {}) as Record<
    string,
    { description?: string; longDescription?: string }
  >;
  const out: ListingTranslations = {};
  for (const l of locales) {
    const it = tr[l] || tr[l.toLowerCase()];
    if (it) {
      const normalizedDescription =
        typeof it.description === 'string' && it.description.trim().length > 0
          ? it.description.trim()
          : item.description || '';
      const normalizedLongDescription =
        typeof it.longDescription === 'string' && it.longDescription.trim().length > 0
          ? it.longDescription.trim()
          : item.longDescription || undefined;
      out[l] = {
        description: normalizedDescription,
        ...(normalizedLongDescription ? { longDescription: normalizedLongDescription } : {}),
      };
    }
  }
  return out;
}

export async function ensureListingTranslations(
  app: AppRecord,
  locales: string[],
): Promise<ListingTranslations | null> {
  const current: ListingTranslations = (app.translations ?? {}) as ListingTranslations;
  const hasExisting = Object.keys(current).length > 0;
  if (!translationsFeatureEnabled()) {
    return hasExisting ? current : null;
  }
  const cfg = getConfig();
  if (!isTranslationEnabledForConfig(cfg)) {
    return hasExisting ? current : null;
  }
  const missing = locales.filter((l) => !current?.[l]?.description);
  if (missing.length === 0) {
    return current;
  }
  let tr: ListingTranslations = {};
  try {
    tr = await translateListing(app, missing, cfg);
  } catch (err) {
    console.warn('translate: ensureListingTranslations failed', {
      id: app.id,
      missing,
      err: String(err),
    });
    // Fail-soft: do not block publish or requests on translation errors
    return null;
  }
  if (!Object.keys(tr).length) return null;
  const db = getFirestore();
  const ref = db.collection('apps').doc(app.id);
  const merged: ListingTranslations = { ...current };
  for (const [k, v] of Object.entries(tr)) {
    merged[k] = v;
  }
  await ref.set({ translations: merged }, { merge: true });
  return merged;
}

