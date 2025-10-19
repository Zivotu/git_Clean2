export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const slug = searchParams.get('slug');
  if (!slug) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_slug' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  return Response.redirect(`${origin}/api/listing/${encodeURIComponent(slug)}`, 307);
}
