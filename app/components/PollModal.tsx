'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getCurrentUser } from '../lib/auth';
import {
  subscribeToActivePoll,
  getUserPollAnswer,
  submitPollAnswer,
} from '../lib/firestore';
import { Poll } from '../lib/types';

/**
 * Active-poll indicator that lives in the top bar on the home screen.
 *
 *  - Closed: a small pill labeled "📊 Poll" (pulses if the user hasn't voted).
 *  - Open: a popover with the question and either the voting UI or the
 *    live vote counts (if the user has already voted). Updates in real-time
 *    via the same `subscribeToActivePoll` listener as the admin panel.
 */
export default function PollModal() {
  const pathname = usePathname();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [answeredIndex, setAnsweredIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const username = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Capture the current user whenever the route changes (covers login).
  useEffect(() => {
    username.current = getCurrentUser()?.username ?? null;
  }, [pathname]);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) return;
    username.current = u.username;

    const unsub = subscribeToActivePoll(async (next) => {
      setPoll(next);
      if (!next) {
        setAnsweredIndex(null);
        setSelected(null);
        setOpen(false);
        return;
      }
      try {
        const idx = await getUserPollAnswer(next.id, u.username);
        setAnsweredIndex(idx);
      } catch (err) {
        console.error('Failed to read poll answer:', err);
      }
    });

    return () => unsub();
  }, [username.current]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSubmit = async () => {
    if (selected == null || !poll || !username.current) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitPollAnswer(poll.id, username.current, selected);
      setAnsweredIndex(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  // Polls only surface on the home screen.
  if (pathname !== '/') return null;
  if (!poll) return null;

  const hasVoted = answeredIndex != null;
  const totalVotes = Object.values(poll.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div
      ref={containerRef}
      className="fixed top-2 sm:top-3 left-1/2 -translate-x-1/2 z-[55]"
    >
      {/* Trigger pill */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`bg-black/30 backdrop-blur-sm text-white font-medium min-h-[36px] py-1.5 px-3 rounded-lg hover:bg-black/40 transition-all flex items-center gap-1.5 text-xs sm:text-sm border border-white/15 ${
          !hasVoted ? 'animate-pulse' : ''
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="text-base">📊</span>
        <span className="hidden sm:inline">Poll</span>
        {!hasVoted && (
          <span className="ml-1 text-[10px] bg-yellow-400 text-yellow-900 font-bold px-1.5 py-0.5 rounded-full">
            VOTE
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[min(92vw,360px)] bg-white rounded-xl shadow-2xl border border-gray-200 p-4">
          <div className="text-[10px] font-bold text-purple-600 uppercase tracking-wider mb-1">
            📊 Poll
          </div>
          <h3 className="text-sm font-bold text-gray-800 mb-3">{poll.question}</h3>

          {!hasVoted ? (
            <>
              <div className="space-y-1.5 mb-3">
                {poll.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => setSelected(i)}
                    className={`w-full text-left px-3 py-2 rounded-lg border-2 transition text-sm ${
                      selected === i
                        ? 'bg-purple-50 border-purple-500'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className={`font-medium ${selected === i ? 'text-purple-700' : 'text-gray-700'}`}>
                      {opt}
                    </span>
                  </button>
                ))}
              </div>

              {error && <div className="text-xs text-red-500 mb-2 text-center">{error}</div>}

              <button
                onClick={handleSubmit}
                disabled={selected == null || submitting}
                className={`w-full py-2 rounded-lg font-semibold text-sm transition ${
                  selected != null && !submitting
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:scale-[1.01]'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
              <p className="text-[10px] text-gray-400 text-center mt-1.5">One vote per player.</p>
            </>
          ) : (
            <>
              <div className="space-y-2 mb-1">
                {poll.options.map((opt, i) => {
                  const count = poll.counts?.[String(i)] ?? 0;
                  const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
                  const isMine = i === answeredIndex;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className={`${isMine ? 'font-bold text-purple-700' : 'text-gray-700'}`}>
                          {opt} {isMine && <span className="text-[10px]">(you)</span>}
                        </span>
                        <span className="font-mono text-gray-500">{count} · {pct}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isMine
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                              : 'bg-gray-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 text-center mt-2">
                {totalVotes} total vote{totalVotes === 1 ? '' : 's'}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
