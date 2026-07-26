// Avatar item catalog helpers (MIE-12) — separate from legacy DiceBear avatars.ts

import type { AvatarItem, AvatarPartType, EquippedAvatar, User } from './types';

/** Usernames allowed to create/edit avatar catalog items (Michael's spec). */
export const AVATAR_CREATOR_USERNAMES = ['HWI', 'NES', 'NYX', 'JDF', 'MIE'] as const;

export const AVATAR_PART_TYPES: AvatarPartType[] = [
  'shirt',
  'hair',
  'pants',
  'arm',
  'leg',
  'hand',
  'foot',
  'sock',
  'face',
  'emote',
  'accessory',
];

export const AVATAR_PART_LABELS: Record<AvatarPartType, string> = {
  shirt: 'Shirt',
  hair: 'Hair',
  pants: 'Pants',
  arm: 'Arms',
  leg: 'Legs',
  hand: 'Hands',
  foot: 'Feet',
  sock: 'Socks',
  face: 'Face',
  emote: 'Emotes',
  accessory: 'Accessory',
};

/** Default free skin tint — white per Michael (MIE-18). */
export const DEFAULT_SKIN_COLOR = '#FFFFFF';

/** UGC body slots players can describe to Gemini (no emote/face via texture gen). */
export const UGC_TEXTURE_PART_TYPES: AvatarPartType[] = [
  'shirt',
  'hair',
  'pants',
  'arm',
  'leg',
  'hand',
  'foot',
  'sock',
  'accessory',
];

/** How long an emote animation plays (MIE-17). */
export const EMOTE_DURATION_MS = 3000;
/** Cooldown before the same player can trigger another emote (prevents stacking). */
export const EMOTE_COOLDOWN_MS = 5000;

/** Empty equipped slots for new users. */
export function createEmptyEquippedAvatar(): EquippedAvatar {
  return {
    shirt: null,
    hair: null,
    pants: null,
    arm: null,
    leg: null,
    hand: null,
    foot: null,
    sock: null,
    face: null,
    emote: null,
    accessory: null,
  };
}

/** Whether this username can access avatar creator admin tabs. */
export function isAvatarCreator(username: string): boolean {
  return AVATAR_CREATOR_USERNAMES.includes(
    username.toUpperCase() as (typeof AVATAR_CREATOR_USERNAMES)[number]
  );
}

/**
 * Built-in starter items (always available, free) until creators publish more.
 * Merged with Firestore catalog on read.
 */
export const BUILTIN_AVATAR_ITEMS: AvatarItem[] = [
  {
    id: 'starter-shirt-blue',
    name: 'Starter Blue Tee',
    description: 'Default shirt for new players.',
    creatorUsername: 'SYSTEM',
    partType: 'shirt',
    gemPrice: 0,
    onSale: true,
    stock: null,
    previewImageUrl: '/starter-shirt-blue.svg',
    // UV-friendly wear texture for 3D body mesh (MIE-38) — shop card stays flat SVG above
    textureUrl: '/starter-shirt-blue-texture.png',
    createdAtMs: 0,
    updatedAtMs: 0,
  },
  {
    id: 'starter-hair-brown',
    name: 'Starter Hair',
    description: 'Simple brown hair.',
    creatorUsername: 'SYSTEM',
    partType: 'hair',
    gemPrice: 0,
    onSale: true,
    stock: null,
    previewImageUrl: '/starter-hair-brown.svg',
    textureUrl: '/starter-hair-brown-texture.png',
    createdAtMs: 0,
    updatedAtMs: 0,
  },
  {
    id: 'starter-pants-gray',
    name: 'Starter Pants',
    description: 'Comfortable gray pants.',
    creatorUsername: 'SYSTEM',
    partType: 'pants',
    gemPrice: 0,
    onSale: true,
    stock: null,
    previewImageUrl: '/starter-pants-gray.svg',
    textureUrl: '/starter-pants-gray-texture.png',
    createdAtMs: 0,
    updatedAtMs: 0,
  },
  {
    id: 'starter-emote-wave',
    name: 'Wave Emote',
    description: 'A friendly wave emote.',
    creatorUsername: 'SYSTEM',
    partType: 'emote',
    gemPrice: 0,
    onSale: true,
    stock: null,
    previewImageUrl: '/starter-emote-wave.svg',
    emoteAnimation: 'wave',
    source: 'system',
    createdAtMs: 0,
    updatedAtMs: 0,
  },
  {
    id: 'starter-face-smile',
    name: 'Smiling Face',
    description: 'Default cheerful expression.',
    creatorUsername: 'SYSTEM',
    partType: 'face',
    gemPrice: 0,
    onSale: true,
    stock: null,
    previewImageUrl: '/starter-face-smile.svg',
    faceOverlayUrl: '/starter-face-smile.svg',
    source: 'system',
    createdAtMs: 0,
    updatedAtMs: 0,
  },
];

