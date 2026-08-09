// Firestore service functions for leaderboard and user management
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
  arrayUnion,
  where,
  onSnapshot,
  serverTimestamp,
  increment,
  runTransaction,
  type Unsubscribe
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { Score, User, SeasonData, ProPassData, LoginCredentials, GameEvent, GameEventType, BroadcastMessage, ShopOffer, Poll, PlayerSettings, PendingGift, GiftTransaction, RenameUserResult, LevelDocument, FriendRequest, Friendship, ChatMessage, RaceChallenge, FossilTypeId } from './types';
import { getCurrentSeasonId, getSeasonConfig } from './seasons';
import type { SeasonConfig } from './seasons';
import {
  formatDisplayName,
  usernameLowerKey,
  validateDisplayName,
  isLegacyInitialsUsername,
} from './displayName';
import {
  getProPassConfig,
  isProPassActive,
  isProPassEnded,
  type ProPassConfig,
} from './proPass';
import { AURORA_BALL_ID, AURORA_SHARD_GOAL } from './aurora';
import { addFossilToInventory, matchFossilRecipe } from './fossils';
import {
  createFossilCraftJob,
  deductFossilsForCraft,
  hasFossilsForCraft,
  isFossilCraftComplete,
} from './fossilCraft';
import { getGamepassById, VIP_BALL_ID, type GamepassId } from './gamepasses';
import { getBallTypeById, getBallGiftGemPrice, isBallGiftable } from './ballTypes';
import {
  createStarterEquippedAvatar,
  isLoadableAvatarTextureUrl,
  normalizeUserAvatarFields,
  STARTER_OWNED_ITEM_IDS,
} from './avatarItems';
import type { AvatarItem, AvatarPartType, AvatarStudioProject, EquippedAvatar } from './types';
import { normalizeLevelDocument } from './levelWorld';

// Collection name in Firestore
const LEADERBOARD_COLLECTION = 'leaderboard';

// ============================================
// CLOUD FUNCTION INTERFACES
// ============================================

/**
 * Game session data returned from startGameSession Cloud Function
 */
export interface GameSession {
  sessionId: string;
  token: string;
  timestamp: number;
}

/**
 * Score submission result from submitScore Cloud Function
 */
export interface ScoreSubmitResult {
  success: boolean;
  message?: string;
  isNewPersonalBest?: boolean;
}

// ============================================
// CLOUD FUNCTION CALLS
// ============================================

/**
 * Start a new game session via Cloud Function
 * Called when the game starts to get a session token for anti-cheat
 * @returns Promise that resolves to GameSession data
 */
export async function startGameSession(): Promise<GameSession> {
  try {
    const startSession = httpsCallable<void, GameSession>(functions, 'startGameSession');
    const result = await startSession();
    console.log('Game session started:', result.data.sessionId);
    return result.data;
  } catch (error) {
    console.error('Error starting game session:', error);
    throw error;
  }
}

/**
 * Submit score via Cloud Function with anti-cheat validation
 * @param session - The game session from startGameSession
 * @param score - The score data to submit
 * @returns Promise that resolves to ScoreSubmitResult
 */
export async function submitScoreViaFunction(
  session: GameSession,
  score: Score
): Promise<ScoreSubmitResult> {
  try {
    const submitScore = httpsCallable<{
      sessionId: string;
      token: string;
      timestamp: number;
      avatarId: number;
      initials: string;
      distance: number;
    }, ScoreSubmitResult>(functions, 'submitScore');
    
    const result = await submitScore({
      sessionId: session.sessionId,
      token: session.token,
      timestamp: session.timestamp,
      avatarId: score.avatarId,
      initials: score.initials,
      distance: score.distance,
    });
    
    return result.data;
  } catch (error) {
    throw error;
  }
}

/**
 * Paginated scores result interface
 */
export interface PaginatedScoresResult {
  scores: Score[];                              // Array of scores for current page
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;  // Cursor for next page
  hasMore: boolean;                             // Whether there are more pages
}

/**
 * Add a new score to the Firestore leaderboard
 * This function will be replaced by Cloud Functions for security
 * @param score - The Score object to add
 * @returns Promise that resolves when score is added
 * @deprecated Use Cloud Function submitScore instead (once implemented)
 */
export async function addScoreToFirestore(score: Score): Promise<void> {
  try {
    // Add score to Firestore with server timestamp
    await addDoc(collection(db, LEADERBOARD_COLLECTION), {
      avatarId: score.avatarId,
      initials: score.initials,
      distance: score.distance,
      date: score.date,
      timestamp: Timestamp.now() // Server timestamp for ordering
    });
    console.log('Score added to Firestore successfully');
  } catch (error) {
    console.error('Error adding score to Firestore:', error);
    throw error;
  }
}

/**
 * Get paginated scores from Firestore leaderboard
 * Uses cursor-based pagination for efficient querying
 * @param pageSize - Number of scores per page (default: 5)
 * @param startAfterDoc - Optional cursor document to start after (for pagination)
 * @returns Promise that resolves to PaginatedScoresResult
 */
export async function getScoresFromFirestore(
  pageSize: number = 5,
  startAfterDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<PaginatedScoresResult> {
  try {
    // Build query with pagination
    let scoresQuery;
    
    if (startAfterDoc) {
      // Query starting after the provided document (for "Next" page)
      scoresQuery = query(
        collection(db, LEADERBOARD_COLLECTION),
        orderBy('distance', 'desc'),
        startAfter(startAfterDoc),
        limit(pageSize + 1) // Fetch one extra to check if there are more pages
      );
    } else {
      // First page query
      scoresQuery = query(
        collection(db, LEADERBOARD_COLLECTION),
        orderBy('distance', 'desc'),
        limit(pageSize + 1) // Fetch one extra to check if there are more pages
      );
    }
    
    const querySnapshot = await getDocs(scoresQuery);
    const docs = querySnapshot.docs;
    
    // Check if there are more pages (we fetched pageSize + 1)
    const hasMore = docs.length > pageSize;
    
    // Only take the requested page size
    const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
    
    // Map Firestore documents to Score objects
    const scores: Score[] = pageDocs.map(doc => {
      const data = doc.data();
      return {
        // Support both new (avatarId/initials) and legacy (username) formats
        avatarId: data.avatarId ?? 1,
        initials: data.initials ?? (data.username ? data.username.slice(0, 3).toUpperCase() : 'AAA'),
        distance: data.distance || 0,
        date: data.date || new Date().toISOString(),
        isVip: data.isVip === true,
      };
    });
    
    // Get the last document for pagination cursor
    const lastDoc = pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;
    
    return {
      scores,
      lastDoc,
      hasMore
    };
  } catch (error) {
    console.error('Error fetching scores from Firestore:', error);
    throw error;
  }
}

/**
 * Read a player's current best leaderboard entry (doc id = uppercase username).
 * Useful for admin/debug tooling after MIE-22 one-doc-per-player migration.
 */
export async function getPlayerBestScore(username: string): Promise<Score | null> {
  try {
    const docRef = doc(db, LEADERBOARD_COLLECTION, username.toUpperCase());
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      avatarId: data.avatarId ?? 1,
      initials: data.initials ?? username.toUpperCase(),
      distance: data.distance ?? 0,
      date: data.date ?? new Date().toISOString(),
      isVip: data.isVip === true,
    };
  } catch (error) {
    console.error('Error fetching player best score:', error);
    throw error;
  }
}

/**
 * Get the total count of scores (for page number display)
 * Note: This is an approximation as Firestore doesn't have built-in count
 * @returns Promise that resolves to approximate count
 */
export async function getTotalScoreCount(): Promise<number> {
  try {
    // For now, fetch all scores and count them
    // In production, consider using a counter document or Cloud Function
    const scoresQuery = query(
      collection(db, LEADERBOARD_COLLECTION),
      orderBy('distance', 'desc')
    );
    const querySnapshot = await getDocs(scoresQuery);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error getting score count:', error);
    return 0;
  }
}

// ============================================
// USER MANAGEMENT FUNCTIONS
// ============================================

// Collection name for users
const USERS_COLLECTION = 'users';
const LEVELS_COLLECTION = 'levels';
const FRIEND_REQUESTS_COLLECTION = 'friendRequests';
const FRIENDSHIPS_COLLECTION = 'friendships';
const RACE_CHALLENGES_COLLECTION = 'raceChallenges';

/** Canonical Firestore ref — username is the doc id (mixed case after MIE-23). */
function userRef(username: string) {
  return doc(db, USERS_COLLECTION, username);
}

/** Shown name in UI; falls back to username for legacy rows. */
export function getDisplayName(user: User): string {
  return user.displayName ?? user.username;
}

/** Resolve login input to the stored users/{docId}. */
export async function resolveUserDocId(input: string): Promise<string | null> {
  const formatted = formatDisplayName(input);
  if (!formatted) return null;

  const direct = await getDoc(userRef(formatted));
  if (direct.exists()) return formatted;

  const compact = formatted.replace(/\s/g, '');
  if (/^[A-Za-z]{3}$/.test(compact)) {
    const legacyId = compact.toUpperCase();
    const legacyDoc = await getDoc(userRef(legacyId));
    if (legacyDoc.exists()) return legacyId;
  }

  const lower = usernameLowerKey(formatted);
  const q = query(collection(db, USERS_COLLECTION), where('usernameLower', '==', lower), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) return snap.docs[0].id;
  return null;
}

