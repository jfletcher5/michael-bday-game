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
  type Unsubscribe
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { Score, User, SeasonData, LoginCredentials, GameEvent, GameEventType, BroadcastMessage, Poll } from './types';
import { getCurrentSeasonId, getSeasonConfig } from './seasons';
import type { SeasonConfig } from './seasons';

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
        date: data.date || new Date().toISOString()
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
      ownedBalls: ['default'], // Start with default ball owned
      selectedBall: 'default',
      avatarId,
      createdAt: new Date().toISOString(),
      extraBalls: 0,
      seasonData: null,
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
    return userData;
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
    
    return userDoc.data() as User;
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
 * @returns Promise that resolves to updated User object
 */
export async function updateUserStats(
  username: string,
  metersEarned: number,
  coinsEarned: number
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

    // Update stats
    await updateDoc(userRef, {
      totalMeters: currentData.totalMeters + metersEarned,
      totalCoins: currentData.totalCoins + coinsEarned,
      seasonData,
    });

    // Return updated user data
    const updatedUser: User = {
      ...currentData,
      totalMeters: currentData.totalMeters + metersEarned,
      totalCoins: currentData.totalCoins + coinsEarned,
      extraBalls: currentData.extraBalls ?? 0,
      seasonData,
    };

    console.log(`Stats updated for ${username}: +${metersEarned}m, +${coinsEarned} coins`);
    return updatedUser;
  } catch (error) {
    console.error('Error updating user stats:', error);
    return null;
  }
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

