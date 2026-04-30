/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            ...(process.env.IMAGEKIT_URL_ENDPOINT ? [new URL(process.env.IMAGEKIT_URL_ENDPOINT)] : []),
            // Allow ImageKit hosted images
            { protocol: 'https', hostname: 'ik.imagekit.io' },
            { protocol: 'https', hostname: 'img.clerk.com' },
            { protocol: 'https', hostname: 'images.clerk.dev' }
        ]
    },
    serverExternalPackages: ['@imagekit/nodejs']
};

export default nextConfig;
