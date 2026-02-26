import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rohlik Stats — Analyza vasich nakupu',
  description: 'Zobrazeni statistik nakupu z Rohlik.cz, ktere Rohlik sam nenabizi.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