async function isUsernameLowerTaken(lower: string, exceptDocId?: string): Promise<boolean> {
  const q = query(collection(db, USERS_COLLECTION), where('usernameLower', '==', lower), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return false;
  if (exceptDocId && snap.docs[0].id === exceptDocId) return false;
  return true;
}

/** Prefix search on usernameLower for friends / gifting (MIE-20). */
export async function searchPlayersByPrefix(term: string, max = 20): Promise<User[]> {
  const trimmed = formatDisplayName(term).toLowerCase();
  if (trimmed.length < 1) return [];

  const end = trimmed.slice(0, -1) + String.fromCharCode(trimmed.charCodeAt(trimmed.length - 1) + 1);
  const q = query(
    collection(db, USERS_COLLECTION),
    where('usernameLower', '>=', trimmed),
    where('usernameLower', '<', end),
    limit(max),
  );
  const snap = await getDocs(q);
  // Always prefer doc id as username so friend requests target the correct account (MIE-25).
  return snap.docs.map((d) =>
    normalizeUserAvatarFields({ ...(d.data() as User), username: d.id }),
  );
}

// Collection name for season pass reward definitions
const SEASON_CONFIGS_COLLECTION = 'seasonConfigs';
const PRO_PASS_CONFIGS_COLLECTION = 'proPassConfigs';
const AVATAR_ITEMS_COLLECTION = 'avatarItems';

/**
 * Create a new user account with a custom display name (MIE-23).
 */
export async function createUser(
  credentials: LoginCredentials,
  avatarId: number
): Promise<User> {
  try {
    const validation = validateDisplayName(credentials.username);
    if (!validation.ok) {
      throw new Error(validation.error);
    }
    const username = validation.formatted;
    const lower = usernameLowerKey(username);

    if (await isUsernameLowerTaken(lower)) {
      throw new Error('Name already taken');
    }

    const existing = await getDoc(userRef(username));
    if (existing.exists()) {
      throw new Error('Name already taken');
    }

    const newUser: User = {
      username,
      displayName: username,
      usernameLower: lower,
      password: credentials.password,
      totalMeters: 0,
      totalCoins: 0,
      totalGems: 0,
      ownedBalls: ['default'],
      selectedBall: 'default',
      avatarId,
      createdAt: new Date().toISOString(),
      extraBalls: 0,
      seasonData: null,
      ownedAvatarItems: [...STARTER_OWNED_ITEM_IDS],
      equippedAvatar: createStarterEquippedAvatar(),
      skinColor: '#FFFFFF',
    };

    await setDoc(userRef(username), newUser);
    console.log('User created successfully:', username);
    return newUser;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Login with display name + password (case-insensitive name lookup).
 */
export async function loginUser(credentials: LoginCredentials): Promise<User> {
  try {
    const docId = await resolveUserDocId(credentials.username);
    if (!docId) {
      throw new Error('User not found');
    }

    const userDoc = await getDoc(userRef(docId));
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    let userData = userDoc.data() as User;

    if (userData.password !== credentials.password) {
      throw new Error('Incorrect password');
    }

    // Backfill MIE-23 fields for legacy rows on login.
    const patches: Partial<User> = {};
    if (!userData.displayName) patches.displayName = userData.username;
    if (!userData.usernameLower) patches.usernameLower = usernameLowerKey(userData.username);
    if (isLegacyInitialsUsername(userData.username) && userData.isLegacyInitials === undefined) {
      patches.isLegacyInitials = true;
      if (userData.legacyRenameUsed === undefined) patches.legacyRenameUsed = false;
    }
    if (Object.keys(patches).length > 0) {
      await updateDoc(userRef(docId), patches);
      userData = { ...userData, ...patches };
    }

    console.log('User logged in:', docId);
    return normalizeUserAvatarFields(userData);
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
}

/** Secure rename via Cloud Function — migrates user + leaderboard docs (MIE-23). */
export async function renameUserViaFunction(
  oldUsername: string,
  password: string,
  newName: string,
): Promise<RenameUserResult> {
  const renameFn = httpsCallable<
    { oldUsername: string; password: string; newName: string },
    RenameUserResult
  >(functions, 'renameUser');
  const result = await renameFn({ oldUsername, password, newName });
  return result.data;
}

/**
 * Persist a user's selected avatar.
 * Updates both Firestore and the returned User snapshot.
 */
export async function updateUserAvatar(username: string, avatarId: number): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) throw new Error('User not found');

  await updateDoc(userRef, { avatarId });

  const userData = userDoc.data() as User;
  return { ...userData, avatarId };
}

/**
 * Persist a user's zoom + menu gradient settings to Firestore.
 * Used by the Settings page so preferences sync across devices.
 */
export async function updateUserPlayerSettings(
  username: string,
  settings: PlayerSettings
): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) throw new Error('User not found');

  await updateDoc(userRef, { playerSettings: settings });

  const userData = userDoc.data() as User;
  return { ...userData, playerSettings: settings };
}

/**
 * Fetch the set of usernames flagged as verified.
 * Used by the leaderboard to render verified badges next to player names.
 */
export async function getVerifiedUsernames(): Promise<Set<string>> {
  try {
    const q = query(collection(db, USERS_COLLECTION), where('verified', '==', true));
    const snap = await getDocs(q);
    const result = new Set<string>();
    snap.docs.forEach((d) => result.add(d.id.toLowerCase()));
    return result;
  } catch (error) {
    console.error('Error fetching verified usernames:', error);
    return new Set();
  }
}

/**
 * Get user data by username
 * @param username - The username to look up
 * @returns Promise that resolves to User object or null if not found
 */
export async function getUserData(username: string): Promise<User | null> {
  try {
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, username));
    
    if (!userDoc.exists()) {
      return null;
    }
    
    return normalizeUserAvatarFields(userDoc.data() as User);
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
}

/**
 * Update user stats after a game
 * @param username - The username to update
 * @param metersEarned - Meters traveled in this game
 * @param coinsEarned - Coins earned in this game
 * @param gemsEarned - Gems earned in this game (20 per 100m milestone)
 * @returns Promise that resolves to updated User object
 */
export async function updateUserStats(
  username: string,
  metersEarned: number,
  coinsEarned: number,
  gemsEarned: number = 0
): Promise<User | null> {
  try {
    const userRef = doc(db, USERS_COLLECTION, username);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error('User not found for stats update:', username);
      return null;
    }
    
    const currentData = userDoc.data() as User;

    // Build updated season data
    const currentSeasonId = getCurrentSeasonId();
    let seasonData: SeasonData;
    if (currentData.seasonData && currentData.seasonData.seasonId === currentSeasonId) {
      seasonData = {
        ...currentData.seasonData,
        meters: currentData.seasonData.meters + metersEarned,
      };
    } else {
      // New season or first interaction — initialize fresh
      seasonData = {
        seasonId: currentSeasonId,
        meters: metersEarned,
        premiumUnlocked: false,
        claimedFree: [],
        claimedPremium: [],
      };
    }

    // Pro Pass meters accrue independently while the pass is active.
    const activeProPass = getProPassConfig();
    let proPassData: ProPassData | null = currentData.proPassData ?? null;
    if (isProPassActive()) {
      if (proPassData && proPassData.passId === activeProPass.id) {
        proPassData = {
          ...proPassData,
          meters: proPassData.meters + metersEarned,
        };
      } else {
        // New pass or first interaction — reset like seasonData on a new seasonId.
        proPassData = {
          passId: activeProPass.id,
          meters: metersEarned,
          premiumUnlocked: false,
          claimedFree: [],
          claimedPremium: [],
        };
      }
    } else if (currentData.proPassData && currentData.proPassData.passId === activeProPass.id) {
      // Pass ended — keep existing progress readable but do not add meters.
      proPassData = currentData.proPassData;
    }
    // Else: pass inactive with no matching progress — omit proPassData from the write.

    const currentGems = currentData.totalGems ?? 0;

    // Update stats
    const updates: Record<string, unknown> = {
      totalMeters: currentData.totalMeters + metersEarned,
      totalCoins: currentData.totalCoins + coinsEarned,
      totalGems: currentGems + gemsEarned,
      seasonData,
    };
    if (
      isProPassActive() ||
      (currentData.proPassData && currentData.proPassData.passId === activeProPass.id)
    ) {
      updates.proPassData = proPassData;
    }

    await updateDoc(userRef, updates);

    // Return updated user data
    const updatedUser: User = {
      ...currentData,
      totalMeters: currentData.totalMeters + metersEarned,
      totalCoins: currentData.totalCoins + coinsEarned,
      totalGems: currentGems + gemsEarned,
      extraBalls: currentData.extraBalls ?? 0,
      seasonData,
      proPassData:
        updates.proPassData !== undefined
          ? (proPassData ?? null)
          : (currentData.proPassData ?? null),
    };

    console.log(`Stats updated for ${username}: +${metersEarned}m, +${coinsEarned} coins, +${gemsEarned} gems`);
    return updatedUser;
  } catch (error) {
    console.error('Error updating user stats:', error);
    return null;
  }
}

export interface AuroraShardAwardResult {
  user: User;
  awarded: boolean;
  auroraShards: number;
  auroraBallUnlocked: boolean;
}

/**
 * Award one Aurora Shard from the 300m challenge, capped at the unlock goal.
 * A transaction prevents duplicate async awards from pushing progress over 12.
 */
export async function awardAuroraShard(username: string): Promise<AuroraShardAwardResult> {
  const userRef = doc(db, USERS_COLLECTION, username);

  return runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) throw new Error('User not found');

    const userData = userDoc.data() as User;
    const currentShards = Math.min(userData.auroraShards ?? 0, AURORA_SHARD_GOAL);
    const alreadyUnlocked = userData.auroraBallUnlocked === true || currentShards >= AURORA_SHARD_GOAL;

    if (alreadyUnlocked) {
      if (userData.auroraShards !== AURORA_SHARD_GOAL || userData.auroraBallUnlocked !== true) {
        // Normalize older/partial documents so the unlock state is persisted forever.
        transaction.update(userRef, {
          auroraShards: AURORA_SHARD_GOAL,
          auroraBallUnlocked: true,
        });
      }

      return {
        user: {
          ...userData,
          auroraShards: AURORA_SHARD_GOAL,
          auroraBallUnlocked: true,
        },
        awarded: false,
        auroraShards: AURORA_SHARD_GOAL,
        auroraBallUnlocked: true,
      };
    }

    const nextShards = Math.min(currentShards + 1, AURORA_SHARD_GOAL);
    const unlocked = nextShards >= AURORA_SHARD_GOAL;
    const updates = {
      auroraShards: nextShards,
      auroraBallUnlocked: unlocked,
    };

    transaction.update(userRef, updates);

    return {
      user: {
        ...userData,
        ...updates,
      },
      awarded: true,
      auroraShards: nextShards,
      auroraBallUnlocked: unlocked,
    };
  });
}

