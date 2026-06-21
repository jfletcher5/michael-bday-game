'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getCurrentUser, setCurrentUser } from '../lib/auth';
import {
  ensureUserAvatarMigration,
  subscribeToAvatarItems,
  purchaseAvatarItem,
  equipAvatarItem,
  unequipAvatarSlot,
  updateUserAvatar,
  getVerifiedUsernames,
} from '../lib/firestore';
import {
  mergeAvatarCatalog,
  AVATAR_PART_TYPES,
  AVATAR_PART_LABELS,
  getEquippedAvatarItems,
  isAvatarItemOwned,
  canPurchaseAvatarItem,
  isAvatarItemOffsaleForPlayer,
  EMOTE_COOLDOWN_MS,
} from '../lib/avatarItems';
import { formatGems } from '../lib/gamepasses';
import { AVATAR_OPTIONS, getAvatarUrl } from '../lib/avatars';
import type { AvatarItem, AvatarPartType, User } from '../lib/types';
import AvatarMannequin from '../components/AvatarMannequin';
import EmoteOverlay from '../components/EmoteOverlay';
import VerifiedBadge from '../components/VerifiedBadge';
import MenuBackground from '../components/MenuBackground';
import { PageHeader, PageHero, StatPill, Alert } from '../components/ui';

export default function AvatarsClient() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [firestoreItems, setFirestoreItems] = useState<AvatarItem[]>([]);
  const [partFilter, setPartFilter] = useState<AvatarPartType | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [playingEmote, setPlayingEmote] = useState<AvatarItem | null>(null);
  const [emoteOnCooldown, setEmoteOnCooldown] = useState(false);
  const [verifiedCreators, setVerifiedCreators] = useState<Set<string>>(new Set());

  const catalog = useMemo(() => mergeAvatarCatalog(firestoreItems), [firestoreItems]);

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.push('/login');
      return;
    }

    ensureUserAvatarMigration(current.username)
      .then((migrated) => {
        setUser(migrated);
        setCurrentUser(migrated);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    const unsub = subscribeToAvatarItems(setFirestoreItems);
    getVerifiedUsernames().then(setVerifiedCreators);
    return () => unsub();
  }, [router]);

  const equippedLayers = useMemo(
    () => (user ? getEquippedAvatarItems(user, catalog) : {}),
    [user, catalog]
  );

  const filteredItems = useMemo(() => {
    const items = catalog.filter((item) => {
      if (partFilter !== 'all' && item.partType !== partFilter) return false;
      // Show on-sale items + owned items (including offsale)
      if (item.onSale) return true;
      return user ? isAvatarItemOwned(user, item.id) : false;
    });
    return items;
  }, [catalog, partFilter, user]);

  const equippedEmote = equippedLayers.emote ?? null;

  const handlePlayEmote = () => {
    if (!equippedEmote || playingEmote || emoteOnCooldown) return;
    setPlayingEmote(equippedEmote);
    setEmoteOnCooldown(true);
    window.setTimeout(() => setEmoteOnCooldown(false), EMOTE_COOLDOWN_MS);
  };

  const handlePurchase = async (item: AvatarItem) => {
    if (!user) return;
    setActionKey(`buy-${item.id}`);
    setError(null);
    setSuccess(null);
    try {
      const updated = await purchaseAvatarItem(user.username, item);
      setUser(updated);
      setCurrentUser(updated);
      setSuccess(`Purchased ${item.name}!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      setActionKey(null);
    }
  };

  const handleEquip = async (item: AvatarItem) => {
    if (!user) return;
    setActionKey(`equip-${item.id}`);
    setError(null);
    try {
      const updated = await equipAvatarItem(user.username, item.id, item.partType);
      setUser(updated);
      setCurrentUser(updated);
      setSuccess(`Equipped ${item.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Equip failed');
    } finally {
      setActionKey(null);
    }
  };

  const handleUnequip = async (partType: AvatarPartType) => {
    if (!user) return;
    setActionKey(`unequip-${partType}`);
    try {
      const updated = await unequipAvatarSlot(user.username, partType);
      setUser(updated);
      setCurrentUser(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unequip failed');
    } finally {
      setActionKey(null);
    }
  };

  const handleLeaderboardAvatar = async (avatarId: number) => {
    if (!user) return;
    setActionKey(`lb-${avatarId}`);
    try {
      const updated = await updateUserAvatar(user.username, avatarId);
      setUser(updated);
      setCurrentUser(updated);
      setSuccess('Leaderboard avatar updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setActionKey(null);
    }
  };

  if (loading) {
    return (
      <MenuBackground className="min-h-screen flex items-center justify-center">
        <p className="text-white font-medium">Loading avatars…</p>
      </MenuBackground>
    );
  }

  if (!user) return null;

  return (
    <MenuBackground className="min-h-screen p-4 py-6 pb-24">
      <EmoteOverlay item={playingEmote} onDone={() => setPlayingEmote(null)} />

      <div className="max-w-4xl mx-auto animate-page-in">
        <PageHeader
          right={<StatPill icon="💎">{formatGems(user.totalGems ?? 0)} gems</StatPill>}
        />

        <PageHero title="👤 Avatar Shop" subtitle="Dress up your character" />

        {(error || success) && (
          <div className="mb-4 max-w-md mx-auto space-y-2">
            {error && <Alert>{error}</Alert>}
            {success && <Alert tone="success">{success}</Alert>}
          </div>
        )}

        {/* Mannequin + emote */}
        <div className="bg-white rounded-3xl shadow-glow p-4 mb-4 flex flex-col sm:flex-row items-center gap-4">
          <AvatarMannequin layers={equippedLayers} emoteActive={!!playingEmote} />
          <div className="flex-1 text-center sm:text-left">
            <p className="text-sm text-gray-600 mb-2">Your equipped look (does not change your ball in-game)</p>
            {equippedEmote && (
              <button
                onClick={handlePlayEmote}
                disabled={!!playingEmote || emoteOnCooldown}
                className="bg-purple-600 text-white font-semibold min-h-[44px] px-4 rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50"
              >
                {emoteOnCooldown ? 'Emote cooling down…' : `Play Emote: ${equippedEmote.name}`}
              </button>
            )}
          </div>
        </div>

        {/* Part filter */}
        <div className="flex flex-wrap gap-2 justify-center mb-4">
          <button
            onClick={() => setPartFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              partFilter === 'all' ? 'bg-white text-purple-700' : 'bg-white/20 text-white'
            }`}
          >
            All
          </button>
          {AVATAR_PART_TYPES.map((part) => (
            <button
              key={part}
              onClick={() => setPartFilter(part)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                partFilter === part ? 'bg-white text-purple-700' : 'bg-white/20 text-white'
              }`}
            >
              {AVATAR_PART_LABELS[part]}
            </button>
          ))}
        </div>

        {/* Item grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          {filteredItems.map((item) => {
            const owned = isAvatarItemOwned(user, item.id);
            const offsale = isAvatarItemOffsaleForPlayer(user, item);
            const canBuy = canPurchaseAvatarItem(user, item);
            const gemBalance = user.totalGems ?? 0;
            const canAfford = gemBalance >= item.gemPrice;
            const equippedId = user.equippedAvatar?.[item.partType];
            const isEquipped = equippedId === item.id;
            const limited = item.stock !== null;
            const soldOut = limited && item.stock! <= 0 && !owned;

            return (
              <div key={item.id} className="bg-white rounded-2xl p-3 border border-gray-200 flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow-sm">
                <div className="relative h-20 mb-2 bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center">
                  {item.previewImageUrl ? (
                    <Image src={item.previewImageUrl} alt="" width={64} height={64} className="object-contain" unoptimized />
                  ) : (
                    <span className="text-3xl">👕</span>
                  )}
                  {limited && item.onSale && !soldOut && (
                    <span className="absolute top-1 left-1 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                      LIMITED {item.stock}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-sm text-gray-800">{item.name}</h3>
                <p className="text-[10px] text-gray-500 line-clamp-2 mb-1">{item.description}</p>
                <p className="text-[10px] text-gray-400 mb-2 flex items-center gap-1">
                  by {item.creatorUsername}
                  {verifiedCreators.has(item.creatorUsername) && <VerifiedBadge />}
                </p>
                {offsale && <p className="text-xs text-gray-400 font-medium mb-1">Offsale</p>}
                {!owned && item.onSale && !soldOut && (
                  <p className={`text-xs font-semibold mb-2 ${canAfford || item.gemPrice === 0 ? 'text-cyan-600' : 'text-red-500'}`}>
                    {item.gemPrice === 0 ? 'Free' : `${formatGems(item.gemPrice)} gems`}
                  </p>
                )}
                <div className="mt-auto flex flex-col gap-1">
                  {!owned && canBuy && (
                    <button
                      onClick={() => handlePurchase(item)}
                      disabled={actionKey === `buy-${item.id}` || (item.gemPrice > 0 && !canAfford)}
                      className="w-full min-h-[36px] text-xs font-medium rounded-lg bg-cyan-500 text-white disabled:bg-gray-300"
                    >
                      {actionKey === `buy-${item.id}` ? '...' : item.gemPrice === 0 ? 'Get Free' : 'Buy'}
                    </button>
                  )}
                  {soldOut && !owned && (
                    <span className="text-xs text-center text-red-500 font-medium">Sold out</span>
                  )}
                  {owned && !isEquipped && (
                    <button
                      onClick={() => handleEquip(item)}
                      disabled={!!actionKey}
                      className="w-full min-h-[36px] text-xs font-medium rounded-lg bg-purple-500 text-white"
                    >
                      Equip
                    </button>
                  )}
                  {owned && isEquipped && (
                    <button
                      onClick={() => handleUnequip(item.partType)}
                      disabled={!!actionKey}
                      className="w-full min-h-[36px] text-xs font-medium rounded-lg bg-gray-200 text-gray-700"
                    >
                      Unequip
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Leaderboard appearance (legacy avatarId — MIE-16) */}
        <div className="bg-white rounded-3xl shadow-glow p-4">
          <h2 className="font-bold text-gray-800 mb-2">Leaderboard Icon</h2>
          <p className="text-xs text-gray-500 mb-3">This is the face shown on the leaderboard (separate from worn items).</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {AVATAR_OPTIONS.map((avatar) => (
              <button
                key={avatar.id}
                onClick={() => handleLeaderboardAvatar(avatar.id)}
                className={`p-2 rounded-xl border-2 ${
                  user.avatarId === avatar.id ? 'border-purple-500 bg-purple-50' : 'border-gray-200'
                }`}
              >
                <Image src={getAvatarUrl(avatar.id)} alt={avatar.name} width={48} height={48} className="w-full h-auto" unoptimized />
                <span className="text-[9px] text-gray-600">{avatar.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </MenuBackground>
  );
}
