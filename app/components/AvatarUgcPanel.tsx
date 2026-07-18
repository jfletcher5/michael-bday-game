'use client';

import { useState } from 'react';
import type { User, AvatarPartType } from '../lib/types';
import { AVATAR_PART_LABELS, UGC_TEXTURE_PART_TYPES } from '../lib/avatarItems';
import { generateAvatarTextureDraft, publishAvatarUgcItem } from '../lib/firestore';

interface AvatarUgcPanelProps {
  user: User;
  onPublished: (user: User) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onDraftPreview?: (draft: { partType: AvatarPartType; textureUrl: string } | null) => void;
}

/**
 * Gemini-assisted texture creator — preview on 3D mannequin, publish straight to shop (MIE-18).
 */
export default function AvatarUgcPanel({ user, onPublished, onError, onSuccess, onDraftPreview }: AvatarUgcPanelProps) {
  const [partType, setPartType] = useState<AvatarPartType>('shirt');
  const [prompt, setPrompt] = useState('');
  const [itemName, setItemName] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [textureUrl, setTextureUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      onError('Describe your item first.');
      return;
    }
    setGenerating(true);
    onError('');
    try {
      const draft = await generateAvatarTextureDraft(user, partType, prompt.trim());
      setDraftId(draft.draftId);
      setTextureUrl(draft.textureUrl);
      setPreviewUrl(draft.previewImageUrl);
      onDraftPreview?.({ partType, textureUrl: draft.textureUrl });
      if (!itemName.trim()) setItemName(prompt.trim().slice(0, 32));
      onSuccess('Preview ready — publish if you like it!');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!draftId || !textureUrl || !itemName.trim()) {
      onError('Generate a preview before publishing.');
      return;
    }
    setPublishing(true);
    onError('');
    try {
      const updated = await publishAvatarUgcItem(user, {
        draftId,
        name: itemName.trim(),
        description: `UGC ${AVATAR_PART_LABELS[partType]} — "${prompt.trim()}"`,
        partType,
        textureUrl,
        previewImageUrl: previewUrl ?? textureUrl,
        ugcPrompt: prompt.trim(),
      });
      onPublished(updated);
      setDraftId(null);
      setTextureUrl(null);
      setPreviewUrl(null);
      setPrompt('');
      setItemName('');
      onDraftPreview?.(null);
      onSuccess('Published to Avatar shop!');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-glow p-4 mb-4">
      <h2 className="font-bold text-gray-800 mb-1">✨ Create with AI</h2>
      <p className="text-xs text-gray-500 mb-3">
        Describe a texture for your avatar. Gemini generates a 2D map applied to 3D body parts — publish instantly when you like it.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-2">
        <select
          value={partType}
          onChange={(e) => setPartType(e.target.value as AvatarPartType)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-shrink-0"
        >
          {UGC_TEXTURE_PART_TYPES.map((p) => (
            <option key={p} value={p}>
              {AVATAR_PART_LABELS[p]}
            </option>
          ))}
        </select>
        <input
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="Item name (optional)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
        />
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. neon green camo shirt with lightning bolts"
        rows={2}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || publishing}
          className="min-h-[40px] px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {generating ? 'Generating…' : 'Preview with Gemini'}
        </button>
        <button
          type="button"
          onClick={handlePublish}
          disabled={!draftId || publishing || generating}
          className="min-h-[40px] px-4 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {publishing ? 'Publishing…' : 'Publish to Shop'}
        </button>
      </div>

      {textureUrl && (
        <p className="text-[10px] text-gray-400 mt-2 truncate">Draft texture: {textureUrl}</p>
      )}
    </div>
  );
}
