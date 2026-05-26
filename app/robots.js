export default function robots() {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://thequalitymarket.com'
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/admin/', '/store/', '/api/', '/orders/', '/cart/', '/chat/'],
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
    }
}
