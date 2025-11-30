const STORAGE_MARKERS = [
  'localstorage',
  'window.localstorage',
  'globalthis.localstorage',
  'thesara.storage',
  'thesaraStorage'.toLowerCase(),
];

export function detectStorageUsageInCode(source?: string | null): boolean {
  if (!source) return false;
  const normalized = source.toLowerCase();
  return STORAGE_MARKERS.some((marker) => normalized.includes(marker));
}

