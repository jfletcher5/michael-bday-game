'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, setCurrentUser } from '../lib/auth';
import {
  createAvatarStudioProject,
  getAvatarStudioProject,
  getMyAvatarStudioProjects,
  publishAvatarStudioItem,
  updateAvatarStudioProject,
} from '../lib/firestore';
import type { AvatarPartType, AvatarStudioLayer, AvatarStudioProject, User } from '../lib/types';
import {
  AVATAR_STUDIO_TEXTURE_SIZE,
  createImageLayerFromFile,
  createShapeLayer,
  drawStudioCanvas,
  hitTestLayers,
  dataUrlToBase64,
  flattenLayersToDataUrl,
  type AvatarStudioTool,
} from '../lib/avatarStudio';
import { DEFAULT_SKIN_COLOR } from '../lib/avatarItems';
import AvatarStudioViewport from '../components/AvatarStudioViewport';
import AvatarStudioToolbar from '../components/AvatarStudioToolbar';
import MenuBackground from '../components/MenuBackground';
import TopNav from '../components/TopNav';

/** Avatar Item Studio — manual texture composer replacing Gemini UGC (MIE-37). */
export default function AvatarStudioPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading studio…</div>
      }
    >
      <AvatarStudioEditor />
    </Suspense>
  );
}

