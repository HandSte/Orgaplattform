import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const protectedRoutes = ['/', '/boards', '/team', '/settings'];

function isProtectedPath(pathname: string) {
  return protectedRoutes.some((route) => pathname === route || (route !== '/' && pathname.startsWith(`${route}/`)));
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (user && pathname === '/auth') return NextResponse.redirect(new URL('/', request.url));
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|app-icon.svg|sw.js).*)'],
};
