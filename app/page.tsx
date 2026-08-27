import Link from 'next/link';

const DISCIPLINES = [
  { label: 'Computing', hint: 'Trace logic, spot bugs, know your Big-O' },
  { label: 'Medical & Nursing', hint: 'Clinical vignettes, not just definitions' },
  { label: 'Commercial', hint: 'Calculations + theory, marked the way lecturers mark' },
  { label: 'Engineering', hint: 'Working shown, units checked' },
  { label: 'Law', hint: 'Fact patterns, IRAC-structured answers' },
  { label: 'Science & Arts', hint: 'Applied questions, not pure recall' },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-ink text-paper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'CampusCrack',
            applicationCategory: 'EducationalApplication',
            operatingSystem: 'Web',
            url: 'https://campuscrack.com.ng',
            description:
              'Upload your lecture notes and PDFs and get CBT or Written practice questions, flashcards, and a week-by-week study plan built for your exact course.',
            offers: {
              '@type': 'Offer',
              price: '3500',
              priceCurrency: 'NGN',
              description: 'Full access per semester',
            },
            audience: {
              '@type': 'EducationalAudience',
              educationalRole: 'student',
            },
          }),
        }}
      />

      {/* NAV */}
      <nav className="flex items-center justify-between px-4 sm:px-6 md:px-12 py-4 sm:py-6 border-b border-white/10">
        <span className="font-display text-sm sm:text-lg tracking-tight">CAMPUSCRACK</span>
        <div className="flex items-center gap-3 sm:gap-6 text-xs sm:text-sm">
          <Link href="/pricing" className="hidden sm:inline text-slate hover:text-paper transition">
            Pricing
          </Link>
          <Link
            href="/login"
            className="text-slate hover:text-paper transition"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="bg-gold text-ink font-semibold px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm hover:brightness-110 transition whitespace-nowrap"
          >
            Start free
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="px-4 sm:px-6 md:px-12 pt-10 sm:pt-16 pb-16 sm:pb-24 max-w-6xl mx-auto grid md:grid-cols-[1.3fr_1fr] gap-8 sm:gap-12 items-center">
        <div>
          <p className="uppercase tracking-[0.2em] text-stamp text-xs font-semibold mb-4">
            Built for Nigerian university exams
          </p>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-[1.1] sm:leading-[1.05] mb-6">
            UPLOAD YOUR NOTES.
            <br />
            WALK IN KNOWING
            <br />
            YOU'LL <span className="text-gold">CRACK IT.</span>
          </h1>
          <p className="text-slate text-base sm:text-lg max-w-xl mb-8 leading-relaxed">
            Drop in your lecture notes or PDFs and get practice questions built the way your course
            actually examines you — CBT-style timed MCQs, or written theory questions with model
            answers and marking points. Tuned for Computing, Medical, Commercial, Engineering, Law,
            Science and Arts students.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/signup"
              className="bg-stamp text-paper font-semibold px-6 py-3 rounded-full hover:brightness-110 transition"
            >
              Upload your first note — free
            </Link>
            <span className="text-slate text-sm">No card required to try it</span>
          </div>
        </div>

        {/* Signature stamp element */}
        <div className="flex justify-center md:justify-end">
          <div className="relative">
            <div className="grade-stamp stamp-gold w-40 h-40 sm:w-56 sm:h-56 md:w-64 md:h-64 flex-col text-center p-4 sm:p-6">
              <span className="text-3xl sm:text-4xl md:text-5xl">92%</span>
              <span className="text-[10px] sm:text-xs mt-2 tracking-widest">CRACKED</span>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="px-4 sm:px-6 md:px-12 py-14 sm:py-20 border-t border-white/10 bg-inkLight">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display text-xl sm:text-2xl md:text-3xl mb-10 sm:mb-12">HOW IT WORKS</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-8 sm:gap-10">
            <div>
              <p className="font-mono text-gold text-sm mb-3">STEP 1</p>
              <h3 className="text-xl font-semibold mb-2">Upload your material</h3>
              <p className="text-slate leading-relaxed">
                PDFs, lecture slides converted to notes, or plain text — from any course, any level.
              </p>
            </div>
            <div>
              <p className="font-mono text-gold text-sm mb-3">STEP 2</p>
              <h3 className="text-xl font-semibold mb-2">Choose your exam format</h3>
              <p className="text-slate leading-relaxed">
                CBT for timed multiple choice practice, or Written for theory questions with model
                answers and marking points you can self-grade against.
              </p>
            </div>
            <div>
              <p className="font-mono text-gold text-sm mb-3">STEP 3</p>
              <h3 className="text-xl font-semibold mb-2">Practice, get scored, improve</h3>
              <p className="text-slate leading-relaxed">
                Sit the practice exam under real conditions, see exactly where you lost marks, and
                regenerate a fresh set from the same material.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DISCIPLINES */}
      <section className="px-4 sm:px-6 md:px-12 py-14 sm:py-20 border-t border-white/10">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display text-xl sm:text-2xl md:text-3xl mb-2">MADE FOR YOUR COURSE</h2>
          <p className="text-slate mb-10 sm:mb-12 text-sm sm:text-base">
            Questions are shaped by how your discipline actually examines you — not generic trivia.
          </p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {DISCIPLINES.map((d) => (
              <div
                key={d.label}
                className="border border-white/10 rounded-2xl p-5 sm:p-6 hover:border-gold/40 transition"
              >
                <h3 className="font-semibold text-paper mb-2">{d.label}</h3>
                <p className="text-slate text-sm leading-relaxed">{d.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 sm:px-6 md:px-12 py-16 sm:py-24 border-t border-white/10 bg-inkLight text-center">
        <h2 className="font-display text-2xl sm:text-3xl md:text-4xl mb-6 max-w-2xl mx-auto leading-tight">
          YOUR NEXT EXAM IS ALREADY WRITTEN. GO PRACTICE IT.
        </h2>
        <Link
          href="/signup"
          className="inline-block bg-gold text-ink font-semibold px-8 py-4 rounded-full hover:brightness-110 transition"
        >
          Get started free
        </Link>
      </section>

      <footer className="px-4 sm:px-6 md:px-12 py-8 text-slate text-xs sm:text-sm border-t border-white/10 flex flex-col sm:flex-row gap-2 sm:gap-0 justify-between text-center sm:text-left">
        <span>© {new Date().getFullYear()} CampusCrack</span>
        <span>Made for Nigerian university students</span>
      </footer>
    </main>
  );
}