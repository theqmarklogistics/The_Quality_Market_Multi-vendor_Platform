/** @type {import('next').NextConfig} */
const nextConfig = {
    images:{
        unoptimized: true
    },
    serverExternalPackages: ['@imagekit/nodejs']
};

export default nextConfig;
