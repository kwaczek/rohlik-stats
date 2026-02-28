import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://rohlik-stats.cz';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: 'Rohlik Stats — Statistiky nákupů na Rohlik.cz',
  description:
    'Analyzujte své nákupy na Rohlik.cz — měsíční útraty, oblíbené produkty, rozložení kategorií a historie cen. Statistiky, které Rohlík sám nenabízí.',
  keywords: ['rohlik', 'statistiky', 'nákupy', 'rohlík', 'analýza', 'útrata', 'rohlik.cz', 'historie nákupů'],
  openGraph: {
    title: 'Rohlik Stats — Statistiky nákupů na Rohlik.cz',
    description:
      'Analyzujte své nákupy na Rohlik.cz — měsíční útraty, oblíbené produkty, rozložení kategorií a historie cen.',
    type: 'website',
    locale: 'cs_CZ',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rohlik Stats — Statistiky nákupů na Rohlik.cz',
    description:
      'Analyzujte své nákupy na Rohlik.cz — měsíční útraty, oblíbené produkty, rozložení kategorií a historie cen.',
  },
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
      <body suppressHydrationWarning>
        {children}
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <Script
            src="https://cloud.umami.is/script.js"
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