/** Result of awarding one fossil piece collected in Fossil Exploration (MIE-31). */
export interface FossilAwardResult {
  user: User;
  type: FossilTypeId;
  inventory: Partial<Record<FossilTypeId, number>>;
}

/**
 * Persist one collected fossil piece on the user document (transactional).
 */
export async function awardFossilPiece(
  username: string,
  type: FossilTypeId,
): Promise<FossilAwardResult> {
  const userRef = doc(db, USERS_COLLECTION, username);

  return runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) throw new Error('User not found');

    const userData = userDoc.data() as User;
    const inventory = addFossilToInventory(userData.fossilInventory, type, 1);
    transaction.update(userRef, { fossilInventory: inventory });

    return {
      user: { ...userData, fossilInventory: inventory },
      type,
      inventory,
    };
  });
}

/**
 * Start a Fossil Craft Machine job — deducts two fossils and stores a 30-minute timer (MIE-32).
 */
export async function startFossilCraft(
  username: string,
  fossilA: FossilTypeId,
  fossilB: FossilTypeId,
): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);

  return runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) throw new Error('User not found');

    const userData = userDoc.data() as User;
    if (userData.fossilCraftJob) throw new Error('A fossil craft is already in progress');

    if (!hasFossilsForCraft(userData.fossilInventory, fossilA, fossilB)) {
      throw new Error('Not enough fossils for this recipe');
    }
    if (!matchFossilRecipe(fossilA, fossilB)) {
      throw new Error('Invalid fossil recipe');
    }

    const fossilCraftJob = createFossilCraftJob(fossilA, fossilB);
    const fossilInventory = deductFossilsForCraft(userData.fossilInventory, fossilA, fossilB);

    transaction.update(userRef, { fossilInventory, fossilCraftJob });

    return {
      ...userData,
      fossilInventory,
      fossilCraftJob,
    };
  });
}

/**
 * Claim a finished Fossil Craft Machine job — grants the crafted ball (MIE-32).
 */
export async function claimFossilCraft(username: string): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);

  return runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) throw new Error('User not found');

    const userData = userDoc.data() as User;
    const job = userData.fossilCraftJob;
    if (!job) throw new Error('No fossil craft to claim');
    if (!isFossilCraftComplete(job, Date.now())) throw new Error('Craft is not finished yet');
    if (userData.ownedBalls.includes(job.resultBallId)) {
      transaction.update(userRef, { fossilCraftJob: null });
      return { ...userData, fossilCraftJob: null };
    }

    transaction.update(userRef, {
      fossilCraftJob: null,
      ownedBalls: arrayUnion(job.resultBallId),
    });

    return {
      ...userData,
      fossilCraftJob: null,
      ownedBalls: [...userData.ownedBalls, job.resultBallId],
    };
  });
}

/**
 * Purchase a ball type for a user
 * @param username - The username making the purchase
 * @param ballId - The ball type ID to purchase
 * @param price - The cost in coins
 * @returns Promise that resolves to updated User object
 * @throws Error if user doesn't have enough coins or already owns the ball
 */
export async function purchaseBall(
  username: string,
  ballId: string,
  price: number
): Promise<User> {
  try {
    const userRef = doc(db, USERS_COLLECTION, username);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data() as User;
    
    // Check if already owned
    if (userData.ownedBalls.includes(ballId)) {
      throw new Error('Ball already owned');
    }

    // Aurora Ball is a free claim only after the shard journey is complete.
    if (
      ballId === AURORA_BALL_ID &&
      userData.auroraBallUnlocked !== true &&
      (userData.auroraShards ?? 0) < AURORA_SHARD_GOAL
    ) {
      throw new Error('Collect all Aurora Shards first');
    }

    // VIP Ball is only granted via the VIP gamepass purchase flow.
    if (ballId === VIP_BALL_ID && userData.gamepasses?.vip !== true) {
      throw new Error('Purchase the VIP gamepass first');
    }
    
    // Check if user has enough coins
    if (userData.totalCoins < price) {
      throw new Error('Not enough coins');
    }
    
    // Deduct coins and add ball to owned list
    await updateDoc(userRef, {
      totalCoins: userData.totalCoins - price,
      ownedBalls: arrayUnion(ballId),
    });
    
    // Return updated user data
    const updatedUser: User = {
      ...userData,
      totalCoins: userData.totalCoins - price,
      ownedBalls: [...userData.ownedBalls, ballId],
    };
    
    console.log(`Ball purchased: ${ballId} for ${price} coins by ${username}`);
    return updatedUser;
  } catch (error) {
    console.error('Error purchasing ball:', error);
    throw error;
  }
}

/**
 * Purchase a ball with gems (dual-currency balls like Poop Ball — MIE-10).
 * Validates gem price from the ball catalog, not the client-supplied amount.
 */
export async function purchaseBallWithGems(
  username: string,
  ballId: string
): Promise<User> {
  const ball = getBallTypeById(ballId);
  const gemPrice = ball.gemPrice;
  if (!gemPrice || gemPrice <= 0) {
    throw new Error('This ball cannot be purchased with gems');
  }

  const userRef = doc(db, USERS_COLLECTION, username);

  return runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) throw new Error('User not found');

    const userData = userDoc.data() as User;
    if (userData.ownedBalls.includes(ballId)) throw new Error('Ball already owned');

    const currentGems = userData.totalGems ?? 0;
    if (currentGems < gemPrice) throw new Error('Not enough gems');

    transaction.update(userRef, {
      totalGems: currentGems - gemPrice,
      ownedBalls: arrayUnion(ballId),
    });

    return {
      ...userData,
      totalGems: currentGems - gemPrice,
      ownedBalls: [...userData.ownedBalls, ballId],
    };
  });
}

/**
 * Purchase a permanent gamepass with gems (VIP or 2x Cash).
 * VIP also grants the VIP ball into ownedBalls when not already owned.
 */
export async function purchaseGamepass(username: string, passId: GamepassId): Promise<User> {
  const pass = getGamepassById(passId);
  const userRef = doc(db, USERS_COLLECTION, username);

  return runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) throw new Error('User not found');

    const userData = userDoc.data() as User;
    const currentGems = userData.totalGems ?? 0;
    const ownedPasses = userData.gamepasses ?? {};

    if (passId === 'vip' && ownedPasses.vip) throw new Error('Gamepass already owned');
    if (passId === 'doubleCash' && ownedPasses.doubleCash) throw new Error('Gamepass already owned');
    if (currentGems < pass.gemPrice) throw new Error('Not enough gems');

    const updates: Record<string, unknown> = {
      totalGems: currentGems - pass.gemPrice,
      gamepasses: {
        ...ownedPasses,
        [passId]: true,
      },
    };

    let ownedBalls = userData.ownedBalls;
    if (passId === 'vip' && !ownedBalls.includes(VIP_BALL_ID)) {
      updates.ownedBalls = arrayUnion(VIP_BALL_ID);
      ownedBalls = [...ownedBalls, VIP_BALL_ID];
    }

    transaction.update(userRef, updates);

    return {
      ...userData,
      totalGems: currentGems - pass.gemPrice,
      gamepasses: {
        ...ownedPasses,
        [passId]: true,
      },
      ownedBalls,
    };
  });
}

/**
 * Fetch usernames with VIP gamepass for leaderboard fallback rows
 * that predate isVip denormalization on score docs.
 */
export async function getVipUsernames(): Promise<Set<string>> {
  try {
    const q = query(collection(db, USERS_COLLECTION), where('gamepasses.vip', '==', true));
    const snap = await getDocs(q);
    const result = new Set<string>();
    snap.docs.forEach((d) => result.add(d.id.toLowerCase()));
    return result;
  } catch (error) {
    console.error('Error fetching VIP usernames:', error);
    return new Set();
  }
}

/**
 * Select a ball type for a user
 * @param username - The username
 * @param ballId - The ball type ID to select
 * @returns Promise that resolves to updated User object
 * @throws Error if user doesn't own the ball
 */
export async function selectBall(
  username: string,
  ballId: string
): Promise<User> {
  try {
    const userRef = doc(db, USERS_COLLECTION, username);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data() as User;
    
    // Check if ball is owned (default is always owned)
    if (ballId !== 'default' && !userData.ownedBalls.includes(ballId)) {
      throw new Error('Ball not owned');
    }
    
    // Update selected ball
    await updateDoc(userRef, {
      selectedBall: ballId,
    });
    
    // Return updated user data
    const updatedUser: User = {
      ...userData,
      selectedBall: ballId,
    };
    
    console.log(`Ball selected: ${ballId} by ${username}`);
    return updatedUser;
  } catch (error) {
    console.error('Error selecting ball:', error);
    throw error;
  }
}

// ============================================
// SEASON FUNCTIONS
// ============================================

/**
 * Fetch a season reward config from Firestore.
 * Returns null when the document is missing or unreadable so callers can use
 * the checked-in config as a fallback.
 */
export async function getSeasonConfigFromFirestore(seasonId: string): Promise<SeasonConfig | null> {
  try {
    const seasonDoc = await getDoc(doc(db, SEASON_CONFIGS_COLLECTION, seasonId));
    if (!seasonDoc.exists()) return null;

    const data = seasonDoc.data() as SeasonConfig;
    return {
      ...data,
      id: data.id ?? seasonDoc.id,
    };
  } catch (error) {
    console.error('Error fetching season config from Firestore:', error);
    return null;
  }
}

