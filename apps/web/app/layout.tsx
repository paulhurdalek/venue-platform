import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Venue Platform · Technische Grundlage',
  description: 'Neutrale technische Startseite der Venue Platform.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="de">
      <body>
        <a className="skip-link" href="#main-content">
          Zum Hauptinhalt
        </a>
        <div className="app-shell">
          <header className="site-header">
            <div className="brand-mark" aria-hidden="true">
              VP
            </div>
            <div>
              <p className="brand-name">Venue Platform</p>
              <p className="brand-context">Technische Grundlage · Phase 0</p>
            </div>
          </header>
          {children}
          <footer className="site-footer">
            <span>Modulare Plattformgrundlage</span>
            <span>Keine fachlichen Funktionen aktiviert</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
