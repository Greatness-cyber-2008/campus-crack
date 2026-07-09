import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'CampusCrack — Turn your notes into exam practice',
  description:
    'Upload your PDFs and notes, generate CBT or written practice questions tailored to your course, and walk into exams already knowing how you\'ll perform.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