/**
 * Read season reward details from Firestore first, then fall back to the local
 * definitions so static exports and offline/missing docs continue to work.
 */
export async function getSeasonConfigWithFallback(seasonId: string): Promise<SeasonConfig | null> {
  const firestoreConfig = await getSeasonConfigFromFirestore(seasonId);
  return firestoreConfig ?? getSeasonConfig(seasonId);
}

/**
 * Claim a season reward (free or premium track)
 * @param username - The username claiming
 * @param seasonId - The season id (must match current season on user doc)
 * @param track - 'free' or 'premium'
 * @param levelIndex - 0-4 level to claim
 * @returns Updated User
 */
export async function claimSeasonReward(
  username: string,
  seasonId: string,
  track: 'free' | 'premium',
  levelIndex: number
): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) throw new Error('User not found');

  const userData = userDoc.data() as User;
  const sd = userData.seasonData;
  if (!sd || sd.seasonId !== seasonId) throw new Error('Season data mismatch');

  // Only allow claims for the current active season
  if (seasonId !== getCurrentSeasonId()) throw new Error('Season has ended');

  const config = await getSeasonConfigWithFallback(seasonId);
  if (!config) throw new Error('Unknown season');
  if (levelIndex < 0 || levelIndex >= config.levels.length) throw new Error('Invalid level');

  const level = config.levels[levelIndex];
  if (sd.meters < level.meterThreshold) throw new Error('Threshold not reached');

  const claimedArray = track === 'free' ? sd.claimedFree : sd.claimedPremium;
  if (claimedArray.includes(levelIndex)) throw new Error('Already claimed');
  if (track === 'premium' && !sd.premiumUnlocked) throw new Error('Premium not unlocked');

  const reward = track === 'free' ? level.freeReward : level.premiumReward;

  // Build the Firestore update payload
  const updates: Record<string, unknown> = {};
  const updatedUser: User = { ...userData, extraBalls: userData.extraBalls ?? 0 };

  // Mark as claimed
  const newClaimed = [...claimedArray, levelIndex];
  if (track === 'free') {
    updates['seasonData.claimedFree'] = newClaimed;
    updatedUser.seasonData = { ...sd, claimedFree: newClaimed };
  } else {
    updates['seasonData.claimedPremium'] = newClaimed;
    updatedUser.seasonData = { ...sd, claimedPremium: newClaimed };
  }

  // Apply reward
  switch (reward.type) {
    case 'coins':
      updates.totalCoins = userData.totalCoins + (reward.amount ?? 0);
      updatedUser.totalCoins = updates.totalCoins as number;
      break;
    case 'extraBall':
      updates.extraBalls = (userData.extraBalls ?? 0) + (reward.amount ?? 1);
      updatedUser.extraBalls = updates.extraBalls as number;
      break;
    case 'ball':
      if (reward.ballId && !userData.ownedBalls.includes(reward.ballId)) {
        updates.ownedBalls = arrayUnion(reward.ballId);
        updatedUser.ownedBalls = [...userData.ownedBalls, reward.ballId];
      }
      break;
  }

  await updateDoc(userRef, updates);
  return updatedUser;
}

/**
 * Purchase the premium track for a season
 */
export async function purchaseSeasonPremium(
  username: string,
  seasonId: string,
  cost: number
): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) throw new Error('User not found');

  const currentSeasonId = getCurrentSeasonId();
  if (seasonId !== currentSeasonId) throw new Error('Season has ended');

  const config = await getSeasonConfigWithFallback(seasonId);
  if (!config) throw new Error('Unknown season');

  const userData = userDoc.data() as User;
  const premiumCost = config.premiumCost;
  if (cost !== premiumCost) {
    console.warn(`Ignoring stale premium cost ${cost}; using configured cost ${premiumCost}`);
  }
  if (userData.totalCoins < premiumCost) throw new Error('Not enough coins');

  let sd = userData.seasonData;

  // Initialize season data if needed
  if (!sd || sd.seasonId !== currentSeasonId) {
    sd = {
      seasonId: currentSeasonId,
      meters: 0,
      premiumUnlocked: true,
      claimedFree: [],
      claimedPremium: [],
    };
  } else {
    sd = { ...sd, premiumUnlocked: true };
  }

  await updateDoc(userRef, {
    totalCoins: userData.totalCoins - premiumCost,
    seasonData: sd,
  });

  return {
    ...userData,
    totalCoins: userData.totalCoins - premiumCost,
    extraBalls: userData.extraBalls ?? 0,
    seasonData: sd,
  };
}

// ============================================
// PRO PASS FUNCTIONS
// ============================================

/**
 * Fetch a Pro Pass config from Firestore (optional override of local defaults).
 */
export async function getProPassConfigFromFirestore(passId: string): Promise<ProPassConfig | null> {
  try {
    const passDoc = await getDoc(doc(db, PRO_PASS_CONFIGS_COLLECTION, passId));
    if (!passDoc.exists()) return null;

    const data = passDoc.data() as ProPassConfig;
    return {
      ...data,
      id: data.id ?? passDoc.id,
    };
  } catch (error) {
    console.error('Error fetching Pro Pass config from Firestore:', error);
    return null;
  }
}

/** Read Pro Pass config from Firestore first, then fall back to checked-in defaults. */
export async function getProPassConfigWithFallback(passId?: string): Promise<ProPassConfig | null> {
  const localConfig = getProPassConfig();
  const targetId = passId ?? localConfig.id;
  const firestoreConfig = await getProPassConfigFromFirestore(targetId);
  if (firestoreConfig) return firestoreConfig;
  // Unknown pass IDs must not silently fall back to the current local config.
  return targetId === localConfig.id ? localConfig : null;
}

/**
 * Claim a Pro Pass reward. Claims stay available after the pass ends;
 * only meter accrual stops at endAtMs.
 */
export async function claimProPassReward(
  username: string,
  passId: string,
  track: 'free' | 'premium',
  levelIndex: number
): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) throw new Error('User not found');

  const userData = userDoc.data() as User;
  const pp = userData.proPassData;
  if (!pp || pp.passId !== passId) throw new Error('Pro Pass data mismatch');

  const config = await getProPassConfigWithFallback(passId);
  if (!config) throw new Error('Unknown Pro Pass');
  if (levelIndex < 0 || levelIndex >= config.levels.length) throw new Error('Invalid level');

  const level = config.levels[levelIndex];
  if (pp.meters < level.meterThreshold) throw new Error('Threshold not reached');

  const claimedArray = track === 'free' ? pp.claimedFree : pp.claimedPremium;
  if (claimedArray.includes(levelIndex)) throw new Error('Already claimed');
  if (track === 'premium' && !pp.premiumUnlocked) throw new Error('Premium not unlocked');

  const reward = track === 'free' ? level.freeReward : level.premiumReward;

  const updates: Record<string, unknown> = {};
  const updatedUser: User = { ...userData, extraBalls: userData.extraBalls ?? 0 };

  const newClaimed = [...claimedArray, levelIndex];
  if (track === 'free') {
    updates['proPassData.claimedFree'] = newClaimed;
    updatedUser.proPassData = { ...pp, claimedFree: newClaimed };
  } else {
    updates['proPassData.claimedPremium'] = newClaimed;
    updatedUser.proPassData = { ...pp, claimedPremium: newClaimed };
  }

  switch (reward.type) {
    case 'coins':
      updates.totalCoins = userData.totalCoins + (reward.amount ?? 0);
      updatedUser.totalCoins = updates.totalCoins as number;
      break;
    case 'extraBall':
      updates.extraBalls = (userData.extraBalls ?? 0) + (reward.amount ?? 1);
      updatedUser.extraBalls = updates.extraBalls as number;
      break;
    case 'ball':
      if (reward.ballId && !userData.ownedBalls.includes(reward.ballId)) {
        updates.ownedBalls = arrayUnion(reward.ballId);
        updatedUser.ownedBalls = [...userData.ownedBalls, reward.ballId];
      }
      break;
  }

  await updateDoc(userRef, updates);
  return updatedUser;
}

/** Purchase the Pro Pass premium track for 50,000 coins. */
export async function purchaseProPassPremium(
  username: string,
  passId: string,
  cost: number
): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) throw new Error('User not found');

  if (isProPassEnded()) throw new Error('Pro Pass has ended');

  const config = await getProPassConfigWithFallback(passId);
  if (!config || passId !== config.id) throw new Error('Unknown Pro Pass');

  const userData = userDoc.data() as User;
  const premiumCost = config.premiumCost;
  if (cost !== premiumCost) {
    console.warn(`Ignoring stale Pro Pass premium cost ${cost}; using configured cost ${premiumCost}`);
  }
  if (userData.totalCoins < premiumCost) throw new Error('Not enough coins');

  // Prevent double-charging if premium was already unlocked.
  if (userData.proPassData?.passId === config.id && userData.proPassData.premiumUnlocked) {
    throw new Error('Premium already unlocked');
  }

  let pp = userData.proPassData;

  if (!pp || pp.passId !== config.id) {
    pp = {
      passId: config.id,
      meters: 0,
      premiumUnlocked: true,
      claimedFree: [],
      claimedPremium: [],
    };
  } else {
    pp = { ...pp, premiumUnlocked: true };
  }

  await updateDoc(userRef, {
    totalCoins: userData.totalCoins - premiumCost,
    proPassData: pp,
  });

  return {
    ...userData,
    totalCoins: userData.totalCoins - premiumCost,
    extraBalls: userData.extraBalls ?? 0,
    proPassData: pp,
  };
}

/**
 * Use one extra ball (for revival). Decrements the count.
 */
