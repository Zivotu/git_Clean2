import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  // Legacy: /api/listing?slug=foo  ->  /api/listing/foo  (307)
  if (url.pathname === '/api/listing') {
    const slug = url.searchParams.get('slug');
    if (slug) {
      const to = url.clone();
      to.pathname = `/api/listing/${encodeURIComponent(slug)}`;
      to.search = '';
      return NextResponse.redirect(to, 307);
    }
  }
  return NextResponse.next();
}

// Match samo legacy endpoint
export const config = {
  matcher: ['/api/listing'],
};
