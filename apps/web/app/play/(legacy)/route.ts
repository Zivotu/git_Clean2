export async function GET(req: Request) {
  const url = new URL(req.url);
  const appId = url.searchParams.get('appId');

  if (!appId) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_appId' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const rest = new URLSearchParams(url.searchParams);
  rest.delete('appId');

  const query = rest.toString();
  const location = `${url.origin}/play/${encodeURIComponent(appId)}/${query ? `?${query}` : ''}`;

  return Response.redirect(location, 308);
}

