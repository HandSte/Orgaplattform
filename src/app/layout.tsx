import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Orgaplattform',
  description: 'Professionelle, kollaborative Organisationsplattform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
