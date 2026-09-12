import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { DesktopNav, MobileNav } from '@/components/nav';
import { RefreshButton } from '@/components/refresh-button';
import { ServiceWorkerRegistrar } from '@/components/service-worker';

export const metadata: Metadata = {
  title: 'Fantasy GM',
  description: 'Your personal fantasy football general manager: what do I need to do right now?',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Fantasy GM' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#0d1117',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/dashboard" className="flex items-baseline gap-2">
              <span className="text-sm font-bold uppercase tracking-[0.2em] text-primary">Fantasy</span>
              <span className="text-sm font-bold uppercase tracking-[0.2em]">GM</span>
            </Link>
            <DesktopNav />
            <RefreshButton />
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 pb-28 pt-4 md:pb-12">{children}</main>

        <MobileNav />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