export async function useExtraBall(username: string): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) throw new Error('User not found');

  const userData = userDoc.data() as User;
  const current = userData.extraBalls ?? 0;
  if (current <= 0) throw new Error('No extra balls');

  await updateDoc(userRef, { extraBalls: current - 1 });

  return {
    ...userData,
    extraBalls: current - 1,
  };
}

// ============================================
// ADMIN PANEL: PLAYERS, EVENTS, POLLS, MESSAGES
// ============================================

const EVENTS_COLLECTION = 'events';
const POLLS_COLLECTION = 'polls';
const MESSAGES_COLLECTION = 'messages';
const SHOP_OFFERS_COLLECTION = 'shopOffers';
const GIFT_TRANSACTIONS_COLLECTION = 'giftTransactions';

/** Shop gift payload passed from the Gift modal (MIE-21). */
export interface GiftShopItemRequest {
  itemType: 'ball' | 'gamepass';
  itemId: string;
  itemLabel: string;
  gemCost: number;
}

/**
 * List every user document. Used by the admin Players tab.
 */
export async function getAllUsers(): Promise<User[]> {
  const snap = await getDocs(collection(db, USERS_COLLECTION));
  return snap.docs.map((d) => d.data() as User);
}

// ----- Events -----

export async function createGameEvent(
  type: GameEventType,
  startAtMs: number,
  durationSec: number,
  createdBy: string,
): Promise<void> {
  await addDoc(collection(db, EVENTS_COLLECTION), {
    type,
    startAtMs,
    durationSec,
    createdBy,
    createdAtMs: Date.now(),
    createdAt: serverTimestamp(),
  });
}

/**
 * Stop / cancel a game event. Removes the doc so listeners drop it
 * immediately — works for both upcoming and currently-active events.
 */
export async function deleteGameEvent(eventId: string): Promise<void> {
  await deleteDoc(doc(db, EVENTS_COLLECTION, eventId));
}

/**
 * Subscribe to events that haven't fully expired yet (started + duration > now).
 * Caller is responsible for filtering scheduled-vs-active by clock.
 */
export function subscribeToActiveEvents(
  onChange: (events: GameEvent[]) => void,
): Unsubscribe {
  // No where clause to avoid composite-index requirements; filter client-side.
  const q = query(collection(db, EVENTS_COLLECTION), orderBy('startAtMs', 'desc'), limit(20));
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const events: GameEvent[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<GameEvent, 'id'>) }))
      .filter((e) => e.startAtMs + e.durationSec * 1000 > now);
    onChange(events);
  });
}

// ----- Messages -----

export async function createBroadcastMessage(
  text: string,
  createdBy: string,
  ttlMs: number = 24 * 60 * 60 * 1000,
): Promise<void> {
  const now = Date.now();
  await addDoc(collection(db, MESSAGES_COLLECTION), {
    text,
    createdBy,
    createdAtMs: now,
    expiresAtMs: now + ttlMs,
    createdAt: serverTimestamp(),
  });
}

/**
 * Subscribe to recent broadcast messages that haven't expired yet.
 * Filtering is client-side so we don't need a composite index.
 */
export function subscribeToActiveMessages(
  onChange: (messages: BroadcastMessage[]) => void,
): Unsubscribe {
  const q = query(collection(db, MESSAGES_COLLECTION), orderBy('createdAtMs', 'desc'), limit(20));
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const msgs: BroadcastMessage[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<BroadcastMessage, 'id'>) }))
      .filter((m) => m.expiresAtMs > now);
    onChange(msgs);
  });
}

/**
 * Mark a message as seen for a user — appends id to seenMessageIds.
 */
export async function markMessageSeen(username: string, messageId: string): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, username);
  await updateDoc(userRef, { seenMessageIds: arrayUnion(messageId) });
}

// ----- Shop Offers -----

export async function createShopOffer(
  itemId: string,
  price: number,
  endsAtMs: number,
  createdBy: string,
): Promise<void> {
  const now = Date.now();
  if (!itemId) throw new Error('Offer item required');
  if (!Number.isInteger(price) || price < 0) throw new Error('Price must be a whole number');
  if (endsAtMs <= now) throw new Error('Expiration must be in the future');

  await addDoc(collection(db, SHOP_OFFERS_COLLECTION), {
    itemType: 'ball',
    itemId,
    price,
    startAtMs: now,
    endsAtMs,
    createdBy,
    createdAtMs: now,
    createdAt: serverTimestamp(),
  });
}

/**
 * Cancel a shop offer by deleting the document so player/admin listeners
 * remove it immediately.
 */
export async function deleteShopOffer(offerId: string): Promise<void> {
  await deleteDoc(doc(db, SHOP_OFFERS_COLLECTION, offerId));
}

/**
 * Subscribe to offers that have not ended yet. Start-time filtering stays in
 * the UI so future-scheduled offers become visible without a composite index.
 */
export function subscribeToActiveShopOffers(
  onChange: (offers: ShopOffer[]) => void,
): Unsubscribe {
  const q = query(collection(db, SHOP_OFFERS_COLLECTION), orderBy('createdAtMs', 'desc'), limit(50));
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const offers: ShopOffer[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<ShopOffer, 'id'>) }))
      .filter((offer) => offer.itemType === 'ball' && offer.endsAtMs > now);
    onChange(offers);
  });
}

/**
 * Purchase through an offer after re-reading the offer doc so an already-open
 * shop page cannot buy from an offer that expired after it rendered.
 */
export async function purchaseShopOffer(username: string, offerId: string): Promise<User> {
  const offerDoc = await getDoc(doc(db, SHOP_OFFERS_COLLECTION, offerId));
  if (!offerDoc.exists()) throw new Error('Offer no longer exists');

  const offer = { id: offerDoc.id, ...(offerDoc.data() as Omit<ShopOffer, 'id'>) };
  const now = Date.now();
  if (offer.itemType !== 'ball') throw new Error('Unsupported offer item');
  if (now < offer.startAtMs || now >= offer.endsAtMs) throw new Error('Offer expired');

  return purchaseBall(username, offer.itemId, offer.price);
}

// ----- Polls -----

export async function createPoll(
  question: string,
  options: string[],
  createdBy: string,
): Promise<void> {
  // Deactivate prior polls so only one is live at a time.
  const existing = await getDocs(query(collection(db, POLLS_COLLECTION), where('active', '==', true)));
  await Promise.all(existing.docs.map((d) => updateDoc(d.ref, { active: false })));

  await addDoc(collection(db, POLLS_COLLECTION), {
    question,
    options,
    counts: Object.fromEntries(options.map((_, i) => [String(i), 0])),
    createdBy,
    createdAtMs: Date.now(),
    createdAt: serverTimestamp(),
    active: true,
  });
}

/**
 * Subscribe to the currently active poll, if any.
 */
export function subscribeToActivePoll(
  onChange: (poll: Poll | null) => void,
): Unsubscribe {
  const q = query(collection(db, POLLS_COLLECTION), where('active', '==', true), limit(1));
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      onChange(null);
      return;
    }
    const d = snap.docs[0];
    onChange({ id: d.id, ...(d.data() as Omit<Poll, 'id'>) });
  });
}

/**
 * Has the given user already voted in the given poll?
 */
export async function hasUserAnsweredPoll(pollId: string, username: string): Promise<boolean> {
  const ref = doc(db, POLLS_COLLECTION, pollId, 'answers', username);
  const snap = await getDoc(ref);
  return snap.exists();
}

/**
 * Return the option index this user voted for, or null if they haven't voted.
 */
export async function getUserPollAnswer(pollId: string, username: string): Promise<number | null> {
  const ref = doc(db, POLLS_COLLECTION, pollId, 'answers', username);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as { optionIndex?: number };
  return typeof data.optionIndex === 'number' ? data.optionIndex : null;
}

/**
 * Submit a poll answer. Atomically writes the user's answer doc and
 * increments the corresponding option counter on the poll.
 */
export async function submitPollAnswer(
  pollId: string,
  username: string,
  optionIndex: number,
): Promise<void> {
  const answerRef = doc(db, POLLS_COLLECTION, pollId, 'answers', username);
  const existing = await getDoc(answerRef);
  if (existing.exists()) throw new Error('Already answered');

  await setDoc(answerRef, {
    optionIndex,
    answeredAtMs: Date.now(),
  });
  await updateDoc(doc(db, POLLS_COLLECTION, pollId), {
    [`counts.${optionIndex}`]: increment(1),
  });
}

/**
 * End the currently active poll (admin "Close" action).
 */
export async function closePoll(pollId: string): Promise<void> {
  await updateDoc(doc(db, POLLS_COLLECTION, pollId), { active: false });
}

// ============================================
// AVATAR ITEM FUNCTIONS (MIE-12)
// ============================================

/** Persist starter avatar fields for legacy users missing them (MIE-16). */
export async function ensureUserAvatarMigration(username: string): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) throw new Error('User not found');

  const raw = userDoc.data() as User;
  const normalized = normalizeUserAvatarFields(raw);
  const needsWrite =
    !raw.ownedAvatarItems ||
    !raw.equippedAvatar ||
    raw.ownedAvatarItems.length !== normalized.ownedAvatarItems!.length;

  if (needsWrite) {
    await updateDoc(userRef, {
      ownedAvatarItems: normalized.ownedAvatarItems,
      equippedAvatar: normalized.equippedAvatar,
      skinColor: normalized.skinColor,
    });
  }

  return normalized;
}

export function subscribeToAvatarItems(
  callback: (items: AvatarItem[]) => void
): Unsubscribe {
  const q = query(collection(db, AVATAR_ITEMS_COLLECTION), orderBy('createdAtMs', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AvatarItem, 'id'>) }));
      callback(items);
    },
    (error) => {
      console.error('Error subscribing to avatar items:', error);
      callback([]);
    }
  );
}

