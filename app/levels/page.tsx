'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '../lib/auth';
import {
  getPopularPublicLevels,
  getRecentPublicLevels,
  searchPublicLevels,
  getMyLevels,
} from '../lib/firestore';
import type { LevelDocument } from '../lib/types';
import MenuBackground from '../components/MenuBackground';
import TopNav from '../components/TopNav';
import { PageHeader } from '../components/ui';

/** Browse/search public levels and open Level Studio (MIE-19). */
export default function LevelsPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [popular, setPopular] = useState<LevelDocument[]>([]);
  const [recent, setRecent] = useState<LevelDocument[]>([]);
  const [myLevels, setMyLevels] = useState<LevelDocument[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<LevelDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    Promise.all([
      getPopularPublicLevels(5),
      getRecentPublicLevels(10),
      getMyLevels(user),
    ])
      .then(([pop, rec, mine]) => {
        setPopular(pop);
        setRecent(rec);
        setMyLevels(mine);
      })
      .catch(() => setError('Failed to load levels. Check your connection or Firestore indexes.'))
      .finally(() => setLoading(false));
  }, [router, user]);

  // Only fetch when there is a term — empty UI uses derived [] (avoids setState-in-effect lint).
  useEffect(() => {
    if (!searchTerm.trim()) return;
    const timer = setTimeout(() => {
      searchPublicLevels(searchTerm, 20)
        .then(setSearchResults)
        .catch(() => setSearchResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const visibleSearchResults = searchTerm.trim() ? searchResults : [];

  if (!user) return null;

  const renderLevelRow = (level: LevelDocument) => (
    <li
      key={level.id}
      className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 gap-3"
    >
      <div className="min-w-0">
        <p className="font-semibold text-gray-800 truncate">{level.name}</p>
        <p className="text-xs text-gray-500 truncate">
          by {level.authorUsername} · {level.playCount} plays
          {level.visibility === 'private' ? ' · private' : ''}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        {level.authorUsername === user.username && (
          <button
            type="button"
            onClick={() => router.push(`/studio?id=${level.id}`)}
            className="min-h-[40px] px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push(`/game?levelId=${level.id}`)}
          className="min-h-[40px] px-3 py-1 bg-green-600 text-white rounded-lg text-sm focus-visible:ring-2 focus-visible:ring-green-400"
        >
          Play
        </button>
      </div>
    </li>
  );

  return (
    <MenuBackground className="min-h-screen p-4 py-20">
      <TopNav user={user} transparent />
      <div className="max-w-2xl mx-auto animate-page-in">
        <PageHeader />
        <main className="bg-white rounded-3xl shadow-glow p-6 ring-1 ring-black/5">
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              type="button"
              onClick={() => router.push('/studio')}
              className="min-h-[44px] px-4 py-2 bg-purple-600 text-white rounded-xl font-medium focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              Level Studio
            </button>
          </div>

          <label htmlFor="level-search" className="block text-sm font-medium text-gray-700 mb-1">
            Search Levels
          </label>
          <input
            id="level-search"
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or author…"
            className="w-full border rounded-xl px-3 py-2 mb-6 focus-visible:ring-2 focus-visible:ring-purple-400"
            autoComplete="off"
          />

          {loading ? (
            <p className="text-gray-500">Loading…</p>
          ) : error ? (
            <p className="text-red-600">{error}</p>
          ) : (
            <div className="space-y-8">
              {searchTerm.trim() && (
                <section>
                  <h2 className="text-lg font-bold text-gray-800 mb-3">Search Results</h2>
                  {visibleSearchResults.length === 0 ? (
                    <p className="text-gray-500">No matching public levels.</p>
                  ) : (
                    <ul className="space-y-3">{visibleSearchResults.map(renderLevelRow)}</ul>
                  )}
                </section>
              )}

              <section>
                <h2 className="text-lg font-bold text-gray-800 mb-3">My Levels</h2>
                {myLevels.length === 0 ? (
                  <p className="text-gray-500">No levels yet — open Level Studio to create one.</p>
                ) : (
                  <ul className="space-y-3">{myLevels.slice(0, 10).map(renderLevelRow)}</ul>
                )}
              </section>

              <section>
                <h2 className="text-lg font-bold text-gray-800 mb-3">Most Popular</h2>
                {popular.length === 0 ? (
                  <p className="text-gray-500">No public levels yet — be the first in Level Studio!</p>
                ) : (
                  <ul className="space-y-3">{popular.map(renderLevelRow)}</ul>
                )}
              </section>

              <section>
                <h2 className="text-lg font-bold text-gray-800 mb-3">Recently Updated</h2>
                {recent.length === 0 ? (
                  <p className="text-gray-500">No recent public levels.</p>
                ) : (
                  <ul className="space-y-3">{recent.map(renderLevelRow)}</ul>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </MenuBackground>
  );
}
