import type { MetadataRoute } from 'next';
const SITE_URL = 'https://campuscrack.com.ng';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/upload', '/generate', '/library', '/analytics', '/flashcards', '/planner', '/courses', '/chat', '/practice', '/results', '/api'],
    }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
