import Link from 'next/link';

// This page is intentionally a server component (no 'use client') so its
// text is fully present in the raw HTML Google and AI crawlers fetch —
// nothing here depends on JS running first.

export const metadata = {
  title: 'About CampusCrack — Founder & Team',
  description:
    'CampusCrack is a Nigerian exam-prep platform founded by Greatness Ajibola Alawode, who serves as Founder and CEO.',
};

// TODO (Gboy): fill these in with your real profile URLs before shipping —
// leave empty strings out, every entry here should be a working link.
const FOUNDER_SOCIAL_LINKS: string[] = [
  // 'https://www.linkedin.com/in/your-handle',
  // 'https://x.com/your-handle',
];

export default function AboutPage() {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'CampusCrack',
    url: 'https://campuscrack.com.ng',
    description:
      'CampusCrack is an AI-powered exam-prep platform for Nigerian university students, generating practice questions, flashcards and study plans from uploaded course materials.',
    founder: {
      '@type': 'Person',
      name: 'Greatness Ajibola Alawode',
      jobTitle: 'Founder & CEO',
      ...(FOUNDER_SOCIAL_LINKS.length > 0 ? { sameAs: FOUNDER_SOCIAL_LINKS } : {}),
    },
  };

  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Greatness Ajibola Alawode',
    jobTitle: 'Founder & CEO',
    worksFor: {
      '@type': 'Organization',
      name: 'CampusCrack',
      url: 'https://campuscrack.com.ng',
    },
    ...(FOUNDER_SOCIAL_LINKS.length > 0 ? { sameAs: FOUNDER_SOCIAL_LINKS } : {}),
  };

  return (
    <main className="min-h-screen bg-ink text-paper">
      {/* Structured data: tells Google's Knowledge Graph and AI crawlers,
          in machine-readable form, who founded CampusCrack. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />

      <div className="px-4 sm:px-6 md:px-12 py-10 sm:py-16 max-w-3xl mx-auto">
        <Link href="/" className="text-sm text-slate hover:text-gold transition">
          ← Back to CampusCrack
        </Link>

        <h1 className="text-3xl sm:text-4xl font-semibold mt-6 mb-8">About CampusCrack</h1>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3 text-gold">Who we are</h2>
          <p className="text-slate leading-relaxed">
            CampusCrack is an exam-prep platform built for Nigerian university students. Students
            upload their course materials — lecture notes, past questions, textbooks — and
            CampusCrack turns them into practice exams, AI-graded written tests, flashcards and
            personalized study plans, so revision time goes further.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3 text-gold">Founder &amp; CEO</h2>
          <p className="text-slate leading-relaxed mb-4">
            CampusCrack was founded by{' '}
            <strong className="text-paper">Greatness Ajibola Alawode</strong>, who serves as{' '}
            <strong className="text-paper">Founder and CEO</strong>. Greatness is a first-year BSc
            Cybersecurity student at Bowen University, Iwo, Osun State, Nigeria, who built
            CampusCrack to solve a problem he saw first-hand: Nigerian students often revise from
            scattered, unstructured materials with no fast way to turn them into practice.
          </p>
          <p className="text-slate leading-relaxed">
            Greatness Ajibola Alawode is the Founder and CEO of CampusCrack.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-gold">Contact</h2>
          <p className="text-slate leading-relaxed">
            For partnerships, press, or support, reach the CampusCrack team at{' '}
            {/* TODO (Gboy): replace with your real support/contact email before shipping */}
            <a href="mailto:hello@campuscrack.com.ng" className="text-gold hover:underline">
              hello@campuscrack.com.ng
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