export async function createAvatarItem(
  creatorUsername: string,
  input: Omit<AvatarItem, 'id' | 'creatorUsername' | 'createdAtMs' | 'updatedAtMs'>
): Promise<AvatarItem> {
  const now = Date.now();
  const id = `avatar-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const item: AvatarItem = {
    ...input,
    id,
    creatorUsername: creatorUsername.toUpperCase(),
    createdAtMs: now,
    updatedAtMs: now,
  };
  await setDoc(doc(db, AVATAR_ITEMS_COLLECTION, id), item);
  return item;
}

export async function updateAvatarItem(
  itemId: string,
  updates: Partial<
    Pick<
      AvatarItem,
      | 'name'
      | 'description'
      | 'gemPrice'
      | 'onSale'
      | 'stock'
      | 'previewImageUrl'
      | 'modelUrl'
      | 'modelGlbUrl'
      | 'shirtTextureUrl'
      | 'textureUrl'
      | 'faceOverlayUrl'
      | 'emoteAnimation'
      | 'source'
      | 'ugcPrompt'
    >
  >
): Promise<void> {
  await updateDoc(doc(db, AVATAR_ITEMS_COLLECTION, itemId), {
    ...updates,
    updatedAtMs: Date.now(),
  });
}

export async function deleteAvatarItem(itemId: string): Promise<void> {
  await deleteDoc(doc(db, AVATAR_ITEMS_COLLECTION, itemId));
}

/** Purchase an avatar item with gems; decrements limited stock atomically. */
export async function purchaseAvatarItem(
  username: string,
  item: AvatarItem
): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);
  const itemRef = doc(db, AVATAR_ITEMS_COLLECTION, item.id);

  return runTransaction(db, async (transaction) => {
    const [userDoc, itemDoc] = await Promise.all([
      transaction.get(userRef),
      item.id.startsWith('starter-') ? Promise.resolve(null) : transaction.get(itemRef),
    ]);

    if (!userDoc.exists()) throw new Error('User not found');

    const userData = normalizeUserAvatarFields(userDoc.data() as User);
    if (userData.ownedAvatarItems!.includes(item.id)) throw new Error('Already owned');

    let liveItem = item;
    if (!item.id.startsWith('starter-')) {
      if (!itemDoc?.exists()) throw new Error('Item not found');
      liveItem = { id: itemDoc.id, ...(itemDoc.data() as Omit<AvatarItem, 'id'>) };
      if (!liveItem.onSale) throw new Error('Item is off sale');
      if (liveItem.stock !== null && liveItem.stock <= 0) throw new Error('Sold out');
    }

    const gemPrice = liveItem.gemPrice ?? 0;
    const currentGems = userData.totalGems ?? 0;
    if (currentGems < gemPrice) throw new Error('Not enough gems');

    const updates: Record<string, unknown> = {
      totalGems: currentGems - gemPrice,
      ownedAvatarItems: arrayUnion(item.id),
    };

    if (!item.id.startsWith('starter-') && liveItem.stock !== null) {
      transaction.update(itemRef, { stock: liveItem.stock! - 1, updatedAtMs: Date.now() });
    }

    transaction.update(userRef, updates);

    return {
      ...userData,
      totalGems: currentGems - gemPrice,
      ownedAvatarItems: [...(userData.ownedAvatarItems ?? []), item.id],
    };
  });
}

/** Equip an owned item into its body slot (replaces prior item in that slot). */
export async function equipAvatarItem(
  username: string,
  itemId: string,
  partType: AvatarPartType
): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) throw new Error('User not found');

  const userData = normalizeUserAvatarFields(userDoc.data() as User);
  if (!userData.ownedAvatarItems!.includes(itemId)) throw new Error('Item not owned');

  // Soft-guard: refuse to equip catalog rows with unloadable SVG wear maps (MIE-40).
  // Face/emote slots don't use body UV maps, so skip the check for those.
  if (partType !== 'face' && partType !== 'emote') {
    const catalogItem = await getDoc(doc(db, AVATAR_ITEMS_COLLECTION, itemId));
    if (catalogItem.exists()) {
      const data = catalogItem.data() as AvatarItem;
      const wearUrl = data.textureUrl ?? data.shirtTextureUrl ?? null;
      if (wearUrl && !isLoadableAvatarTextureUrl(wearUrl)) {
        throw new Error(
          'This item uses an unsupported texture format and cannot be equipped. Try creating it again in Avatar Studio.',
        );
      }
    }
  }

  const equipped: EquippedAvatar = {
    ...(userData.equippedAvatar ?? createStarterEquippedAvatar()),
    [partType]: itemId,
  };

  await updateDoc(userRef, { equippedAvatar: equipped });
  return { ...userData, equippedAvatar: equipped };
}

/** Clear one body slot (unequip). */
export async function unequipAvatarSlot(
  username: string,
  partType: AvatarPartType
): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) throw new Error('User not found');

  const userData = normalizeUserAvatarFields(userDoc.data() as User);
  const equipped: EquippedAvatar = {
    ...(userData.equippedAvatar ?? createStarterEquippedAvatar()),
    [partType]: null,
  };

  await updateDoc(userRef, { equippedAvatar: equipped });
  return { ...userData, equippedAvatar: equipped };
}

// ============================================
// 3D AVATAR — SKIN COLOR + GEMINI UGC (MIE-18)
// ============================================

/** Credentials bundle for secure avatar Cloud Functions (custom auth). */
function avatarAuth(user: User): { username: string; password: string } {
  return { username: user.username, password: user.password };
}

/** Persist free skin tint on the user doc (MIE-18 points #9, #14). */
export async function updateUserSkinColor(username: string, skinColor: string): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) throw new Error('User not found');

  const normalized = skinColor.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error('Invalid color — use a hex value like #FFAA00');
  }

  await updateDoc(userRef, { skinColor: normalized });
  const userData = normalizeUserAvatarFields(userDoc.data() as User);
  return { ...userData, skinColor: normalized };
}

export interface AvatarTextureDraftResult {
  draftId: string;
  textureUrl: string;
  previewImageUrl: string;
}

/** Call Gemini (server-side) to generate a 2D texture draft for UGC preview (MIE-18). */
export async function generateAvatarTextureDraft(
  user: User,
  partType: AvatarPartType,
  prompt: string,
): Promise<AvatarTextureDraftResult> {
  const fn = httpsCallable<
    { username: string; password: string; partType: AvatarPartType; prompt: string },
    AvatarTextureDraftResult
  >(functions, 'generateAvatarTexture');
  const result = await fn({ ...avatarAuth(user), partType, prompt });
  return result.data;
}

export interface PublishAvatarUgcInput {
  draftId: string;
  name: string;
  description: string;
  partType: AvatarPartType;
  textureUrl: string;
  previewImageUrl: string;
  ugcPrompt: string;
}

/** Publish a liked Gemini draft straight to avatarItems for all players (MIE-18 point #10). */
export async function publishAvatarUgcItem(
  user: User,
  input: PublishAvatarUgcInput,
): Promise<User> {
  const fn = httpsCallable<
    PublishAvatarUgcInput & { username: string; password: string },
    { itemId: string; user: User }
  >(functions, 'publishAvatarUgcItem');
  const result = await fn({ ...avatarAuth(user), ...input });
  return normalizeUserAvatarFields(result.data.user);
}

// ============================================
// AVATAR ITEM STUDIO (MIE-37)
// ============================================

/** Create a blank studio project via Cloud Function (owner-scoped). */
export async function createAvatarStudioProject(
  user: User,
  targetPartType: AvatarPartType = 'shirt',
  name = 'Untitled project',
): Promise<AvatarStudioProject> {
  const fn = httpsCallable<
    { username: string; password: string; targetPartType: AvatarPartType; name: string },
    AvatarStudioProject
  >(functions, 'createAvatarStudioProject');
  const result = await fn({ ...avatarAuth(user), targetPartType, name });
  return result.data;
}

/** Persist studio project edits — layers, slot, name (MIE-37). */
export async function updateAvatarStudioProject(
  user: User,
  project: AvatarStudioProject,
): Promise<AvatarStudioProject> {
  const fn = httpsCallable<
    { username: string; password: string; project: AvatarStudioProject },
    AvatarStudioProject
  >(functions, 'updateAvatarStudioProject');
  const result = await fn({ ...avatarAuth(user), project });
  return result.data;
}

/** Load one studio project by id (owner-only via CF). */
export async function getAvatarStudioProject(
  user: User,
  projectId: string,
): Promise<AvatarStudioProject | null> {
  const fn = httpsCallable<
    { username: string; password: string; projectId: string },
    AvatarStudioProject | null
  >(functions, 'getAvatarStudioProject');
  const result = await fn({ ...avatarAuth(user), projectId });
  return result.data;
}

/** List the logged-in player's studio drafts. */
export async function getMyAvatarStudioProjects(user: User): Promise<AvatarStudioProject[]> {
  const fn = httpsCallable<{ username: string; password: string }, AvatarStudioProject[]>(
    functions,
    'getMyAvatarStudioProjects',
  );
  const result = await fn(avatarAuth(user));
  return result.data ?? [];
}

export interface PublishAvatarStudioInput {
  projectId: string;
  name: string;
  description: string;
  /** Base64 PNG payload (no data: prefix) flattened from studio layers. */
  textureBase64: string;
}

/** Flatten project layers server-side and publish to avatarItems with source: studio (MIE-37). */
export async function publishAvatarStudioItem(
  user: User,
  input: PublishAvatarStudioInput,
): Promise<User> {
  const fn = httpsCallable<
    PublishAvatarStudioInput & { username: string; password: string },
    { itemId: string; user: User }
  >(functions, 'publishAvatarStudioItem');
  const result = await fn({ ...avatarAuth(user), ...input });
  return normalizeUserAvatarFields(result.data.user);
}

// ============================================
// SHOP GIFTING (MIE-21)
// ============================================

/**
 * @deprecated Use searchPlayersByPrefix — MIE-36: display-name doc ids must not be uppercased.
 */
export async function searchUsersByPrefix(prefix: string, limitCount = 20): Promise<User[]> {
  return searchPlayersByPrefix(prefix, limitCount);
}

/** Read undismissed gift notifications for the logged-in recipient. */
export async function getPendingGifts(username: string): Promise<PendingGift[]> {
  const user = await getUserData(username);
  return user?.pendingGifts ?? [];
}

/**
 * Live listener on the recipient user doc so online players see gift popups immediately.
 */
export function subscribeToPendingGifts(
  username: string,
  onChange: (gifts: PendingGift[]) => void,
): Unsubscribe {
  // MIE-36: users/{docId} keys are case-preserving display names — never uppercase.
  const userRef = doc(db, USERS_COLLECTION, username.trim());
  return onSnapshot(userRef, (snap) => {
    if (!snap.exists()) {
      onChange([]);
      return;
    }
    const data = snap.data() as User;
    onChange(data.pendingGifts ?? []);
  });
}

/** Remove one pending gift after the recipient dismisses the popup. */
export async function ackPendingGift(username: string, giftId: string): Promise<void> {
  // MIE-36: resolve canonical doc id so dismiss works for mixed-case display names.
  const docId = (await resolveUserDocId(username)) ?? username.trim();
  const userRef = doc(db, USERS_COLLECTION, docId);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) return;

  const userData = userDoc.data() as User;
  const remaining = (userData.pendingGifts ?? []).filter((g) => g.id !== giftId);
  await updateDoc(userRef, { pendingGifts: remaining });
}

/**
 * Atomically gift a gem-priced shop item to another player.
 * Debits gifter gems, grants item to recipient, queues popup notification.
 */
export async function giftShopItem(
  fromUsername: string,
  toUsername: string,
  request: GiftShopItemRequest,
): Promise<{ gifter: User; recipientUsername: string }> {
  // MIE-36: resolve canonical doc ids — post-MIE-23 names are mixed-case, not legacy ABC ids.
  const gifterKey = await resolveUserDocId(fromUsername);
  if (!gifterKey) throw new Error('Gifter not found');
  const recipientKey = await resolveUserDocId(toUsername);
  if (!recipientKey) throw new Error('Player not found');

  if (gifterKey.toLowerCase() === recipientKey.toLowerCase()) {
    throw new Error('You cannot gift items to yourself');
  }

  const gifterRef = doc(db, USERS_COLLECTION, gifterKey);
  const recipientRef = doc(db, USERS_COLLECTION, recipientKey);
  const giftId = `gift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const gifterUser = await runTransaction(db, async (transaction) => {
    const [gifterDoc, recipientDoc] = await Promise.all([
      transaction.get(gifterRef),
      transaction.get(recipientRef),
    ]);

    if (!gifterDoc.exists()) throw new Error('Gifter not found');
    if (!recipientDoc.exists()) throw new Error('Player not found');

    const gifterData = gifterDoc.data() as User;
    const recipientData = recipientDoc.data() as User;
    const currentGems = gifterData.totalGems ?? 0;

    if (currentGems < request.gemCost) {
      throw new Error('Not enough gems');
    }

    // MIE-35: validate canonical gift gem cost for balls (blocks client cost spoofing).
    if (request.itemType === 'ball') {
      const ball = getBallTypeById(request.itemId);
      if (!isBallGiftable(ball)) {
        throw new Error('This ball cannot be gifted');
      }
      const canonicalCost = getBallGiftGemPrice(ball);
      if (canonicalCost === null || request.gemCost !== canonicalCost) {
        throw new Error('Invalid gift cost');
      }
    }

    // Block when recipient already owns the item or gamepass.
    if (request.itemType === 'ball') {
      if (recipientData.ownedBalls.includes(request.itemId)) {
        throw new Error('Player already has Item');
      }
    } else if (request.itemType === 'gamepass') {
      const passes = recipientData.gamepasses ?? {};
      if (request.itemId === 'vip' && passes.vip) {
        throw new Error('Player already has Item');
      }
      if (request.itemId === 'doubleCash' && passes.doubleCash) {
        throw new Error('Player already has Item');
      }
    }

    const pendingGift: PendingGift = {
      id: giftId,
      fromUsername: gifterKey,
      itemType: request.itemType,
      itemId: request.itemId,
      itemLabel: request.itemLabel,
      createdAtMs: Date.now(),
    };

    const recipientUpdates: Record<string, unknown> = {
      pendingGifts: arrayUnion(pendingGift),
    };

    if (request.itemType === 'ball') {
      recipientUpdates.ownedBalls = arrayUnion(request.itemId);
    } else {
      const ownedPasses = recipientData.gamepasses ?? {};
      recipientUpdates.gamepasses = {
        ...ownedPasses,
        [request.itemId]: true,
      };
      // VIP gamepass also grants the VIP ball, matching self-purchase behavior.
      if (request.itemId === 'vip' && !recipientData.ownedBalls.includes(VIP_BALL_ID)) {
        recipientUpdates.ownedBalls = arrayUnion(VIP_BALL_ID);
      }
    }

    transaction.update(gifterRef, {
      totalGems: currentGems - request.gemCost,
    });
    transaction.update(recipientRef, recipientUpdates);

    // Audit log — written in the same transaction for consistency.
    const auditRef = doc(collection(db, GIFT_TRANSACTIONS_COLLECTION));
    const auditRow: GiftTransaction = {
      id: auditRef.id,
      fromUsername: gifterKey,
      toUsername: recipientKey,
      itemType: request.itemType,
      itemId: request.itemId,
      gemCost: request.itemType === 'ball'
        ? (getBallGiftGemPrice(getBallTypeById(request.itemId)) ?? request.gemCost)
        : request.gemCost,
      createdAtMs: Date.now(),
    };
    transaction.set(auditRef, auditRow);

    return {
      ...gifterData,
      totalGems: currentGems - request.gemCost,
    };
  });

  return { gifter: gifterUser, recipientUsername: recipientKey };
}

