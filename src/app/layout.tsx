import type { Metadata, Viewport } from 'next';
import ListDragEnhancer from '@/components/ListDragEnhancer';
import GlobalNavigation from '@/components/GlobalNavigation';
import './globals.css';
import './branding.css';
import './boards/workspace-enhancements.css';

export const metadata: Metadata = {
  title: 'Essentia',
  description: 'Alles Wesentliche. Ein Ort.',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
  icons: { icon: '/app-icon.svg', apple: '/app-icon.svg' },
  openGraph: { title: 'Essentia', description: 'Alles Wesentliche. Ein Ort.', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Essentia', description: 'Alles Wesentliche. Ein Ort.' },
  appleWebApp: { capable: true, title: 'Essentia', statusBarStyle: 'default' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#111827' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>
        {children}
        <ListDragEnhancer />
        <GlobalNavigation />
        <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined)); }` }} />
      </body>
    </html>
  );
}
