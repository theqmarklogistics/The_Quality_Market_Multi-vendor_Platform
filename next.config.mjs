/** @type {import('next').NextConfig} */
const nextConfig = {
    // Expose the Google Maps browser key (client-side keys are public by design;
    // restrict it by HTTP referrer in Google Cloud). Mapped here so the same
    // PUBLIC_GOOGLE_MAPS_API_KEY env var serves both server geocoding and the
    // client map without duplicating it.
    env: {
        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.PUBLIC_GOOGLE_MAPS_API_KEY || '',
    },
    images: {
        remotePatterns: [
            ...(process.env.IMAGEKIT_URL_ENDPOINT ? [new URL(process.env.IMAGEKIT_URL_ENDPOINT)] : []),
            // Allow ImageKit hosted images
            { protocol: 'https', hostname: 'ik.imagekit.io' },
            { protocol: 'https', hostname: 'img.clerk.com' },
            { protocol: 'https', hostname: 'images.clerk.dev' }
        ]
    },
    serverExternalPackages: ['@imagekit/nodejs'],
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    // Clickjacking: nothing on the site needs to be framed by another origin.
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    // Geolocation is used (checkout pin, rider console); camera/mic are not (web).
                    { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
                    // HSTS only matters behind HTTPS; harmless locally.
                    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }
                ]
            }
        ];
    }
};

export default nextConfig;