// ============================================
// LEVEL STUDIO (MIE-19) — Cloud Function-backed CRUD
// ============================================

/** Credentials bundle for secure level Cloud Functions (custom auth). */
function levelAuth(user: User): { username: string; password: string } {
  return { username: user.username, password: user.password };
}

/** Create a new level via Cloud Function — author-only write. */
export async function createLevelDocument(user: User): Promise<LevelDocument> {
  const fn = httpsCallable<{ username: string; password: string }, LevelDocument>(functions, 'createLevel');
  const result = await fn(levelAuth(user));
  return normalizeLevelDocument(result.data.id, result.data as unknown as Record<string, unknown>) ?? result.data;
}

/** Persist level edits via Cloud Function — author-only write. */
export async function updateLevelDocument(user: User, level: LevelDocument): Promise<LevelDocument> {
  const fn = httpsCallable<
    { username: string; password: string; levelId: string; level: Omit<LevelDocument, 'id'> },
    LevelDocument
  >(functions, 'updateLevel');
  const { id, ...body } = level;
  const result = await fn({ ...levelAuth(user), levelId: id, level: body });
  return normalizeLevelDocument(result.data.id, result.data as unknown as Record<string, unknown>) ?? result.data;
}

/** Archive a level — author-only. */
export async function archiveLevelDocument(user: User, levelId: string): Promise<void> {
  const fn = httpsCallable<{ username: string; password: string; levelId: string }, { success: boolean }>(
    functions,
    'archiveLevel',
  );
  await fn({ ...levelAuth(user), levelId });
}

/** Load a public level from Firestore (rules allow public read). */
export async function getPublicLevelDocument(levelId: string): Promise<LevelDocument | null> {
  const snap = await getDoc(doc(db, LEVELS_COLLECTION, levelId));
  if (!snap.exists()) return null;
  return normalizeLevelDocument(snap.id, snap.data() as Record<string, unknown>);
}

/** Load any level for play — uses CF for private levels. */
export async function getLevelDocument(levelId: string, user?: User | null): Promise<LevelDocument | null> {
  if (user) {
    try {
      const fn = httpsCallable<
        { levelId: string; username: string; password: string },
        LevelDocument
      >(functions, 'getLevelForPlay');
      const result = await fn({ levelId, ...levelAuth(user) });
      return normalizeLevelDocument(result.data.id, result.data as unknown as Record<string, unknown>);
    } catch {
      return null;
    }
  }
  return getPublicLevelDocument(levelId);
}

/** Author's levels including private drafts — via Cloud Function. */
export async function getMyLevels(user: User): Promise<LevelDocument[]> {
  const fn = httpsCallable<{ username: string; password: string }, LevelDocument[]>(functions, 'getMyLevelsSecure');
  const result = await fn(levelAuth(user));
  return result.data
    .map((row) => normalizeLevelDocument(row.id, row as unknown as Record<string, unknown>))
    .filter((l): l is LevelDocument => l !== null);
}

/** Top public levels for browse — client read of public docs only. */
export async function getPopularPublicLevels(limitCount = 5): Promise<LevelDocument[]> {
  const q = query(
    collection(db, LEVELS_COLLECTION),
    where('visibility', '==', 'public'),
    orderBy('playCount', 'desc'),
    limit(limitCount + 10),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => normalizeLevelDocument(d.id, d.data() as Record<string, unknown>))
    .filter((l): l is LevelDocument => l !== null)
    .slice(0, limitCount);
}

/** Recent public levels for browse. */
export async function getRecentPublicLevels(limitCount = 20): Promise<LevelDocument[]> {
  const q = query(
    collection(db, LEVELS_COLLECTION),
    where('visibility', '==', 'public'),
    orderBy('updatedAtMs', 'desc'),
    limit(limitCount + 10),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => normalizeLevelDocument(d.id, d.data() as Record<string, unknown>))
    .filter((l): l is LevelDocument => l !== null)
    .slice(0, limitCount);
}

