import type { Metadata } from 'next';
import { Lexend, Source_Sans_3 } from 'next/font/google';
import './globals.css';

const lexend = Lexend({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const sourceSans = Source_Sans_3({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'Budget Buddy',
  description: 'Track expenses, categories, and spending trends.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lexend.variable} ${sourceSans.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground">{children}</body>
    </html>
  );
}
