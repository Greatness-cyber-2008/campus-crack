/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse'],

  // Security headers — fixes clickjacking, MIME-sniffing, and adds a real
  // Content-Security-Policy. Whitelists only what CampusCrack actually uses:
  // Paystack (payments), Supabase (auth/data/storage), Google Fonts, and
  // Vercel Analytics. Nothing else is allowed to load or connect.
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-hashes' 'unsafe-eval' https://js.paystack.co https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-hashes' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paystack.co https://js.paystack.co https://vitals.vercel-insights.com https://va.vercel-scripts.com",
      "frame-src https://js.paystack.co https://checkout.paystack.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
