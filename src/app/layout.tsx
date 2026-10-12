import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppNav } from '../components/AppNav';
import { Footer } from '../components/Footer';
import { Toaster } from '../components/Toaster';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from '../lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ['DexScreener', 'GeckoTerminal', 'Solana', 'Base', 'Ethereum', 'PnL', 'receipts', 'wallet tracker', 'memecoin', 'trading game', 'simulator'],
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'default' },
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: { type: 'website', siteName: SITE_NAME, title: SITE_TITLE, description: SITE_DESCRIPTION, url: '/' },
  twitter: { card: 'summary', title: SITE_TITLE, description: SITE_DESCRIPTION },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0c' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-on-ink">
          Skip to content
        </a>
        <div className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0 lg:pl-64">
          <AppNav />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </div>
        <Toaster />
      </body>
    </html>
  );
}