export const STARTER_OWNED_ITEM_IDS = BUILTIN_AVATAR_ITEMS.map((item) => item.id);

/** Default equipped starter loadout for new / migrated users (MIE-16). */
export function createStarterEquippedAvatar(): EquippedAvatar {
  return {
    shirt: 'starter-shirt-blue',
    hair: 'starter-hair-brown',
    pants: 'starter-pants-gray',
    arm: null,
    leg: null,
    hand: null,
    foot: null,
    sock: null,
    face: 'starter-face-smile',
    emote: 'starter-emote-wave',
    accessory: null,
  };
}

/** Merge Firestore items with built-ins; Firestore wins on id collision. */
export function mergeAvatarCatalog(firestoreItems: AvatarItem[]): AvatarItem[] {
  const byId = new Map<string, AvatarItem>();
  for (const item of BUILTIN_AVATAR_ITEMS) byId.set(item.id, item);
  for (const item of firestoreItems) byId.set(item.id, item);
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function getAvatarItemById(
  itemId: string,
  catalog: AvatarItem[]
): AvatarItem | undefined {
  return catalog.find((item) => item.id === itemId);
}

/** Player owns the item (built-in starters count as owned once granted on user doc). */
export function isAvatarItemOwned(user: User, itemId: string): boolean {
  return (user.ownedAvatarItems ?? []).includes(itemId);
}

/** Item can be purchased now (on sale, in stock, not owned). */
export function canPurchaseAvatarItem(user: User, item: AvatarItem): boolean {
  if (isAvatarItemOwned(user, item.id)) return false;
  if (!item.onSale) return false;
  if (item.stock !== null && item.stock <= 0) return false;
  return true;
}

/** Shop label when item is off sale but player still owns it. */
export function isAvatarItemOffsaleForPlayer(user: User, item: AvatarItem): boolean {
  return isAvatarItemOwned(user, item.id) && !item.onSale;
}

/** Resolve equipped item ids to catalog entries for mannequin preview. */
export function getEquippedAvatarItems(
  user: User,
  catalog: AvatarItem[]
): Partial<Record<AvatarPartType, AvatarItem>> {
  const equipped = user.equippedAvatar ?? createEmptyEquippedAvatar();
  const result: Partial<Record<AvatarPartType, AvatarItem>> = {};
  for (const partType of AVATAR_PART_TYPES) {
    const itemId = equipped[partType];
    if (!itemId) continue;
    const item = getAvatarItemById(itemId, catalog);
    if (item) result[partType] = item;
  }
  return result;
}

/** Shop grid / card thumbnail — always flat preview art, never the 3D wear map (MIE-38). */
export function getAvatarShopThumbnailUrl(item: AvatarItem | undefined): string | null {
  if (!item) return null;
  return item.previewImageUrl ?? null;
}

/**
 * Resolve the 2D texture URL mapped onto a 3D body-part mesh (MIE-18 / MIE-38).
 * Does not fall back to previewImageUrl — missing textureUrl means skin-tinted mesh only.
 */
export function getAvatarPartTextureUrl(item: AvatarItem | undefined): string | null {
  if (!item) return null;
  // Face/emote slots use overlay or rig animation, not body-part UV maps
  if (item.partType === 'face' || item.partType === 'emote') return null;
  return item.textureUrl ?? item.shirtTextureUrl ?? null;
}

/** Face slot uses a 2D overlay composited on the 3D head (MIE-18). */
export function getAvatarFaceOverlayUrl(item: AvatarItem | undefined): string | null {
  if (!item || item.partType !== 'face') return null;
  return item.faceOverlayUrl ?? item.textureUrl ?? item.previewImageUrl ?? null;
}

/** Whether this emote should drive the 3D rig animation (MIE-18). */
export function getEmoteAnimationId(item: AvatarItem | undefined): string | null {
  if (!item || item.partType !== 'emote') return null;
  return item.emoteAnimation ?? (item.id.includes('wave') ? 'wave' : null);
}

/** Ensure legacy users have avatar economy fields (call after login/load). */
export function normalizeUserAvatarFields(user: User): User {
  const owned = user.ownedAvatarItems ?? [...STARTER_OWNED_ITEM_IDS];
  const equipped = user.equippedAvatar ?? createStarterEquippedAvatar();
  // Grant any missing built-in starter ownership
  const ownedSet = new Set(owned);
  for (const id of STARTER_OWNED_ITEM_IDS) ownedSet.add(id);
  return {
    ...user,
    skinColor: user.skinColor ?? DEFAULT_SKIN_COLOR,
    ownedAvatarItems: Array.from(ownedSet),
    equippedAvatar: {
      ...createEmptyEquippedAvatar(),
      ...equipped,
      // Backfill face slot for users migrated before MIE-18
      face: equipped.face ?? 'starter-face-smile',
    },
  };
}
