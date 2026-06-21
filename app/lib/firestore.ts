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
import { Score, User, SeasonData, ProPassData, LoginCredentials, GameEvent, GameEventType, BroadcastMessage, ShopOffer, Poll, PlayerSettings } from './types';
import { getCurrentSeasonId, getSeasonConfig } from './seasons';
import type { SeasonConfig } from './seasons';
import {
  getProPassConfig,
  isProPassActive,
  isProPassEnded,
  type ProPassConfig,
} from './proPass';
import { AURORA_BALL_ID, AURORA_SHARD_GOAL } from './aurora';
import { getGamepassById, VIP_BALL_ID, type GamepassId } from './gamepasses';
import { getBallTypeById } from './ballTypes';
import {
  createStarterEquippedAvatar,
  normalizeUserAvatarFields,
  STARTER_OWNED_ITEM_IDS,
} from './avatarItems';
import type { AvatarItem, AvatarPartType, EquippedAvatar } from './types';

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

// Collection name for season pass reward definitions
const SEASON_CONFIGS_COLLECTION = 'seasonConfigs';
const PRO_PASS_CONFIGS_COLLECTION = 'proPassConfigs';
const AVATAR_ITEMS_COLLECTION = 'avatarItems';

/**
 * Create a new user account
 * @param credentials - Username (3 letters) and password
 * @param avatarId - Selected avatar ID
 * @returns Promise that resolves to the new User object
 * @throws Error if username already exists
 */
export async function createUser(
  credentials: LoginCredentials,
  avatarId: number
): Promise<User> {
  try {
    const username = credentials.username.toUpperCase();
    
    // Check if user already exists
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, username));
    if (userDoc.exists()) {
      throw new Error('Username already exists');
    }
    
    // Create new user with default values
    const newUser: User = {
      username,
      password: credentials.password,
      totalMeters: 0,
      totalCoins: 0,
      totalGems: 0,
      ownedBalls: ['default'], // Start with default ball owned
      selectedBall: 'default',
      avatarId,
      createdAt: new Date().toISOString(),
      extraBalls: 0,
      seasonData: null,
      ownedAvatarItems: [...STARTER_OWNED_ITEM_IDS],
      equippedAvatar: createStarterEquippedAvatar(),
    };
    
    // Save to Firestore using username as document ID
    await setDoc(doc(db, USERS_COLLECTION, username), newUser);
    
    console.log('User created successfully:', username);
    return newUser;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Login user with username and password
 * @param credentials - Username and password
 * @returns Promise that resolves to User object if credentials match
 * @throws Error if user not found or password incorrect
 */
export async function loginUser(credentials: LoginCredentials): Promise<User> {
  try {
    const username = credentials.username.toUpperCase();
    
    // Get user document
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, username));
    
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data() as User;
    
    // Check password
    if (userData.password !== credentials.password) {
      throw new Error('Incorrect password');
    }
    
    console.log('User logged in:', username);
    return normalizeUserAvatarFields(userData);
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
}

/**
 * Persist a user's selected avatar.
 * Updates both Firestore and the returned User snapshot.
 */
export async function updateUserAvatar(username: string, avatarId: number): Promise<User> {
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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
    snap.docs.forEach((d) => result.add(d.id.toUpperCase()));
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
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, username.toUpperCase()));
    
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
    const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());

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
    const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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

  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());

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
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());

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
    snap.docs.forEach((d) => result.add(d.id.toUpperCase()));
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
    const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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
  const ref = doc(db, POLLS_COLLECTION, pollId, 'answers', username.toUpperCase());
  const snap = await getDoc(ref);
  return snap.exists();
}

/**
 * Return the option index this user voted for, or null if they haven't voted.
 */
export async function getUserPollAnswer(pollId: string, username: string): Promise<number | null> {
  const ref = doc(db, POLLS_COLLECTION, pollId, 'answers', username.toUpperCase());
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
  const answerRef = doc(db, POLLS_COLLECTION, pollId, 'answers', username.toUpperCase());
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
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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
      | 'shirtTextureUrl'
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
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) throw new Error('User not found');

  const userData = normalizeUserAvatarFields(userDoc.data() as User);
  if (!userData.ownedAvatarItems!.includes(itemId)) throw new Error('Item not owned');

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
  const userRef = doc(db, USERS_COLLECTION, username.toUpperCase());
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

