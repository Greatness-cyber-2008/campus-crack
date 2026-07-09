'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

interface AttemptRow {
  id: string;
  score: number;
  submitted_at: string;
}
interface TopicStat {
  topic: string;
  average: number;
  count: number;
}

const MIN_QUESTIONS_PER_TOPIC = 2; // avoid drawing conclusions from a single question

export default function AnalyticsPage() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [topicStats, setTopicStats] = useState<TopicStat[]>([]);
  const [hasEnoughData, setHasEnoughData] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: attemptData } = await supabase
        .from('attempts')
        .select('id, score, submitted_at')
        .eq('user_id', user.id)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true });

      const attemptRows = (attemptData || []) as AttemptRow[];
      setAttempts(attemptRows);

      if (attemptRows.length === 0) {
        setHasEnoughData(false);
        setLoading(false);
        return;
      }

      const attemptIds = attemptRows.map((a) => a.id);

      const { data: answerData } = await supabase
        .from('answers')
        .select('marks_awarded, is_correct, self_rating, attempt_id, questions(topic)')
        .in('attempt_id', attemptIds);

      // Aggregate normalized (0-100) scores per topic
      const topicTotals: Record<string, { sum: number; count: number }> = {};

      (answerData || []).forEach((a: any) => {
        const topic: string | null = a.questions?.topic;
        if (!topic) return; // skip answers whose question has no topic tag (e.g. generated before this feature)

        let normalizedScore: number | null = null;
        if (a.is_correct !== null && a.is_correct !== undefined) {
          normalizedScore = a.is_correct ? 100 : 0;
        } else if (a.self_rating) {
          normalizedScore = a.self_rating === 'nailed_it' ? 100 : a.self_rating === 'close' ? 50 : 0;
        }
        if (normalizedScore === null) return;

        if (!topicTotals[topic]) topicTotals[topic] = { sum: 0, count: 0 };
        topicTotals[topic].sum += normalizedScore;
        topicTotals[topic].count += 1;
      });

      const stats: TopicStat[] = Object.entries(topicTotals)
        .filter(([, v]) => v.count >= MIN_QUESTIONS_PER_TOPIC)
        .map(([topic, v]) => ({ topic, average: Math.round(v.sum / v.count), count: v.count }))
        .sort((a, b) => a.average - b.average);

      setTopicStats(stats);
      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return (
      <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <p className="text-slate">Loading your analytics…</p>
      </main>
    );
  }

  const trendData = attempts.map((a, i) => ({
    name: `#${i + 1}`,
    score: a.score,
    date: new Date(a.submitted_at).toLocaleDateString(),
  }));

  const weakestTopics = topicStats.slice(0, 5);

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav active="Analytics" />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">Your analytics</h1>
        <p className="text-slate mb-8 text-sm">See your progress and exactly where to focus next.</p>

        {!hasEnoughData ? (
          <div className="text-center py-16 border border-white/10 rounded-2xl">
            <p className="text-slate mb-2">No practice attempts yet.</p>
            <p className="text-slate text-sm">Complete a few practice sets and your analytics will show up here.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Score trend */}
            <section>
              <h2 className="font-semibold mb-4">Score trend over time</h2>
              <div className="border border-white/10 rounded-2xl p-4 sm:p-6 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#8B92A833" />
                    <XAxis dataKey="name" stroke="#8B92A8" fontSize={12} />
                    <YAxis stroke="#8B92A8" fontSize={12} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: '#1B2140', border: '1px solid #ffffff1a', borderRadius: 8 }}
                      labelStyle={{ color: '#F5F0E1' }}
                      formatter={(value: any) => [`${value}%`, 'Score']}
                      labelFormatter={(label, payload) => (payload?.[0]?.payload ? payload[0].payload.date : label)}
                    />
                    <Line type="monotone" dataKey="score" stroke="#E8B84B" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-slate text-xs mt-2">
                Across {attempts.length} completed attempt{attempts.length === 1 ? '' : 's'}.
              </p>
            </section>

            {/* Weak topics */}
            <section>
              <h2 className="font-semibold mb-4">Your weakest topics</h2>
              {weakestTopics.length === 0 ? (
                <div className="border border-white/10 rounded-2xl p-6 text-center text-slate text-sm">
                  Not enough data per topic yet — keep practicing and specific weak spots will show up
                  here. (Older question sets generated before this feature won't have topic tags.)
                </div>
              ) : (
                <>
                  <div className="border border-white/10 rounded-2xl p-4 sm:p-6 h-64 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weakestTopics} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#8B92A833" />
                        <XAxis type="number" domain={[0, 100]} stroke="#8B92A8" fontSize={12} />
                        <YAxis
                          type="category"
                          dataKey="topic"
                          stroke="#8B92A8"
                          fontSize={11}
                          width={140}
                          tickFormatter={(t: string) => (t.length > 20 ? t.slice(0, 20) + '…' : t)}
                        />
                        <Tooltip
                          contentStyle={{ background: '#1B2140', border: '1px solid #ffffff1a', borderRadius: 8 }}
                          labelStyle={{ color: '#F5F0E1' }}
                          formatter={(value: any) => [`${value}%`, 'Average score']}
                        />
                        <Bar dataKey="average" radius={[0, 6, 6, 0]}>
                          {weakestTopics.map((t, i) => (
                            <Cell key={i} fill={t.average < 50 ? '#C23B22' : '#E8B84B'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {weakestTopics.map((t) => (
                      <div
                        key={t.topic}
                        className="flex items-center justify-between border border-white/10 rounded-xl px-4 py-3 text-sm"
                      >
                        <span className="truncate mr-3">{t.topic}</span>
                        <span className={`shrink-0 font-mono ${t.average < 50 ? 'text-stamp' : 'text-gold'}`}>
                          {t.average}% ({t.count} qs)
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
