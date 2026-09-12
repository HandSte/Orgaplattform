import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Orgaplattform',
  description: 'Professionelle, kollaborative Organisationsplattform',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Orgaplattform', statusBarStyle: 'default' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
