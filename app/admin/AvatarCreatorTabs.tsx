'use client';

import { useState, useEffect } from 'react';
import {
  createAvatarItem,
  updateAvatarItem,
  deleteAvatarItem,
  subscribeToAvatarItems,
} from '../lib/firestore';
import {
  AVATAR_PART_TYPES,
  AVATAR_PART_LABELS,
  mergeAvatarCatalog,
} from '../lib/avatarItems';
import type { AvatarItem, AvatarPartType, User } from '../lib/types';

type Props = { admin: User };

/** Creator-only admin tabs for avatar catalog CRUD (MIE-14). */
export function AvatarCreateTab({ admin }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gemPrice, setGemPrice] = useState('500');
  const [partType, setPartType] = useState<AvatarPartType>('shirt');
  const [modelUrl, setModelUrl] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [shirtTextureUrl, setShirtTextureUrl] = useState('');
  const [stock, setStock] = useState('');
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setFeedback('');
    try {
      await createAvatarItem(admin.username, {
        name: name.trim(),
        description: description.trim(),
        partType,
        gemPrice: Math.max(0, parseInt(gemPrice, 10) || 0),
        onSale: true,
        stock: stock.trim() === '' ? null : Math.max(0, parseInt(stock, 10) || 0),
        modelUrl: modelUrl.trim() || undefined,
        previewImageUrl: previewImageUrl.trim() || undefined,
        shirtTextureUrl: shirtTextureUrl.trim() || undefined,
      });
      setFeedback('Avatar item created!');
      setName('');
      setDescription('');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-lg">
      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Create Avatar Item</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Item name"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        rows={2}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <select
        value={partType}
        onChange={(e) => setPartType(e.target.value as AvatarPartType)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      >
        {AVATAR_PART_TYPES.map((p) => (
          <option key={p} value={p}>{AVATAR_PART_LABELS[p]}</option>
        ))}
      </select>
      <input
        value={gemPrice}
        onChange={(e) => setGemPrice(e.target.value)}
        placeholder="Gem price (0 = free)"
        type="number"
        min={0}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <input
        value={stock}
        onChange={(e) => setStock(e.target.value)}
        placeholder="Limited stock (blank = unlimited)"
        type="number"
        min={0}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <input
        value={modelUrl}
        onChange={(e) => setModelUrl(e.target.value)}
        placeholder="Sketchfab / model URL"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <input
        value={previewImageUrl}
        onChange={(e) => setPreviewImageUrl(e.target.value)}
        placeholder="Preview image URL"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <input
        value={shirtTextureUrl}
        onChange={(e) => setShirtTextureUrl(e.target.value)}
        placeholder="Shirt texture photo URL (optional)"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <button
        onClick={handleCreate}
        disabled={submitting}
        className="w-full bg-purple-600 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
      >
        {submitting ? 'Creating...' : 'Publish Item'}
      </button>
      {feedback && <p className="text-xs text-center text-purple-600">{feedback}</p>}
    </div>
  );
}

export function AvatarListTab() {
  const [items, setItems] = useState<AvatarItem[]>([]);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToAvatarItems((firestoreItems) => {
      setItems(mergeAvatarCatalog(firestoreItems).filter((i) => !i.id.startsWith('starter-')));
    });
  }, []);

  const handleToggleSale = async (item: AvatarItem) => {
    await updateAvatarItem(item.id, { onSale: !item.onSale });
    setMenuOpen(null);
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('Delete this avatar item?')) return;
    await deleteAvatarItem(itemId);
    setMenuOpen(null);
  };

  const handleEditPrice = async (item: AvatarItem) => {
    const raw = prompt('New gem price:', String(item.gemPrice));
    if (raw === null) return;
    await updateAvatarItem(item.id, { gemPrice: Math.max(0, parseInt(raw, 10) || 0) });
    setMenuOpen(null);
  };

  const handleEditName = async (item: AvatarItem) => {
    const raw = prompt('New name:', item.name);
    if (!raw?.trim()) return;
    await updateAvatarItem(item.id, { name: raw.trim() });
    setMenuOpen(null);
  };

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic border border-dashed rounded-lg p-6 text-center">
        No creator avatar items yet
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Avatar List</h2>
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
          <div>
            <p className="font-medium text-sm text-gray-800">{item.name}</p>
            <p className="text-xs text-gray-500">
              {AVATAR_PART_LABELS[item.partType]} · {item.gemPrice} gems · by {item.creatorUsername}
              {!item.onSale && ' · Offsale'}
              {item.stock !== null && ` · Stock ${item.stock}`}
            </p>
          </div>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(menuOpen === item.id ? null : item.id)}
              className="min-h-[36px] min-w-[36px] rounded-lg bg-gray-100 hover:bg-gray-200 text-sm"
              aria-label="Item actions"
            >
              ⋮
            </button>
            {menuOpen === item.id && (
              <div className="absolute right-0 top-full mt-1 bg-white border shadow-lg rounded-lg z-10 min-w-[140px]">
                <button onClick={() => handleEditName(item)} className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50">Edit name</button>
                <button onClick={() => handleEditPrice(item)} className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50">Edit price</button>
                <button onClick={() => handleToggleSale(item)} className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50">
                  {item.onSale ? 'Mark offsale' : 'Put on sale'}
                </button>
                <button onClick={() => handleDelete(item.id)} className="block w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50">Delete</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
