/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/play/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            // This policy locks down the Play page.
            // 'unsafe-inline' is used for styles and scripts on the parent page for now.
            // The iframe content is protected by a stricter meta-CSP.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'", // Next.js may require this for now
              "style-src 'self' 'unsafe-inline'",
              `connect-src 'self' ${process.env.NEXT_PUBLIC_API_HOST || 'https://api.thesara.space'}`,
              `frame-src 'self'`, // The iframe is loaded via srcDoc, so 'self' is sufficient
              "img-src 'self' data: https:",
              "frame-ancestors 'self'", // Prevents the Play page from being embedded elsewhere
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;