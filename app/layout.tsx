import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Footer } from '@/components/ui/Footer';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const interBody = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Budget Buddy',
  description: 'Track expenses, categories, and spending trends.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interBody.variable} ${jetbrainsMono.variable}`}>
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <ServiceWorkerRegistration />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
