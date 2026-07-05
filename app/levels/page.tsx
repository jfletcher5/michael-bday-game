'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '../lib/auth';
import { getPopularPublicLevels } from '../lib/firestore';
import type { LevelDocument } from '../lib/types';
import MenuBackground from '../components/MenuBackground';
import TopNav from '../components/TopNav';
import { PageHeader } from '../components/ui';

/** Browse popular public levels + open Level Studio (MIE-19). */
export default function LevelsPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [popular, setPopular] = useState<LevelDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    getPopularPublicLevels(5).then(setPopular).finally(() => setLoading(false));
  }, [router, user]);

  if (!user) return null;

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
              className="min-h-[44px] px-4 py-2 bg-purple-600 text-white rounded-xl font-medium"
            >
              Level Studio
            </button>
          </div>

          <h2 className="text-lg font-bold text-gray-800 mb-3">Most Popular</h2>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : popular.length === 0 ? (
            <p className="text-gray-500">No public levels yet — be the first in Level Studio!</p>
          ) : (
            <ul className="space-y-3">
              {popular.map((level) => (
                <li
                  key={level.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100"
                >
                  <div>
                    <p className="font-semibold text-gray-800">{level.name}</p>
                    <p className="text-xs text-gray-500">
                      by {level.authorUsername} · {level.playCount} plays
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/game?levelId=${level.id}`)}
                    className="min-h-[40px] px-3 py-1 bg-green-600 text-white rounded-lg text-sm"
                  >
                    Play
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </MenuBackground>
  );
}
