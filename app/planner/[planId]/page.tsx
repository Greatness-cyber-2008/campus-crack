'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

interface PlanWeek {
  id: string;
  week_number: number;
  topic: string;
  description: string | null;
  study_tip: string | null;
}
interface PlanInfo {
  id: string;
  title: string;
  start_date: string;
  total_weeks: number;
  material_id: string | null;
  course_id: string | null;
}

function getCurrentWeekNumber(startDate: string): number {
  const start = new Date(startDate);
  const today = new Date();
  const diffMs = today.getTime() - start.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return diffWeeks;
}

// Builds the query string that lets the chat page auto-ask about this
// specific week the moment the student lands there, instead of opening
// to a blank chat with no idea what "this" refers to.
function buildAskAboutWeekLink(chatBase: string, week: PlanWeek): string {
  const parts = [`Explain this week's topic in more depth: ${week.topic}.`];
  if (week.description) parts.push(week.description);
  if (week.study_tip) parts.push(`Study tip to build on: ${week.study_tip}`);
  const autoAsk = parts.join(' ');
  return `${chatBase}?autoAsk=${encodeURIComponent(autoAsk)}`;
}

export default function StudyPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const { user } = useUser();
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [weeks, setWeeks] = useState<PlanWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: planData } = await supabase
        .from('study_plans')
        .select('id, title, start_date, total_weeks, material_id, course_id')
        .eq('id', planId)
        .single();

      const { data: weeksData } = await supabase
        .from('study_plan_weeks')
        .select('id, week_number, topic, description, study_tip')
        .eq('study_plan_id', planId)
        .order('week_number');

      setPlan(planData);
      setWeeks(weeksData || []);
      setLoading(false);
    })();
  }, [user, planId]);

  function startEdit(week: PlanWeek) {
    setEditingWeekId(week.id);
    setEditTopic(week.topic);
    setEditDescription(week.description || '');
  }

  async function saveEdit(weekId: string) {
    await supabase
      .from('study_plan_weeks')
      .update({ topic: editTopic, description: editDescription })
      .eq('id', weekId);

    setWeeks((prev) =>
      prev.map((w) => (w.id === weekId ? { ...w, topic: editTopic, description: editDescription } : w))
    );
    setEditingWeekId(null);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <p className="text-slate">Loading your study plan…</p>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <p className="text-slate">Study plan not found.</p>
      </main>
    );
  }

  const currentWeek = getCurrentWeekNumber(plan.start_date);
  const chatLink = plan.material_id ? `/chat/${plan.material_id}` : '/chat/general';

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-2xl font-semibold">{plan.title}</h1>
          {plan.course_id && (
            <Link href={`/courses/${plan.course_id}`} className="text-gold text-sm shrink-0">
              ← Course
            </Link>
          )}
        </div>
        <p className="text-slate mb-8 text-sm">
          {plan.total_weeks} weeks · started {new Date(plan.start_date).toLocaleDateString()}
        </p>

        <div className="space-y-3">
          {weeks.map((w) => {
            const isCurrent = w.week_number === currentWeek;
            const isPast = w.week_number < currentWeek;
            const isEditing = editingWeekId === w.id;

            return (
              <div
                key={w.id}
                className={`border rounded-xl p-4 sm:p-5 transition ${
                  isCurrent
                    ? 'border-gold bg-gold/10'
                    : isPast
                    ? 'border-white/10 opacity-60'
                    : 'border-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-mono ${isCurrent ? 'text-gold' : 'text-slate'}`}>
                    WEEK {w.week_number}
                    {isCurrent && ' · NOW'}
                  </span>
                  {!isEditing && (
                    <button onClick={() => startEdit(w)} className="text-slate hover:text-gold text-xs">
                      Edit
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      value={editTopic}
                      onChange={(e) => setEditTopic(e.target.value)}
                      className="w-full bg-inkLight border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-gold outline-none"
                      placeholder="Topic"
                    />
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={2}
                      className="w-full bg-inkLight border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-gold outline-none"
                      placeholder="Description (optional)"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(w.id)}
                        className="bg-gold text-ink text-xs font-semibold px-4 py-2 rounded-full"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingWeekId(null)}
                        className="text-slate text-xs px-4 py-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-medium">{w.topic}</p>
                    {w.description && <p className="text-slate text-sm mt-1">{w.description}</p>}
                    {w.study_tip && (
                      <p className="text-sm mt-2 text-gold/90 bg-gold/5 border border-gold/20 rounded-lg px-3 py-2">
                        💡 {w.study_tip}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Link
                        href={buildAskAboutWeekLink(chatLink, w)}
                        className="text-xs border border-white/10 px-3 py-1.5 rounded-full hover:border-gold/40 transition"
                      >
                        💬 Ask the tutor about this
                      </Link>
                      {plan.material_id && (
                        <>
                          <Link
                            href={`/generate?materialId=${plan.material_id}`}
                            className="text-xs border border-white/10 px-3 py-1.5 rounded-full hover:border-gold/40 transition"
                          >
                            📝 Practice this week
                          </Link>
                          <Link
                            href={`/flashcards/generate?materialId=${plan.material_id}`}
                            className="text-xs border border-white/10 px-3 py-1.5 rounded-full hover:border-gold/40 transition"
                          >
                            🗂️ Flashcards
                          </Link>
                        </>
                      )}
                      {plan.course_id && !plan.material_id && (
                        <Link
                          href={`/courses/${plan.course_id}`}
                          className="text-xs border border-white/10 px-3 py-1.5 rounded-full hover:border-gold/40 transition"
                        >
                          📝 Practice from a course file
                        </Link>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
