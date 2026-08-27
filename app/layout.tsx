import './globals.css';
import type { Metadata, Viewport } from 'next';

const SITE_URL = 'https://campuscrack.com.ng';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'CampusCrack — AI Study App for Nigerian University Students',
    template: '%s | CampusCrack',
  },
  description:
    'Upload your lecture notes and PDFs and get CBT or Written practice questions, flashcards, and a week-by-week study plan built for your exact course. Free to start, ₦3,500 per semester for full access.',
  keywords: ['CampusCrack', 'Nigerian university exam prep', 'CBT practice app', 'study app Nigeria', 'flashcards app Nigeria', 'AI study tutor'],
  applicationName: 'CampusCrack',
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'CampusCrack',
    title: 'CampusCrack — AI Study App for Nigerian University Students',
    description: 'Upload your notes, get CBT or Written practice questions, daily flashcards, and a week-by-week study plan built for your exact course.',
    locale: 'en_NG',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CampusCrack — AI Study App for Nigerian University Students',
    description: 'Upload your notes, get CBT or Written practice questions, daily flashcards, and a week-by-week study plan built for your exact course.',
  },
  alternates: { canonical: SITE_URL },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 5 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