/** Search public levels by name prefix (client-side filter on recent/popular fetch). */
export async function searchPublicLevels(searchTerm: string, limitCount = 20): Promise<LevelDocument[]> {
  const term = searchTerm.trim().toLowerCase();
  const recent = await getRecentPublicLevels(50);
  if (!term) return recent.slice(0, limitCount);
  return recent
    .filter(
      (l) =>
        l.name.toLowerCase().includes(term) ||
        l.authorUsername.toLowerCase().includes(term) ||
        l.description.toLowerCase().includes(term),
    )
    .slice(0, limitCount);
}

/** Secure play-count increment — skips author self-plays. */
export async function incrementLevelPlayCount(levelId: string, user: User): Promise<void> {
  const fn = httpsCallable<
    { levelId: string; username: string; password: string },
    { success: boolean }
  >(functions, 'incrementLevelPlayCountSecure');
  await fn({ levelId, ...levelAuth(user) });
}

// ============================================
// FRIENDS & SOCIAL (MIE-20)
// ============================================

/** Stable friendship doc id from two usernames. */
export function friendshipPairId(a: string, b: string): string {
  return [a, b].sort().join('__');
}

export function chatPairId(a: string, b: string): string {
  return friendshipPairId(a, b);
}

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

export function isUserOnline(lastSeenAtMs?: number): boolean {
  if (!lastSeenAtMs) return false;
  return Date.now() - lastSeenAtMs < ONLINE_THRESHOLD_MS;
}

/** Heartbeat — call while app is open (MIE-20 presence). */
export async function touchUserPresence(username: string): Promise<void> {
  await updateDoc(userRef(username), { lastSeenAtMs: Date.now() });
}

export async function sendFriendRequest(fromUsername: string, toUsername: string): Promise<void> {
  // Use exact account usernames (doc ids) — do not uppercase; MIE-23 names are case-preserving.
  const from = fromUsername.trim();
  const to = toUsername.trim();
  if (!from || !to) throw new Error('Invalid username');
  if (from.toLowerCase() === to.toLowerCase()) throw new Error('Cannot friend yourself');

  const pairId = friendshipPairId(from, to);
  const existingFriendship = await getDoc(doc(db, FRIENDSHIPS_COLLECTION, pairId));
  if (existingFriendship.exists()) {
    const data = existingFriendship.data() as Friendship;
    if (data.blockedBy) throw new Error('Cannot send request');
    throw new Error('Already friends');
  }

  // Single-field query avoids composite-index failures on send (MIE-25).
  const q = query(
    collection(db, FRIEND_REQUESTS_COLLECTION),
    where('fromUsername', '==', from),
  );
  const pending = await getDocs(q);
  const alreadySent = pending.docs.some((d) => {
    const data = d.data() as Omit<FriendRequest, 'id'>;
    return data.toUsername === to && data.status === 'pending';
  });
  if (alreadySent) throw new Error('Request already sent');

  await addDoc(collection(db, FRIEND_REQUESTS_COLLECTION), {
    fromUsername: from,
    toUsername: to,
    status: 'pending',
    createdAtMs: Date.now(),
  });
}

export async function getIncomingFriendRequests(toUsername: string): Promise<FriendRequest[]> {
  // Single-field query (auto-indexed) + client filter/sort so Incoming works even when
  // composite indexes are missing or still building (MIE-24/25).
  const q = query(
    collection(db, FRIEND_REQUESTS_COLLECTION),
    where('toUsername', '==', toUsername.trim()),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequest, 'id'>) }))
    .filter((r) => r.status === 'pending')
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/** Outgoing pending requests for the Friends UI (sender confirmation). */
export async function getOutgoingFriendRequests(fromUsername: string): Promise<FriendRequest[]> {
  const q = query(
    collection(db, FRIEND_REQUESTS_COLLECTION),
    where('fromUsername', '==', fromUsername.trim()),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequest, 'id'>) }))
    .filter((r) => r.status === 'pending')
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function acceptFriendRequest(requestId: string): Promise<void> {
  const reqRef = doc(db, FRIEND_REQUESTS_COLLECTION, requestId);
  const reqDoc = await getDoc(reqRef);
  if (!reqDoc.exists()) throw new Error('Request not found');
  const req = reqDoc.data() as Omit<FriendRequest, 'id'>;
  if (req.status !== 'pending') throw new Error('Request not pending');

  const pairId = friendshipPairId(req.fromUsername, req.toUsername);
  await runTransaction(db, async (tx) => {
    tx.update(reqRef, { status: 'accepted' });
    tx.set(doc(db, FRIENDSHIPS_COLLECTION, pairId), {
      usernames: [req.fromUsername, req.toUsername].sort(),
      createdAtMs: Date.now(),
      blockedBy: null,
    });
  });
}

export async function declineFriendRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, FRIEND_REQUESTS_COLLECTION, requestId), { status: 'declined' });
}

export async function getFriendsList(username: string): Promise<string[]> {
  const q = query(collection(db, FRIENDSHIPS_COLLECTION), where('usernames', 'array-contains', username));
  const snap = await getDocs(q);
  const friends: string[] = [];
  snap.docs.forEach((d) => {
    const data = d.data() as Friendship;
    if (data.blockedBy) return;
    const other = data.usernames.find((u) => u !== username);
    if (other) friends.push(other);
  });
  return friends.sort();
}

export async function unfriendUser(username: string, friendUsername: string): Promise<void> {
  await deleteDoc(doc(db, FRIENDSHIPS_COLLECTION, friendshipPairId(username, friendUsername)));
}

export async function blockUser(username: string, targetUsername: string): Promise<void> {
  const pairId = friendshipPairId(username, targetUsername);
  const ref = doc(db, FRIENDSHIPS_COLLECTION, pairId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { blockedBy: username });
  } else {
    await setDoc(ref, {
      usernames: [username, targetUsername].sort(),
      createdAtMs: Date.now(),
      blockedBy: username,
    });
  }
}

export async function sendChatMessage(
  fromUsername: string,
  toUsername: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const pairId = chatPairId(fromUsername, toUsername);
  await addDoc(collection(db, 'chats', pairId, 'messages'), {
    fromUsername,
    text: trimmed.slice(0, 500),
    createdAtMs: Date.now(),
  });

  const recipientDoc = await getDoc(userRef(toUsername));
  if (recipientDoc.exists()) {
    const data = recipientDoc.data() as User;
    const unread = { ...(data.unreadChats ?? {}) };
    unread[fromUsername] = (unread[fromUsername] ?? 0) + 1;
    await updateDoc(userRef(toUsername), { unreadChats: unread });
  }
}

export function subscribeToChatMessages(
  usernameA: string,
  usernameB: string,
  onMessages: (messages: ChatMessage[]) => void,
): Unsubscribe {
  const pairId = chatPairId(usernameA, usernameB);
  const q = query(collection(db, 'chats', pairId, 'messages'), orderBy('createdAtMs', 'asc'), limit(200));
  return onSnapshot(q, (snap) => {
    onMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) })));
  });
}

export async function clearChatUnread(username: string, friendUsername: string): Promise<void> {
  const userDoc = await getDoc(userRef(username));
  if (!userDoc.exists()) return;
  const data = userDoc.data() as User;
  const unread = { ...(data.unreadChats ?? {}) };
  delete unread[friendUsername];
  await updateDoc(userRef(username), { unreadChats: unread });
}

export async function createRaceChallenge(
  challenger: string,
  opponent: string,
  targetMeters: number,
): Promise<RaceChallenge> {
  const ref = doc(collection(db, RACE_CHALLENGES_COLLECTION));
  const challenge: RaceChallenge = {
    id: ref.id,
    challenger,
    opponent,
    targetMeters,
    status: 'pending',
    ready: { [challenger]: false, [opponent]: false },
    liveProgress: { [challenger]: 0, [opponent]: 0 },
    winner: null,
    createdAtMs: Date.now(),
  };
  await setDoc(ref, challenge);
  return challenge;
}

export async function respondToRaceChallenge(challengeId: string, accept: boolean): Promise<void> {
  await updateDoc(doc(db, RACE_CHALLENGES_COLLECTION, challengeId), {
    status: accept ? 'waiting_ready' : 'declined',
  });
}

export async function setRaceReady(challengeId: string, username: string, ready: boolean): Promise<void> {
  const ref = doc(db, RACE_CHALLENGES_COLLECTION, challengeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const race = snap.data() as RaceChallenge;
  const nextReady = { ...(race.ready ?? {}), [username]: ready };
  const updates: Record<string, unknown> = { ready: nextReady };
  if (
    race.status === 'waiting_ready' &&
    nextReady[race.challenger] &&
    nextReady[race.opponent]
  ) {
    updates.status = 'in_progress';
  }
  await updateDoc(ref, updates);
}

export function subscribeToRaceChallenge(
  challengeId: string,
  onChange: (race: RaceChallenge | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, RACE_CHALLENGES_COLLECTION, challengeId), (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    onChange({ id: snap.id, ...(snap.data() as Omit<RaceChallenge, 'id'>) });
  });
}

export async function updateRaceProgress(
  challengeId: string,
  username: string,
  meters: number,
): Promise<void> {
  const ref = doc(db, RACE_CHALLENGES_COLLECTION, challengeId);
  await updateDoc(ref, { [`liveProgress.${username}`]: meters });
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const race = snap.data() as RaceChallenge;
  if (race.status !== 'in_progress') return;
  if (meters >= race.targetMeters) {
    await updateDoc(ref, { status: 'finished', winner: username });
  }
}

export async function forfeitRace(challengeId: string, username: string): Promise<void> {
  const ref = doc(db, RACE_CHALLENGES_COLLECTION, challengeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const race = snap.data() as RaceChallenge;
  const winner = race.challenger === username ? race.opponent : race.challenger;
  await updateDoc(ref, { status: 'finished', winner });
}

