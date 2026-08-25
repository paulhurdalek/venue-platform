import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Venue Platform',
  description: 'Verwaltung von Organisation, Location und Team.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="de">
      <body>
        <a className="skip-link" href="#main-content">
          Zum Hauptinhalt
        </a>
        {children}
      </body>
    </html>
  );
}
