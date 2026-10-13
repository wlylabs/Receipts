import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Toaster } from '../components/Toaster';
import { THEME_SCRIPT } from '../lib/theme';
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
    { media: '(prefers-color-scheme: light)', color: '#f3f1ea' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0b' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // the theme script sets data-theme before React loads, so <html> differs from the server's on purpose
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-on-ink">
          Skip to content
        </a>
        <main id="main" className="min-h-dvh pb-[env(safe-area-inset-bottom)]">
          {children}
        </main>
        <Toaster />
      </body>
    </html>
  );
}
