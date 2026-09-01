import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Budget Buddy',
    short_name: 'Budget Buddy',
    description: 'Track expenses, categories, budgets, and spending trends.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#F5F3FF',
    theme_color: '#6366F1',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
