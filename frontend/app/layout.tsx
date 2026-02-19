import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  metadataBase: new URL('https://scholargraph3d.com'),
  title: {
    default: 'ScholarGraph3D — Explore Academic Literature in 3D',
    template: '%s — ScholarGraph3D',
  },
  description:
    'Explore academic papers as an interactive 3D knowledge graph. Search by keyword, discover clusters, and navigate research topics visually.',
  keywords: [
    'academic papers',
    'research visualization',
    'knowledge graph',
    '3D graph',
    'literature review',
    'semantic scholar',
    'openAlex',
  ],
  authors: [{ name: 'ScholarGraph3D' }],
  openGraph: {
    type: 'website',
    siteName: 'ScholarGraph3D',
    title: 'ScholarGraph3D — Explore Academic Literature in 3D',
    description:
      'Explore academic papers as an interactive 3D knowledge graph.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ScholarGraph3D',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ScholarGraph3D — Explore Academic Literature in 3D',
    description:
      'Explore academic papers as an interactive 3D knowledge graph.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="bg-background text-text-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
