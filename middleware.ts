import { clerkMiddleware } from '@clerk/nextjs/server';

// Pulic, unauthenticated storefront endpoints. Listing them here lets Clerk's
// middleware skip JWT verification entirely on these hot read paths — a fresh
// home page load otherwise pays one JWKS verify per /api/categories, /api/hero,
// /api/banner, /api/product call. Writes still go through authenticated routes.
export default clerkMiddleware({
  publicRoutes: [
    '/api/health',
    '/api/product(.*)',
    '/api/categories',
    '/api/hero',
    '/api/banner',
    '/api/newsletter/unsubscribe',
    '/api/delivery/external/quote',
  ],
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};