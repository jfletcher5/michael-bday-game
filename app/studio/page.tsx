'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentUser } from '../lib/auth';
import {
  archiveLevelDocument,
  createLevelDocument,
  getLevelDocument,
  getMyLevels,
  updateLevelDocument,
} from '../lib/firestore';
import type { LevelDocument, LevelPlatformObject, LevelBombObject, LevelScrollDirection } from '../lib/types';
import { validateLevelDocument } from '../lib/levelValidation';
import {
  LEVEL_WORLD_WIDTH,
  LEVEL_WORLD_HEIGHT,
  LEVEL_BOMB_RADIUS,
  getAllLevelPlatforms,
  screenToWorld,
  getEditorScale,
  hitTestPlatform,
  hitTestBomb,
  hitTestSpawner,
  SPAWNER_PLATFORM_ID,
  type LevelEditorTool,
  type SelectedObject,
} from '../lib/levelWorld';
import MenuBackground from '../components/MenuBackground';
import TopNav from '../components/TopNav';

/** Level Studio editor (MIE-19) — virtual world coordinates shared with play mode. */
export default function StudioPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black text-white flex items-center justify-center">Loading studio…</div>}>
      <StudioEditor />
    </Suspense>
  );
}

function StudioEditor() {
  const router = useRouter();
  const params = useSearchParams();
  const user = getCurrentUser();

  const [level, setLevel] = useState<LevelDocument | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');
  const [myLevels, setMyLevels] = useState<LevelDocument[]>([]);
  const [tool, setTool] = useState<LevelEditorTool>('select');
  const [selected, setSelected] = useState<SelectedObject>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [settingsErrors, setSettingsErrors] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ kind: 'pan' | 'move'; startX: number; startY: number; originX: number; originY: number } | null>(null);

  const isDirty = level ? JSON.stringify(level) !== savedSnapshot : false;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !level) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.fillStyle = level.skyColor;
    ctx.fillRect(0, 0, width, height);

    const scale = getEditorScale(width, height);
    const offsetX = (width - LEVEL_WORLD_WIDTH * scale) / 2 + panRef.current.x;
    const offsetY = (height - LEVEL_WORLD_HEIGHT * scale) / 2 + panRef.current.y;

    const drawPlatform = (p: LevelPlatformObject, isSelected: boolean) => {
      const x = p.x * scale + offsetX;
      const y = p.y * scale + offsetY;
      const w = p.width * (p.scale || 1) * scale;
      const h = p.height * (p.scale || 1) * scale;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(((p.rotation ?? 0) * Math.PI) / 180);
      ctx.fillStyle = p.isFinish ? '#22c55e' : p.id === SPAWNER_PLATFORM_ID ? '#94a3b8' : '#64748b';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      if (isSelected) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
    };

    getAllLevelPlatforms(level).forEach((p) => {
      const isSelected = selected?.kind === 'platform' && selected.id === p.id;
      drawPlatform(p, isSelected);
    });

    level.bombs.forEach((b) => {
      const cx = b.x * scale + offsetX;
      const cy = b.y * scale + offsetY;
      const r = LEVEL_BOMB_RADIUS * (b.scale ?? 1) * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      if (selected?.kind === 'bomb' && selected.id === b.id) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    if (level.ballSpawner) {
      const cx = level.ballSpawner.x * scale + offsetX;
      const cy = level.ballSpawner.y * scale + offsetY;
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(cx, cy, 14 * scale, 0, Math.PI * 2);
      ctx.fill();
      if (selected?.kind === 'spawner') {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [level, selected]);

  useEffect(() => {
    draw();
  }, [draw]);

  const confirmDiscard = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm('You have unsaved changes. Continue without saving?');
  }, [isDirty]);

  const loadLevelById = useCallback(async (id: string) => {
    if (!user) return;
    if (!confirmDiscard()) return;
    setErrorMsg(null);
    const doc = await getLevelDocument(id, user);
    if (!doc) {
      setErrorMsg('Could not load that level.');
      return;
    }
    if (doc.authorUsername !== user.username) {
      setErrorMsg('You can only edit your own levels.');
      return;
    }
    setLevel(doc);
    setSavedSnapshot(JSON.stringify(doc));
    setSelected(null);
    router.replace(`/studio?id=${id}`);
  }, [user, router, confirmDiscard]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    getMyLevels(user)
      .then(setMyLevels)
      .catch(() => setErrorMsg('Failed to load your levels.'));
  }, [user, router]);

  // Deep-link load — no discard prompt on first open.
  useEffect(() => {
    const id = params.get('id');
    if (!id || !user) return;
    getLevelDocument(id, user).then((doc) => {
      if (!doc || doc.authorUsername !== user.username) {
        if (id) setErrorMsg('Could not open that level.');
        return;
      }
      setLevel(doc);
      setSavedSnapshot(JSON.stringify(doc));
    });
  }, [params, user]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const saveLevel = async (requirePublishable = false) => {
    if (!level || !user) return false;
    const validation = validateLevelDocument(level, requirePublishable || level.visibility === 'public');
    if (!validation.valid) {
      setErrorMsg(validation.errors.join(' '));
      return false;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const saved = await updateLevelDocument(user, level);
      setLevel(saved);
      setSavedSnapshot(JSON.stringify(saved));
      setStatusMsg('Saved to game.');
      setMyLevels((prev) => [saved, ...prev.filter((l) => l.id !== saved.id)]);
      return true;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const newProject = async () => {
    if (!user || !confirmDiscard()) return;
    setErrorMsg(null);
    try {
      const created = await createLevelDocument(user);
      setLevel(created);
      setSavedSnapshot(JSON.stringify(created));
      setSelected(null);
      setMyLevels((prev) => [created, ...prev]);
      router.replace(`/studio?id=${created.id}`);
      setStatusMsg('New project created.');
    } catch {
      setErrorMsg('Could not create a new level.');
    }
  };

  const archiveCurrent = async () => {
    if (!level || !user) return;
    if (!window.confirm(`Archive "${level.name}"?`)) return;
    try {
      await archiveLevelDocument(user, level.id);
      setMyLevels((prev) => prev.filter((l) => l.id !== level.id));
      setLevel(null);
      setSavedSnapshot('');
      setSelected(null);
      router.replace('/studio');
      setStatusMsg('Level archived.');
    } catch {
      setErrorMsg('Could not archive level.');
    }
  };

  const testLevel = async () => {
    if (!level) return;
    const ok = isDirty ? await saveLevel(false) : true;
    if (!ok) return;
    router.push(`/game?levelId=${level.id}&returnTo=studio`);
  };

  const updateLevelState = (updater: (prev: LevelDocument) => LevelDocument) => {
    setLevel((prev) => (prev ? updater(prev) : prev));
    setStatusMsg(null);
  };

  const placeAt = (wx: number, wy: number) => {
    if (!level) return;
    const id = `obj-${Date.now()}`;
    if (tool === 'spawner') {
      updateLevelState((prev) => ({ ...prev, ballSpawner: { x: wx, y: wy } }));
      setSelected({ kind: 'spawner' });
      return;
    }
    if (tool === 'platform') {
      updateLevelState((prev) => ({
        ...prev,
        platforms: [
          ...prev.platforms,
          { id, x: wx, y: wy, width: 120, height: 16, rotation: 0, scale: 1, isFinish: false },
        ],
      }));
      setSelected({ kind: 'platform', id });
      return;
    }
    if (tool === 'bomb') {
      updateLevelState((prev) => ({
        ...prev,
        bombs: [...prev.bombs, { id, x: wx, y: wy, scale: 1, rotation: 0 }],
      }));
      setSelected({ kind: 'bomb', id });
    }
  };

  const nudgeSelected = (dx: number, dy: number) => {
    if (!level || !selected) return;
    if (selected.kind === 'spawner' && level.ballSpawner) {
      updateLevelState((prev) => ({
        ...prev,
        ballSpawner: { x: prev.ballSpawner!.x + dx, y: prev.ballSpawner!.y + dy },
      }));
    } else if (selected.kind === 'platform') {
      updateLevelState((prev) => ({
        ...prev,
        platforms: prev.platforms.map((p) =>
          p.id === selected.id ? { ...p, x: p.x + dx, y: p.y + dy } : p,
        ),
      }));
    } else if (selected.kind === 'bomb') {
      updateLevelState((prev) => ({
        ...prev,
        bombs: prev.bombs.map((b) =>
          b.id === selected.id ? { ...b, x: b.x + dx, y: b.y + dy } : b,
        ),
      }));
    }
  };

  const deleteSelected = () => {
    if (!level || !selected) return;
    if (selected.kind === 'spawner') {
      updateLevelState((prev) => ({ ...prev, ballSpawner: null }));
    } else if (selected.kind === 'platform') {
      updateLevelState((prev) => ({
        ...prev,
        platforms: prev.platforms.filter((p) => p.id !== selected.id),
      }));
    } else if (selected.kind === 'bomb') {
      updateLevelState((prev) => ({
        ...prev,
        bombs: prev.bombs.filter((b) => b.id !== selected.id),
      }));
    }
    setSelected(null);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      if (e.key === 'Escape' && showSettings) setShowSettings(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSettings, selected, level]);

  const handlePointerDown = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !level) return;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const { x: wx, y: wy } = screenToWorld(sx, sy, canvas.width, canvas.height, panRef.current);

    if (tool === 'pan') {
      dragRef.current = { kind: 'pan', startX: sx, startY: sy, originX: panRef.current.x, originY: panRef.current.y };
      return;
    }

    if (tool === 'select') {
      if (hitTestSpawner(level.ballSpawner, wx, wy)) {
        setSelected({ kind: 'spawner' });
        dragRef.current = { kind: 'move', startX: wx, startY: wy, originX: level.ballSpawner!.x, originY: level.ballSpawner!.y };
        return;
      }
      const bomb = hitTestBomb(level.bombs, wx, wy);
      if (bomb) {
        setSelected({ kind: 'bomb', id: bomb.id });
        dragRef.current = { kind: 'move', startX: wx, startY: wy, originX: bomb.x, originY: bomb.y };
        return;
      }
      const platform = hitTestPlatform(getAllLevelPlatforms(level).filter((p) => p.id !== SPAWNER_PLATFORM_ID), wx, wy)
        ?? hitTestPlatform(getAllLevelPlatforms(level), wx, wy);
      if (platform && platform.id !== SPAWNER_PLATFORM_ID) {
        setSelected({ kind: 'platform', id: platform.id });
        dragRef.current = { kind: 'move', startX: wx, startY: wy, originX: platform.x, originY: platform.y };
        return;
      }
      setSelected(null);
      return;
    }

    placeAt(wx, wy);
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const drag = dragRef.current;
    if (!canvas || !drag || !level) return;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;

    if (drag.kind === 'pan') {
      panRef.current.x = drag.originX + (sx - drag.startX);
      panRef.current.y = drag.originY + (sy - drag.startY);
      draw();
      return;
    }

    const { x: wx, y: wy } = screenToWorld(sx, sy, canvas.width, canvas.height, panRef.current);
    const dx = wx - drag.startX;
    const dy = wy - drag.startY;
    if (!selected) return;

    if (selected.kind === 'spawner') {
      updateLevelState((prev) => ({
        ...prev,
        ballSpawner: { x: drag.originX + dx, y: drag.originY + dy },
      }));
    } else if (selected.kind === 'platform') {
      updateLevelState((prev) => ({
        ...prev,
        platforms: prev.platforms.map((p) =>
          p.id === selected.id ? { ...p, x: drag.originX + dx, y: drag.originY + dy } : p,
        ),
      }));
    } else if (selected.kind === 'bomb') {
      updateLevelState((prev) => ({
        ...prev,
        bombs: prev.bombs.map((b) =>
          b.id === selected.id ? { ...b, x: drag.originX + dx, y: drag.originY + dy } : b,
        ),
      }));
    }
  };

  const selectedPlatform =
    selected?.kind === 'platform' ? level?.platforms.find((p) => p.id === selected.id) : undefined;
  const selectedBomb =
    selected?.kind === 'bomb' ? level?.bombs.find((b) => b.id === selected.id) : undefined;

  if (!user) return null;

  return (
    <MenuBackground className="min-h-screen flex flex-col">
      <TopNav user={user} />
      <div className="flex-1 flex flex-col lg:flex-row gap-2 p-2 pt-20">
        <aside className="lg:w-56 bg-white/95 rounded-xl p-3 text-sm shadow" aria-label="Level explorer">
          <p className="font-bold mb-2">My Levels</p>
          <button
            type="button"
            onClick={newProject}
            className="w-full mb-2 py-2 bg-purple-600 text-white rounded-lg focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            + New Project
          </button>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {myLevels.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className={`text-left w-full hover:underline truncate focus-visible:ring-2 focus-visible:ring-purple-400 rounded px-1 ${level?.id === l.id ? 'font-semibold text-purple-700' : ''}`}
                  onClick={() => loadLevelById(l.id)}
                >
                  {l.name}
                  {l.visibility === 'private' ? ' (private)' : ''}
                </button>
              </li>
            ))}
          </ul>
          <p className="font-bold mt-3 mb-1">Workspace</p>
          <p className="text-gray-600">Platforms: {level?.platforms.length ?? 0}</p>
          <p className="text-gray-600">Bombs: {level?.bombs.length ?? 0}</p>
          <label htmlFor="screen-scroll" className="font-bold mt-3 mb-1 block">ScreenScroll</label>
          <select
            id="screen-scroll"
            className="w-full border rounded p-1 focus-visible:ring-2 focus-visible:ring-purple-400"
            value={level?.screenScroll ?? 'down'}
            disabled={!level}
            onChange={(e) =>
              level && updateLevelState((prev) => ({ ...prev, screenScroll: e.target.value as LevelScrollDirection }))
            }
          >
            <option value="down">Down</option>
            <option value="up">Up</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
          <label htmlFor="sky-color" className="font-bold mt-3 mb-1 block">Lighting</label>
          <input
            id="sky-color"
            type="color"
            disabled={!level}
            value={level?.skyColor ?? '#1a1a2e'}
            onChange={(e) => level && updateLevelState((prev) => ({ ...prev, skyColor: e.target.value }))}
            className="w-full h-8 focus-visible:ring-2 focus-visible:ring-purple-400"
          />
        </aside>

        <div className="flex-1 flex flex-col min-h-[400px]">
          <div className="flex flex-wrap gap-2 mb-2 items-center" role="toolbar" aria-label="Studio tools">
            {(['select', 'platform', 'bomb', 'spawner', 'pan'] as LevelEditorTool[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tool === t}
                onClick={() => setTool(t)}
                className={`px-3 py-1 rounded-lg text-sm capitalize focus-visible:ring-2 focus-visible:ring-purple-400 ${tool === t ? 'bg-purple-600 text-white' : 'bg-white'}`}
              >
                {t}
              </button>
            ))}
            <button type="button" onClick={() => setShowSettings(true)} disabled={!level} className="px-3 py-1 rounded-lg bg-white text-sm focus-visible:ring-2 focus-visible:ring-purple-400">
              Level Settings
            </button>
            <button type="button" onClick={() => saveLevel()} disabled={!level || saving} className="px-3 py-1 rounded-lg bg-green-600 text-white text-sm focus-visible:ring-2 focus-visible:ring-green-400">
              {saving ? 'Saving…' : 'Save to Game'}
            </button>
            <button type="button" disabled={!level} onClick={testLevel} className="px-3 py-1 rounded-lg bg-emerald-500 text-white text-sm focus-visible:ring-2 focus-visible:ring-emerald-400">
              Test Run
            </button>
            <button type="button" disabled={!level} onClick={archiveCurrent} className="px-3 py-1 rounded-lg bg-red-100 text-red-700 text-sm focus-visible:ring-2 focus-visible:ring-red-400">
              Archive
            </button>
            <button type="button" onClick={() => confirmDiscard() && router.push('/levels')} className="px-3 py-1 rounded-lg bg-gray-200 text-sm focus-visible:ring-2 focus-visible:ring-gray-400">
              Level Search
            </button>
          </div>

          {(statusMsg || errorMsg || isDirty) && (
            <div className="mb-2 text-sm" aria-live="polite">
              {errorMsg && <p className="text-red-600">{errorMsg}</p>}
              {statusMsg && !errorMsg && <p className="text-green-700">{statusMsg}</p>}
              {isDirty && !saving && <p className="text-amber-700">Unsaved changes</p>}
            </div>
          )}

          {tool === 'select' && selected && (
            <div className="flex gap-1 mb-2 justify-center" aria-label="Nudge selected object">
              <button type="button" aria-label="Nudge north" onClick={() => nudgeSelected(0, -10)} className="px-2 py-1 bg-white rounded focus-visible:ring-2">N</button>
              <button type="button" aria-label="Nudge west" onClick={() => nudgeSelected(-10, 0)} className="px-2 py-1 bg-white rounded focus-visible:ring-2">W</button>
              <button type="button" aria-label="Nudge east" onClick={() => nudgeSelected(10, 0)} className="px-2 py-1 bg-white rounded focus-visible:ring-2">E</button>
              <button type="button" aria-label="Nudge south" onClick={() => nudgeSelected(0, 10)} className="px-2 py-1 bg-white rounded focus-visible:ring-2">S</button>
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={LEVEL_WORLD_WIDTH}
            height={LEVEL_WORLD_HEIGHT}
            className="w-full max-w-4xl border border-gray-300 rounded-xl bg-slate-900 touch-none mx-auto focus-visible:ring-2 focus-visible:ring-purple-400"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              handlePointerDown(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => handlePointerMove(e.clientX, e.clientY)}
            onPointerUp={() => {
              dragRef.current = null;
            }}
          />

          {!level && (
            <p className="text-white text-center mt-4">Create a new project or open one from the list.</p>
          )}
        </div>

        <aside className="lg:w-56 bg-white/95 rounded-xl p-3 text-sm shadow" aria-label="Properties">
          <p className="font-bold mb-2">Properties</p>
          {selectedPlatform ? (
            <>
              <label htmlFor="prop-scale" className="block text-xs mb-1">Scale</label>
              <input
                id="prop-scale"
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={selectedPlatform.scale}
                onChange={(e) => {
                  const scale = parseFloat(e.target.value);
                  updateLevelState((prev) => ({
                    ...prev,
                    platforms: prev.platforms.map((p) => (p.id === selectedPlatform.id ? { ...p, scale } : p)),
                  }));
                }}
                className="w-full mb-2"
              />
              <label htmlFor="prop-rotation" className="block text-xs mb-1">Rotation</label>
              <input
                id="prop-rotation"
                type="range"
                min={0}
                max={359}
                step={1}
                value={selectedPlatform.rotation ?? 0}
                onChange={(e) => {
                  const rotation = parseFloat(e.target.value);
                  updateLevelState((prev) => ({
                    ...prev,
                    platforms: prev.platforms.map((p) => (p.id === selectedPlatform.id ? { ...p, rotation } : p)),
                  }));
                }}
                className="w-full mb-2"
              />
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={!!selectedPlatform.isFinish}
                  onChange={(e) => {
                    updateLevelState((prev) => ({
                      ...prev,
                      platforms: prev.platforms.map((p) => (p.id === selectedPlatform.id ? { ...p, isFinish: e.target.checked } : p)),
                    }));
                  }}
                />
                Finish platform
              </label>
              <button type="button" onClick={deleteSelected} className="w-full py-1 bg-red-500 text-white rounded-lg focus-visible:ring-2 focus-visible:ring-red-400">
                Delete
              </button>
            </>
          ) : selectedBomb ? (
            <>
              <label htmlFor="bomb-scale" className="block text-xs mb-1">Scale</label>
              <input
                id="bomb-scale"
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={selectedBomb.scale ?? 1}
                onChange={(e) => {
                  const scale = parseFloat(e.target.value);
                  updateLevelState((prev) => ({
                    ...prev,
                    bombs: prev.bombs.map((b) => (b.id === selectedBomb.id ? { ...b, scale } : b)),
                  }));
                }}
                className="w-full mb-2"
              />
              <button type="button" onClick={deleteSelected} className="w-full py-1 bg-red-500 text-white rounded-lg">
                Delete
              </button>
            </>
          ) : selected?.kind === 'spawner' ? (
            <button type="button" onClick={deleteSelected} className="w-full py-1 bg-red-500 text-white rounded-lg">
              Remove Spawner
            </button>
          ) : (
            <p className="text-gray-500">Select an object with the Select tool.</p>
          )}
        </aside>
      </div>

      {showSettings && level && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="level-settings-title">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 id="level-settings-title" className="font-bold text-lg mb-3">Level Settings</h3>
            <label htmlFor="level-name" className="block text-sm mb-1">Name</label>
            <input
              id="level-name"
              className="w-full border rounded p-2 mb-3 focus-visible:ring-2 focus-visible:ring-purple-400"
              value={level.name}
              onChange={(e) => updateLevelState((prev) => ({ ...prev, name: e.target.value.slice(0, 40) }))}
            />
            <label htmlFor="level-desc" className="block text-sm mb-1">Description</label>
            <textarea
              id="level-desc"
              className="w-full border rounded p-2 mb-3 focus-visible:ring-2 focus-visible:ring-purple-400"
              value={level.description}
              onChange={(e) => updateLevelState((prev) => ({ ...prev, description: e.target.value.slice(0, 200) }))}
            />
            <label htmlFor="level-vis" className="block text-sm mb-1">Visibility</label>
            <select
              id="level-vis"
              className="w-full border rounded p-2 mb-2 focus-visible:ring-2 focus-visible:ring-purple-400"
              value={level.visibility}
              onChange={(e) => updateLevelState((prev) => ({ ...prev, visibility: e.target.value as 'public' | 'private' }))}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
            {settingsErrors.length > 0 && (
              <ul className="text-red-600 text-sm mb-2 list-disc pl-4">
                {settingsErrors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="w-full py-2 bg-purple-600 text-white rounded-lg focus-visible:ring-2 focus-visible:ring-purple-400"
              onClick={async () => {
                const validation = validateLevelDocument(level, level.visibility === 'public');
                if (!validation.valid) {
                  setSettingsErrors(validation.errors);
                  return;
                }
                setSettingsErrors([]);
                setShowSettings(false);
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </MenuBackground>
  );
}
