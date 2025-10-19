export function playHref(
  appId: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  const query = new URLSearchParams();

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === false) continue;
      query.set(key, String(value));
    }
  }

  const search = query.toString();
  return `/play/${encodeURIComponent(appId)}/${search ? `?${search}` : ''}`;
}