function AvatarStudioEditor() {
  const router = useRouter();
  const params = useSearchParams();
  const projectIdParam = params.get('id');

  const [user] = useState(() => getCurrentUser());
  const [project, setProject] = useState<AvatarStudioProject | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [myProjects, setMyProjects] = useState<AvatarStudioProject[]>([]);
  const [tool, setTool] = useState<AvatarStudioTool>('select');
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [itemName, setItemName] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ layerId: string; startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );

  const isDirty = project ? JSON.stringify(project) !== savedSnapshot : false;

  const redraw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    await drawStudioCanvas(ctx, project.layers, AVATAR_STUDIO_TEXTURE_SIZE, selectedLayerId);
  }, [project, selectedLayerId]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const confirmDiscard = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm('You have unsaved changes. Continue without saving?');
  }, [isDirty]);

  const refreshProjectList = useCallback(async () => {
    if (!user) return;
    const list = await getMyAvatarStudioProjects(user);
    setMyProjects(list);
  }, [user]);

  const loadProjectById = useCallback(
    async (id: string) => {
      if (!user) return;
      if (!confirmDiscard()) return;
      setErrorMsg(null);
      const doc = await getAvatarStudioProject(user, id);
      if (!doc) {
        setErrorMsg('Could not load that project.');
        return;
      }
      if (doc.ownerUsername !== user.username) {
        setErrorMsg('You can only edit your own projects.');
        return;
      }
      setProject(doc);
      setSavedSnapshot(JSON.stringify(doc));
      setItemName(doc.name);
      setSelectedLayerId(null);
      router.replace(`/avatar-studio?id=${id}`);
    },
    [user, router, confirmDiscard],
  );

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    refreshProjectList();
    if (projectIdParam) {
      loadProjectById(projectIdParam);
    }
  }, [user, router, projectIdParam, loadProjectById, refreshProjectList]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const canvasPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = AVATAR_STUDIO_TEXTURE_SIZE / rect.width;
    const scaleY = AVATAR_STUDIO_TEXTURE_SIZE / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const updateLayer = (layerId: string, patch: Partial<AvatarStudioLayer>) => {
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        layers: prev.layers.map((l) => (l.id === layerId ? ({ ...l, ...patch } as AvatarStudioLayer) : l)),
        updatedAtMs: Date.now(),
      };
    });
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!project) return;
    // Capture pointer so drag/move keeps working on iPad when the finger leaves the canvas (MIE-42).
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    setErrorMsg(null);
    const { x, y } = canvasPoint(e.clientX, e.clientY);

    if (tool !== 'select') {
      // Image tool places via file picker — open it if the canvas was tapped (MIE-41).
      if (tool === 'image') {
        handleUploadImage();
        return;
      }
      const shape = tool === 'square' || tool === 'circle' || tool === 'triangle' || tool === 'star' ? tool : null;
      if (shape) {
        const layer = createShapeLayer(shape);
        layer.x = x;
        layer.y = y;
        setProject({
          ...project,
          layers: [...project.layers, layer],
          updatedAtMs: Date.now(),
        });
        setSelectedLayerId(layer.id);
        setTool('select');
        setStatusMsg('Shape added — drag to move, or use Scale / Rotate in the tools panel.');
      }
      return;
    }

    const hit = hitTestLayers(project.layers, x, y);
    if (hit) {
      setSelectedLayerId(hit.id);
      dragRef.current = {
        layerId: hit.id,
        startX: e.clientX,
        startY: e.clientY,
        originX: hit.x,
        originY: hit.y,
      };
    } else {
      setSelectedLayerId(null);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || !canvasRef.current) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = AVATAR_STUDIO_TEXTURE_SIZE / rect.width;
    const scaleY = AVATAR_STUDIO_TEXTURE_SIZE / rect.height;
    const dx = (e.clientX - drag.startX) * scaleX;
    const dy = (e.clientY - drag.startY) * scaleY;
    updateLayer(drag.layerId, { x: drag.originX + dx, y: drag.originY + dy });
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Capture may already be released — ignore.
    }
  };

  const handleNewProject = async () => {
    if (!user) return;
    if (!confirmDiscard()) return;
    setErrorMsg(null);
    const created = await createAvatarStudioProject(user);
    setProject(created);
    setSavedSnapshot(JSON.stringify(created));
    setItemName(created.name);
    setSelectedLayerId(null);
    router.replace(`/avatar-studio?id=${created.id}`);
    await refreshProjectList();
    setStatusMsg('New project created.');
  };

  const handleSave = async () => {
    if (!user || !project) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const updated = await updateAvatarStudioProject(user, { ...project, name: itemName.trim() || project.name });
      setProject(updated);
      setSavedSnapshot(JSON.stringify(updated));
      setStatusMsg('Project saved.');
      await refreshProjectList();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!user || !project) return;
    if (!itemName.trim()) {
      setErrorMsg('Enter an item name before publishing.');
      return;
    }
    if (project.layers.length === 0) {
      setErrorMsg('Add at least one layer before publishing.');
      return;
    }
    setPublishing(true);
    setErrorMsg(null);
    try {
      // Save latest edits before publishing so CF reads the current layer stack.
      const saved = await updateAvatarStudioProject(user, { ...project, name: itemName.trim() });
      setProject(saved);
      setSavedSnapshot(JSON.stringify(saved));

      const textureDataUrl = await flattenLayersToDataUrl(saved.layers);
      const updatedUser = await publishAvatarStudioItem(user, {
        projectId: saved.id,
        name: itemName.trim(),
        description: `Studio ${saved.targetPartType} by ${user.username}`,
        textureBase64: dataUrlToBase64(textureDataUrl),
      });
      setCurrentUser(updatedUser);
      setStatusMsg('Published to Avatar shop! You own and wear it now.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const handleUploadImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;
    e.target.value = '';
    try {
      const layer = await createImageLayerFromFile(file);
      setProject({
        ...project,
        layers: [...project.layers, layer],
        updatedAtMs: Date.now(),
      });
      setSelectedLayerId(layer.id);
      setTool('select');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Image upload failed');
    }
  };

  const handleDeleteSelected = () => {
    if (!project || !selectedLayerId) return;
    setProject({
      ...project,
      layers: project.layers.filter((l) => l.id !== selectedLayerId),
      updatedAtMs: Date.now(),
    });
    setSelectedLayerId(null);
  };

  const handlePartTypeChange = (part: AvatarPartType) => {
    if (!project) return;
    setProject({ ...project, targetPartType: part, updatedAtMs: Date.now() });
  };

  const handleScaleSelected = (delta: number) => {
    if (!project || !selectedLayerId) return;
    const layer = project.layers.find((l) => l.id === selectedLayerId);
    if (!layer) return;
    if (layer.kind === 'image') {
      updateLayer(layer.id, { scale: Math.max(0.2, layer.scale + delta) });
    } else {
      updateLayer(layer.id, {
        width: Math.max(20, layer.width + delta * 40),
        height: Math.max(20, layer.height + delta * 40),
      });
    }
  };

  const handleRotateSelected = (degrees: number) => {
    if (!project || !selectedLayerId) return;
    const layer = project.layers.find((l) => l.id === selectedLayerId);
    if (!layer) return;
    updateLayer(layer.id, { rotation: (layer.rotation + degrees) % 360 });
  };

  if (!user) return null;

  return (
    <MenuBackground className="min-h-screen text-white">
      <TopNav user={user as User} showLevelsButton={false} />

      <div className="pt-20 px-3 pb-8 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold">🎨 Avatar Item Studio</h1>
            <p className="text-sm text-white/70">Design textures for your avatar — no AI required</p>
          </div>
          <Link
            href="/avatars"
            className="text-sm bg-white/15 hover:bg-white/25 px-4 py-2 rounded-full transition-colors"
          >
            ← Back to Avatar Shop
          </Link>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Sidebar — project list */}
          <aside className="lg:w-56 flex-shrink-0 bg-slate-900/80 rounded-xl p-3 border border-slate-700">
            <button
              type="button"
              onClick={handleNewProject}
              className="w-full mb-3 min-h-[40px] bg-amber-500 text-black font-semibold rounded-lg text-sm"
            >
              + New project
            </button>
            <p className="text-xs text-slate-400 mb-2">My projects</p>
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {myProjects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => loadProjectById(p.id)}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded ${
                      project?.id === p.id ? 'bg-amber-500/30 text-amber-200' : 'hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
              {myProjects.length === 0 && <li className="text-xs text-slate-500">No saved projects yet</li>}
            </ul>
          </aside>

          {/* Main editor */}
          <main className="flex-1 min-w-0">
            {!project ? (
              <div className="bg-slate-900/80 rounded-xl p-8 text-center border border-slate-700">
                <p className="text-white font-medium mb-2">Open a project to start designing</p>
                <p className="text-slate-400 mb-4 text-sm">
                  Shape tools, image import, and move/scale/rotate only work after you create or open a project.
                </p>
                <button
                  type="button"
                  onClick={handleNewProject}
                  className="min-h-[44px] px-6 bg-amber-500 text-black font-semibold rounded-lg"
                >
                  New project
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* 2D composition canvas — flat UV sheet that wraps onto the 3D mesh */}
                <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-2">
                    2D design surface — tap to place shapes, drag with Select to move
                  </p>
                  <canvas
                    ref={canvasRef}
                    width={AVATAR_STUDIO_TEXTURE_SIZE}
                    height={AVATAR_STUDIO_TEXTURE_SIZE}
                    className="w-full max-w-md mx-auto border border-slate-600 rounded-lg cursor-crosshair touch-none select-none"
                    style={{ touchAction: 'none' }}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={handleCanvasPointerUp}
                    onPointerCancel={handleCanvasPointerUp}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {/* 3D preview */}
                <AvatarStudioViewport
                  targetPartType={project.targetPartType}
                  layers={project.layers}
                  skinColor={user.skinColor ?? DEFAULT_SKIN_COLOR}
                />
              </div>
            )}

            {/* Actions bar */}
            {project && (
              <div className="mt-4 bg-slate-900/80 rounded-xl p-4 border border-slate-700">
                <div className="flex flex-col sm:flex-row gap-3 mb-3">
                  <input
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="Item name for shop"
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                    className="min-h-[40px] px-5 bg-blue-600 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={publishing}
                    className="min-h-[40px] px-5 bg-green-600 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {publishing ? 'Publishing…' : 'Publish to Shop'}
                  </button>
                </div>

                {(statusMsg || errorMsg) && (
                  <p
                    className={`text-sm ${errorMsg ? 'text-red-400' : 'text-green-400'}`}
                    aria-live="polite"
                  >
                    {errorMsg || statusMsg}
                  </p>
                )}
              </div>
            )}
          </main>

          {/* Right panel — tools */}
          {project && (
            <aside className="lg:w-52 flex-shrink-0 bg-slate-900/80 rounded-xl p-3 border border-slate-700">
              <AvatarStudioToolbar
                tool={tool}
                onToolChange={setTool}
                targetPartType={project.targetPartType}
                onPartTypeChange={handlePartTypeChange}
                onUploadImage={handleUploadImage}
                onDeleteSelected={handleDeleteSelected}
                onScaleSelected={handleScaleSelected}
                onRotateSelected={handleRotateSelected}
                hasSelection={!!selectedLayerId}
                disabled={saving || publishing}
              />
            </aside>
          )}
        </div>
      </div>
    </MenuBackground>
  );
}
