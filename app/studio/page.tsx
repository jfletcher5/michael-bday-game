'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentUser } from '../lib/auth';
import {
  createLevelDocument,
  getLevelDocument,
  getMyLevels,
  updateLevelDocument,
} from '../lib/firestore';
import type {
  LevelDocument,
  LevelPlatformObject,
  LevelBombObject,
  LevelScrollDirection,
} from '../lib/types';
import MenuBackground from '../components/MenuBackground';
import TopNav from '../components/TopNav';

type Tool = 'platform' | 'bomb' | 'spawner' | 'move';

/** Level Studio editor shell (MIE-19). */
export default function StudioPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black text-white flex items-center justify-center">Loading studio...</div>}>
      <StudioEditor />
    </Suspense>
  );
}

function StudioEditor() {
  const router = useRouter();
  const params = useSearchParams();
  const user = getCurrentUser();

  const [level, setLevel] = useState<LevelDocument | null>(null);
  const [myLevels, setMyLevels] = useState<LevelDocument[]>([]);
  const [tool, setTool] = useState<Tool>('platform');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef({ x: 0, y: 0, dragging: false, lastX: 0, lastY: 0 });

  const loadLevel = useCallback(async (id: string) => {
    const doc = await getLevelDocument(id);
    if (doc) setLevel(doc);
  }, []);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    getMyLevels(user.username).then(setMyLevels);
    const id = params.get('id');
    if (id) void loadLevel(id);
  }, [user, router, params, loadLevel]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !level) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.fillStyle = level.skyColor;
    ctx.fillRect(0, 0, width, height);

    const ox = panRef.current.x;
    const oy = panRef.current.y;

    level.platforms.forEach((p) => {
      ctx.fillStyle = p.isFinish ? '#22c55e' : '#64748b';
      ctx.fillRect(p.x + ox, p.y + oy, p.width * p.scale, p.height * p.scale);
      if (selectedId === p.id) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x + ox, p.y + oy, p.width * p.scale, p.height * p.scale);
      }
    });

    level.bombs.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x + ox, b.y + oy, 12 * (b.scale ?? 1), 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
    });

    if (level.ballSpawner) {
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(level.ballSpawner.x + ox, level.ballSpawner.y + oy, 14, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [level, selectedId]);

  useEffect(() => {
    draw();
  }, [draw]);

  const saveLevel = async () => {
    if (!level) return;
    setSaving(true);
    try {
      await updateLevelDocument(level);
    } finally {
      setSaving(false);
    }
  };

  const newProject = async () => {
    if (!user) return;
    const created = await createLevelDocument(user.username);
    setLevel(created);
    setMyLevels((prev) => [created, ...prev]);
    router.replace(`/studio?id=${created.id}`);
  };

  const placeAt = (canvasX: number, canvasY: number) => {
    if (!level) return;
    const x = canvasX - panRef.current.x;
    const y = canvasY - panRef.current.y;
    const id = `obj-${Date.now()}`;

    if (tool === 'spawner') {
      setLevel({ ...level, ballSpawner: { x, y } });
      return;
    }
    if (tool === 'platform') {
      setLevel({
        ...level,
        platforms: [
          ...level.platforms,
          { id, x, y, width: 120, height: 16, rotation: 0, scale: 1, isFinish: false },
        ],
      });
      setSelectedId(id);
      return;
    }
    if (tool === 'bomb') {
      setLevel({ ...level, bombs: [...level.bombs, { id, x, y, scale: 1 }] });
      setSelectedId(id);
    }
  };

  const nudgeSelected = (dx: number, dy: number) => {
    if (!level || !selectedId) return;
    setLevel({
      ...level,
      platforms: level.platforms.map((p) =>
        p.id === selectedId ? { ...p, x: p.x + dx, y: p.y + dy } : p,
      ),
      bombs: level.bombs.map((b) =>
        b.id === selectedId ? { ...b, x: b.x + dx, y: b.y + dy } : b,
      ),
    });
  };

  const deleteSelected = () => {
    if (!level || !selectedId) return;
    setLevel({
      ...level,
      platforms: level.platforms.filter((p) => p.id !== selectedId),
      bombs: level.bombs.filter((b) => b.id !== selectedId),
    });
    setSelectedId(null);
  };

  const selectedPlatform = level?.platforms.find((p) => p.id === selectedId);

  if (!user) return null;

  return (
    <MenuBackground className="min-h-screen flex flex-col">
      <TopNav user={user} />
      <div className="flex-1 flex flex-col lg:flex-row gap-2 p-2 pt-20">
        {/* Explorer */}
        <aside className="lg:w-56 bg-white/95 rounded-xl p-3 text-sm shadow">
          <p className="font-bold mb-2">My Levels</p>
          <button type="button" onClick={newProject} className="w-full mb-2 py-1 bg-purple-600 text-white rounded-lg">
            + New
          </button>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {myLevels.map((l) => (
              <li key={l.id}>
                <button type="button" className="text-left w-full hover:underline" onClick={() => loadLevel(l.id)}>
                  {l.name}
                </button>
              </li>
            ))}
          </ul>
          <p className="font-bold mt-3 mb-1">Workspace</p>
          <p className="text-gray-600">Platforms: {level?.platforms.length ?? 0}</p>
          <p className="text-gray-600">Bombs: {level?.bombs.length ?? 0}</p>
          <p className="font-bold mt-3 mb-1">ScreenScroll</p>
          <select
            className="w-full border rounded p-1"
            value={level?.screenScroll ?? 'down'}
            disabled={!level}
            onChange={(e) =>
              level && setLevel({ ...level, screenScroll: e.target.value as LevelScrollDirection })
            }
          >
            <option value="down">Down</option>
            <option value="up">Up</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
          <p className="font-bold mt-3 mb-1">Lighting</p>
          <input
            type="color"
            disabled={!level}
            value={level?.skyColor ?? '#1a1a2e'}
            onChange={(e) => level && setLevel({ ...level, skyColor: e.target.value })}
            className="w-full h-8"
          />
        </aside>

        {/* Canvas + toolbar */}
        <div className="flex-1 flex flex-col min-h-[400px]">
          <div className="flex flex-wrap gap-2 mb-2">
            {(['platform', 'bomb', 'spawner', 'move'] as Tool[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTool(t)}
                className={`px-3 py-1 rounded-lg text-sm capitalize ${tool === t ? 'bg-purple-600 text-white' : 'bg-white'}`}
              >
                {t}
              </button>
            ))}
            <button type="button" onClick={() => setShowSettings(true)} className="px-3 py-1 rounded-lg bg-white text-sm">
              Level Settings
            </button>
            <button type="button" onClick={saveLevel} disabled={!level || saving} className="px-3 py-1 rounded-lg bg-green-600 text-white text-sm">
              Save to Game
            </button>
            <button
              type="button"
              disabled={!level}
              onClick={() => level && router.push(`/game?levelId=${level.id}`)}
              className="px-3 py-1 rounded-lg bg-emerald-500 text-white text-sm"
            >
              ▶ Test
            </button>
            <button type="button" onClick={() => router.push('/levels')} className="px-3 py-1 rounded-lg bg-gray-200 text-sm">
              ← Search
            </button>
          </div>

          {tool === 'move' && (
            <div className="flex gap-1 mb-2 justify-center">
              <button type="button" onClick={() => nudgeSelected(0, -10)} className="px-2 py-1 bg-white rounded">N</button>
              <button type="button" onClick={() => nudgeSelected(-10, 0)} className="px-2 py-1 bg-white rounded">W</button>
              <button type="button" onClick={() => nudgeSelected(10, 0)} className="px-2 py-1 bg-white rounded">E</button>
              <button type="button" onClick={() => nudgeSelected(0, 10)} className="px-2 py-1 bg-white rounded">S</button>
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={900}
            height={520}
            className="w-full max-w-4xl border border-gray-300 rounded-xl bg-slate-900 touch-none"
            onMouseDown={(e) => {
              if (tool === 'move') {
                panRef.current.dragging = true;
                panRef.current.lastX = e.clientX;
                panRef.current.lastY = e.clientY;
                return;
              }
              const rect = e.currentTarget.getBoundingClientRect();
              placeAt(e.clientX - rect.left, e.clientY - rect.top);
            }}
            onMouseMove={(e) => {
              if (!panRef.current.dragging) return;
              panRef.current.x += e.clientX - panRef.current.lastX;
              panRef.current.y += e.clientY - panRef.current.lastY;
              panRef.current.lastX = e.clientX;
              panRef.current.lastY = e.clientY;
              draw();
            }}
            onMouseUp={() => {
              panRef.current.dragging = false;
            }}
          />

          {!level && (
            <p className="text-white text-center mt-4">Create a new project or open one from the list.</p>
          )}
        </div>

        {/* Properties */}
        <aside className="lg:w-52 bg-white/95 rounded-xl p-3 text-sm shadow">
          <p className="font-bold mb-2">Properties</p>
          {selectedPlatform ? (
            <>
              <label className="block text-xs mb-1">Scale</label>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={selectedPlatform.scale}
                onChange={(e) => {
                  if (!level) return;
                  const scale = parseFloat(e.target.value);
                  setLevel({
                    ...level,
                    platforms: level.platforms.map((p) =>
                      p.id === selectedId ? { ...p, scale } : p,
                    ),
                  });
                }}
                className="w-full mb-2"
              />
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={!!selectedPlatform.isFinish}
                  onChange={(e) => {
                    if (!level) return;
                    setLevel({
                      ...level,
                      platforms: level.platforms.map((p) =>
                        p.id === selectedId ? { ...p, isFinish: e.target.checked } : p,
                      ),
                    });
                  }}
                />
                Finish platform
              </label>
              <button type="button" onClick={deleteSelected} className="w-full py-1 bg-red-500 text-white rounded-lg">
                Delete
              </button>
            </>
          ) : (
            <p className="text-gray-500">Select an object</p>
          )}
        </aside>
      </div>

      {showSettings && level && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-lg mb-3">Level Settings</h3>
            <label className="block text-sm mb-1">Name</label>
            <input
              className="w-full border rounded p-2 mb-3"
              value={level.name}
              onChange={(e) => setLevel({ ...level, name: e.target.value.slice(0, 40) })}
            />
            <label className="block text-sm mb-1">Description</label>
            <textarea
              className="w-full border rounded p-2 mb-3"
              value={level.description}
              onChange={(e) => setLevel({ ...level, description: e.target.value.slice(0, 200) })}
            />
            <label className="block text-sm mb-1">Visibility</label>
            <select
              className="w-full border rounded p-2 mb-4"
              value={level.visibility}
              onChange={(e) =>
                setLevel({ ...level, visibility: e.target.value as 'public' | 'private' })
              }
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
            <button type="button" className="w-full py-2 bg-purple-600 text-white rounded-lg" onClick={() => setShowSettings(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </MenuBackground>
  );
}
