'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, setCurrentUser as persistCurrentUser } from '../lib/auth';
import {
  getUserData,
  getAllUsers,
  createGameEvent,
  subscribeToActiveEvents,
  deleteGameEvent,
  createBroadcastMessage,
  subscribeToActiveMessages,
  createPoll,
  subscribeToActivePoll,
  closePoll,
} from '../lib/firestore';
import { User, GameEvent, BroadcastMessage, Poll, GameEventType } from '../lib/types';
import { formatPrice } from '../lib/ballTypes';
import { getBallTypeById } from '../lib/ballTypes';
import VerifiedBadge from '../components/VerifiedBadge';

type Tab = 'events' | 'players' | 'polls' | 'messages';

const EVENT_TYPES: { id: GameEventType; label: string; emoji: string; description: string }[] = [
  { id: 'taco-rain', label: 'Taco Rain', emoji: '🌮', description: 'Tacos rain from the top of the screen.' },
  { id: 'meteor-shower', label: 'Meteor Shower', emoji: '☄️', description: 'Meteors streak across the screen.' },
];

const EVENT_DURATION_SEC = 5 * 60;

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('events');

  useEffect(() => {
    const cached = getCurrentUser();
    if (!cached) {
      router.push('/login');
      return;
    }

    // Check fresh isAdmin from Firestore — don't trust the cached flag.
    getUserData(cached.username).then((fresh) => {
      if (!fresh) {
        router.push('/login');
        return;
      }
      if (!fresh.isAdmin) {
        router.push('/');
        return;
      }
      persistCurrentUser(fresh);
      setUser(fresh);
      setIsLoading(false);
    });
  }, [router]);

  if (isLoading || !user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-4">
      <div className="max-w-5xl mx-auto">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-700 to-pink-700 px-4 sm:px-6 py-4 flex items-center justify-between">
            <h1 className="text-white text-xl sm:text-2xl font-bold flex items-center gap-2">
              🛠️ Admin Control
            </h1>
            <button
              onClick={() => router.push('/')}
              className="bg-white/15 text-white min-h-[36px] min-w-[36px] px-3 rounded-lg hover:bg-white/25 transition text-sm"
              aria-label="Close admin panel"
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 bg-gray-50">
            {(
              [
                { id: 'events', label: 'Events' },
                { id: 'players', label: 'Players' },
                { id: 'polls', label: 'Polls' },
                { id: 'messages', label: 'Messages' },
              ] as { id: Tab; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 py-3 text-sm font-medium transition border-b-2 -mb-px ${
                  tab === t.id
                    ? 'border-purple-600 text-purple-700 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4 sm:p-6 min-h-[420px]">
            {tab === 'events' && <EventsTab admin={user} />}
            {tab === 'players' && <PlayersTab />}
            {tab === 'polls' && <PollsTab admin={user} />}
            {tab === 'messages' && <MessagesTab admin={user} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// Events tab
// =============================================================

function EventsTab({ admin }: { admin: User }) {
  const [type, setType] = useState<GameEventType>('taco-rain');
  const [startNow, setStartNow] = useState(true);
  const [delayMin, setDelayMin] = useState(1);
  const [delaySec, setDelaySec] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [active, setActive] = useState<GameEvent[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToActiveEvents(setActive);
    return () => unsub();
  }, []);

  const handleSchedule = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const startAtMs = startNow ? Date.now() : Date.now() + (delayMin * 60 + delaySec) * 1000;
      await createGameEvent(type, startAtMs, EVENT_DURATION_SEC, admin.username);
      setFeedback('Event scheduled!');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to schedule event');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Schedule form */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Schedule an Event</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Event Type</label>
            <div className="grid grid-cols-2 gap-2">
              {EVENT_TYPES.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setType(e.id)}
                  className={`text-left p-3 rounded-lg border-2 transition ${
                    type === e.id
                      ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-200'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">{e.emoji}</div>
                  <div className="font-bold text-sm text-gray-800">{e.label}</div>
                  <div className="text-[11px] text-gray-500">{e.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
              <input
                type="checkbox"
                checked={startNow}
                onChange={(e) => setStartNow(e.target.checked)}
                className="w-4 h-4"
              />
              Start now
            </label>
            {!startNow && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">In</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={delayMin}
                  onChange={(e) => setDelayMin(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="w-16 border border-gray-300 rounded px-2 py-1 text-sm"
                />
                <span className="text-xs text-gray-600">min</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={delaySec}
                  onChange={(e) => setDelaySec(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="w-16 border border-gray-300 rounded px-2 py-1 text-sm"
                />
                <span className="text-xs text-gray-600">sec</span>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500">Duration: {EVENT_DURATION_SEC / 60} minutes</p>

          <button
            onClick={handleSchedule}
            disabled={submitting}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 hover:scale-[1.01] transition"
          >
            {submitting ? 'Scheduling...' : 'Schedule Event'}
          </button>

          {feedback && (
            <div className="text-xs text-center text-purple-600">{feedback}</div>
          )}
        </div>
      </div>

      {/* Upcoming / active list */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
          Active &amp; Upcoming ({active.length})
        </h2>
        {active.length === 0 ? (
          <div className="text-sm text-gray-400 italic border border-dashed border-gray-200 rounded-lg p-6 text-center">
            None scheduled
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((e) => {
              const meta = EVENT_TYPES.find((t) => t.id === e.type);
              const now = Date.now();
              const isActive = now >= e.startAtMs && now < e.startAtMs + e.durationSec * 1000;
              return (
                <div
                  key={e.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    isActive ? 'bg-green-50 border-green-300' : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <span className="text-2xl">{meta?.emoji ?? '✨'}</span>
                  <div className="flex-1">
                    <div className="font-bold text-sm text-gray-800">{meta?.label ?? e.type}</div>
                    <div className="text-[11px] text-gray-600">
                      {isActive
                        ? `Active — ${Math.max(0, Math.ceil((e.startAtMs + e.durationSec * 1000 - now) / 1000))}s left`
                        : `Starts in ${Math.max(0, Math.ceil((e.startAtMs - now) / 1000))}s`}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Stop ${meta?.label ?? e.type}?`)) {
                        deleteGameEvent(e.id).catch((err) =>
                          setFeedback(err instanceof Error ? err.message : 'Failed to stop event'),
                        );
                      }
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition"
                  >
                    Stop
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================
// Players tab
// =============================================================

function PlayersTab() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getAllUsers()
      .then((u) =>
        setUsers(u.sort((a, b) => (b.totalMeters ?? 0) - (a.totalMeters ?? 0))),
      )
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  const filtered = useMemo(() => {
    if (!users) return null;
    if (!search.trim()) return users;
    const term = search.trim().toUpperCase();
    return users.filter((u) => u.username.includes(term));
  }, [users, search]);

  if (error) return <div className="text-red-500 text-sm">{error}</div>;
  if (!filtered) return <div className="text-gray-500 text-sm">Loading players…</div>;

  return (
    <div>
      <div className="mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by initials…"
          className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <span className="ml-3 text-xs text-gray-500">{filtered.length} player(s)</span>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr className="border-b border-gray-200 text-left">
                <th className="py-2 px-3 font-semibold text-gray-700">Player</th>
                <th className="py-2 px-3 font-semibold text-gray-700 text-right">Coins</th>
                <th className="py-2 px-3 font-semibold text-gray-700 text-right">Meters</th>
                <th className="py-2 px-3 font-semibold text-gray-700">Selected Ball</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const ball = getBallTypeById(u.selectedBall);
                return (
                  <tr key={u.username} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold tracking-wide text-gray-800">{u.username}</span>
                        {u.verified && <VerifiedBadge size={14} />}
                        {u.isAdmin && (
                          <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                            ADMIN
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-yellow-600">
                      {formatPrice(u.totalCoins ?? 0)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-purple-600">
                      {formatPrice(u.totalMeters ?? 0)}
                    </td>
                    <td className="py-2 px-3 text-gray-600">{ball.name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// Polls tab
// =============================================================

function PollsTab({ admin }: { admin: User }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activePoll, setActivePoll] = useState<Poll | null>(null);

  useEffect(() => {
    const unsub = subscribeToActivePoll(setActivePoll);
    return () => unsub();
  }, []);

  const totalVotes = activePoll
    ? Object.values(activePoll.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0)
    : 0;

  const handleSend = async () => {
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) {
      setFeedback('Question required');
      return;
    }
    if (cleaned.length < 2) {
      setFeedback('At least 2 options required');
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await createPoll(question.trim(), cleaned, admin.username);
      setFeedback('Poll sent to all players!');
      setQuestion('');
      setOptions(['', '']);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to send poll');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Send a Poll</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What's your favorite ball?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Options</label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const next = [...options];
                      next[i] = e.target.value;
                      setOptions(next);
                    }}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                      className="text-red-500 hover:text-red-700 text-xs px-2 py-1"
                      aria-label="Remove option"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {options.length < 6 && (
                <button
                  onClick={() => setOptions([...options, ''])}
                  className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                >
                  + Add option
                </button>
              )}
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={submitting}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 hover:scale-[1.01] transition"
          >
            {submitting ? 'Sending...' : 'Send Poll'}
          </button>

          {feedback && <div className="text-xs text-center text-purple-600">{feedback}</div>}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Active Poll</h2>
        {!activePoll ? (
          <div className="text-sm text-gray-400 italic border border-dashed border-gray-200 rounded-lg p-6 text-center">
            No active poll
          </div>
        ) : (
          <div className="border border-purple-200 rounded-lg p-4 bg-purple-50/40">
            <div className="font-bold text-gray-800 mb-3">{activePoll.question}</div>
            <div className="space-y-2 mb-3">
              {activePoll.options.map((opt, i) => {
                const count = activePoll.counts?.[String(i)] ?? 0;
                const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs text-gray-700 mb-0.5">
                      <span>{opt}</span>
                      <span className="font-mono">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => closePoll(activePoll.id)}
              className="w-full bg-gray-700 text-white font-semibold py-2 rounded-lg text-sm hover:bg-gray-800 transition"
            >
              Close Poll
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================
// Messages tab
// =============================================================

function MessagesTab({ admin }: { admin: User }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [recent, setRecent] = useState<BroadcastMessage[]>([]);

  useEffect(() => {
    const unsub = subscribeToActiveMessages(setRecent);
    return () => unsub();
  }, []);

  const handleSend = async () => {
    if (!text.trim()) {
      setFeedback('Message required');
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await createBroadcastMessage(text.trim(), admin.username);
      setText('');
      setFeedback('Sent to all players!');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Broadcast Message</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your announcement…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={handleSend}
            disabled={submitting}
            className="bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold px-4 rounded-lg disabled:opacity-50"
          >
            {submitting ? 'Sending...' : 'Send'}
          </button>
        </div>
        {feedback && <div className="text-xs text-purple-600 mt-1.5">{feedback}</div>}
      </div>

      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Recent ({recent.length})</h2>
        {recent.length === 0 ? (
          <div className="text-sm text-gray-400 italic">No active broadcasts</div>
        ) : (
          <div className="space-y-2">
            {recent.map((m) => (
              <div key={m.id} className="text-sm border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="text-gray-800">{m.text}</div>
                <div className="text-[10px] text-gray-500 mt-1">
                  by {m.createdBy} · expires {new Date(m.expiresAtMs).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
