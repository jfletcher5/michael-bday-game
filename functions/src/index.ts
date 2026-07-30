/**
 * Cloud Functions for Platform Drop game
 * Implements anti-cheat score submission with session validation
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as zlib from 'zlib';

// Initialize Firebase Admin SDK
admin.initializeApp();

// Firestore instance
const db = admin.firestore();

// Collection names
const SESSIONS_COLLECTION = 'gameSessions';
const LEADERBOARD_COLLECTION = 'leaderboard';
const USERS_COLLECTION = 'users';

// Anti-cheat configuration
const MAX_METERS_PER_SECOND = 30; // Maximum plausible score rate
const MIN_GAME_DURATION_MS = 300; // Minimum game duration (0.3 seconds)
const SESSION_EXPIRY_MS = 60 * 60 * 1000; // Sessions expire after 1 hour
const SECRET_KEY = process.env.FUNCTIONS_SECRET_KEY || 'platform-drop-secret-key-2024';
const DISPLAY_NAME_MAX_LENGTH = 10;
const RENAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

const BLOCKED_NAME_SUBSTRINGS = [
  'fuck', 'shit', 'bitch', 'asshole', 'damn', 'cunt', 'dick', 'pussy',
  'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut',
];

function formatDisplayName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, DISPLAY_NAME_MAX_LENGTH);
}

function usernameLowerKey(name: string): string {
  return formatDisplayName(name).toLowerCase();
}

function isProfaneDisplayName(name: string): boolean {
  const lower = name.toLowerCase().replace(/\s+/g, '');
  return BLOCKED_NAME_SUBSTRINGS.some((word) => lower.includes(word));
}

function validateDisplayNameFormat(name: string): boolean {
  const formatted = formatDisplayName(name);
  if (formatted.length < 1 || formatted.length > DISPLAY_NAME_MAX_LENGTH) return false;
  if (formatted.includes('/')) return false;
  if (formatted === '.' || formatted === '..') return false;
  return true;
}

function isLegacyInitialsUsername(username: string): boolean {
  return /^[A-Z]{3}$/.test(username);
}

/** Accept display names (MIE-23) or legacy 3-letter ids for score submit. */
function validatePlayerName(name: string): boolean {
  if (isLegacyInitialsUsername(name)) return true;
  if (!validateDisplayNameFormat(name)) return false;
  if (isProfaneDisplayName(name)) return false;
  return true;
}

async function resolveUserDocId(input: string): Promise<string | null> {
  const formatted = formatDisplayName(input);
  if (!formatted) return null;

  const direct = await db.collection(USERS_COLLECTION).doc(formatted).get();
  if (direct.exists) return formatted;

  const compact = formatted.replace(/\s/g, '');
  if (/^[A-Za-z]{3}$/.test(compact)) {
    const legacyId = compact.toUpperCase();
    const legacyDoc = await db.collection(USERS_COLLECTION).doc(legacyId).get();
    if (legacyDoc.exists) return legacyId;
  }

  const lower = usernameLowerKey(formatted);
  const snap = await db.collection(USERS_COLLECTION).where('usernameLower', '==', lower).limit(1).get();
  if (!snap.empty) return snap.docs[0].id;
  return null;
}

/**
 * Generate a secure token for session validation
 */
function generateToken(sessionId: string, timestamp: number): string {
  const data = `${sessionId}:${timestamp}:${SECRET_KEY}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate a token against session data
 */
function validateToken(sessionId: string, timestamp: number, token: string): boolean {
  const expectedToken = generateToken(sessionId, timestamp);
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
}

/**
 * Validate avatar ID (1-10)
 */
function validateAvatarId(avatarId: number): boolean {
  return Number.isInteger(avatarId) && avatarId >= 1 && avatarId <= 10;
}

// ============================================
// CLOUD FUNCTION: startGameSession
// ============================================
/**
 * Creates a new game session when the player starts the game
 * Returns a session ID and token that must be provided when submitting scores
 * 
 * Called from client when game starts
 * Returns: { sessionId: string, token: string }
 */
export const startGameSession = functions.https.onCall(async (data, context) => {
  try {
    const timestamp = Date.now();
    
    // Create a new session document
    const sessionRef = await db.collection(SESSIONS_COLLECTION).add({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      clientTimestamp: timestamp,
      used: false,
      // Store client IP for additional validation (optional)
      clientIp: context.rawRequest?.ip || 'unknown',
    });
    
    const sessionId = sessionRef.id;
    
    // Generate a token that proves this session was started legitimately
    const token = generateToken(sessionId, timestamp);
    
    console.log(`Game session started: ${sessionId}`);
    
    return {
      sessionId,
      token,
      timestamp,
    };
  } catch (error) {
    console.error('Error starting game session:', error);
    throw new functions.https.HttpsError('internal', 'Failed to start game session');
  }
});

// ============================================
// CLOUD FUNCTION: submitScore
// ============================================
/**
 * Validates and submits a score to the leaderboard
 * Performs anti-cheat validation:
 * 1. Session exists and hasn't been used
 * 2. Token is valid
 * 3. Score is plausible based on time elapsed
 * 4. Player data is valid (avatarId, initials)
 * 
 * Called from client when game ends
 * Expects: { sessionId, token, timestamp, avatarId, initials, distance }
 * Returns: { success: boolean, message?: string }
 */
export const submitScore = functions.https.onCall(async (data, context) => {
  // Extract and validate required fields
  const { sessionId, token, timestamp, avatarId, initials, distance } = data;
  
  // Validate required fields exist
  if (!sessionId || !token || !timestamp || avatarId === undefined || !initials || distance === undefined) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: sessionId, token, timestamp, avatarId, initials, distance'
    );
  }
  
  // Validate data types
  if (typeof distance !== 'number' || distance < 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid distance value');
  }
  
  if (!validateAvatarId(avatarId)) {
    throw new functions.https.HttpsError('invalid-argument', 'Avatar ID must be between 1 and 9');
  }
  
  if (!validatePlayerName(String(initials))) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid player name');
  }
  
  try {
    // Get the session document
    const sessionDoc = await db.collection(SESSIONS_COLLECTION).doc(sessionId).get();
    
    // Check if session exists
    if (!sessionDoc.exists) {
      console.warn(`Invalid session attempted: ${sessionId}`);
      throw new functions.https.HttpsError('not-found', 'Game session not found');
    }
    
    const sessionData = sessionDoc.data();
    
    // Check if session has already been used
    if (sessionData?.used) {
      console.warn(`Session reuse attempted: ${sessionId}`);
      throw new functions.https.HttpsError('already-exists', 'Score already submitted for this game session');
    }
    
    // Validate the token
    const clientTimestamp = sessionData?.clientTimestamp;
    if (!validateToken(sessionId, clientTimestamp, token)) {
      console.warn(`Invalid token for session: ${sessionId}`);
      throw new functions.https.HttpsError('permission-denied', 'Invalid session token');
    }
    
    // Check session age (sessions expire after 1 hour)
    const sessionAge = Date.now() - clientTimestamp;
    if (sessionAge > SESSION_EXPIRY_MS) {
      console.warn(`Expired session: ${sessionId}, age: ${sessionAge}ms`);
      throw new functions.https.HttpsError('deadline-exceeded', 'Game session has expired');
    }
    
    // Validate score plausibility based on time elapsed
    const gameDuration = Date.now() - clientTimestamp;
    
    // Check minimum game duration
    if (gameDuration < MIN_GAME_DURATION_MS) {
      console.warn(`Suspiciously short game: ${sessionId}, duration: ${gameDuration}ms, score: ${distance}`);
      throw new functions.https.HttpsError('invalid-argument', 'Game duration too short');
    }
    
    // Check maximum possible score based on time
    const gameDurationSeconds = gameDuration / 1000;
    const maxPossibleScore = Math.ceil(gameDurationSeconds * MAX_METERS_PER_SECOND);
    
    if (distance > maxPossibleScore) {
      console.warn(`Impossible score detected: ${sessionId}, claimed: ${distance}m, max possible: ${maxPossibleScore}m in ${gameDurationSeconds}s`);
      throw new functions.https.HttpsError('invalid-argument', 'Score exceeds maximum possible for game duration');
    }
    
    // Resolve canonical user doc id for VIP + leaderboard row (MIE-23 / MIE-22).
    const playerName = String(initials);
    const userDocId = (await resolveUserDocId(playerName)) ?? playerName;
    const distanceInt = Math.floor(distance);
    let isVip = false;
    try {
      const userDoc = await db.collection(USERS_COLLECTION).doc(userDocId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        isVip = userData?.gamepasses?.vip === true;
      }
    } catch (vipLookupError) {
      console.warn(`VIP lookup failed for ${userDocId}:`, vipLookupError);
    }

    // One doc per player (leaderboard/{USERNAME}) — only update on a new personal best (MIE-22).
    const leaderboardRef = db.collection(LEADERBOARD_COLLECTION).doc(userDocId);
    const existingEntry = await leaderboardRef.get();
    const existingDistance = existingEntry.exists
      ? (existingEntry.data()?.distance as number | undefined) ?? 0
      : 0;
    const isNewPersonalBest = !existingEntry.exists || distanceInt > existingDistance;

    if (isNewPersonalBest) {
      await leaderboardRef.set({
        avatarId,
        initials: userDocId,
        distance: distanceInt,
        date: new Date().toISOString(),
        isVip,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        sessionId,
      });
      console.log(`Leaderboard updated (new best): ${userDocId} - ${distanceInt}m`);
    } else {
      console.log(
        `Run recorded but not a personal best: ${userDocId} - ${distanceInt}m (best: ${existingDistance}m)`
      );
    }

    // Always mark the session as used, even when the run is not a new personal best
    await db.collection(SESSIONS_COLLECTION).doc(sessionId).update({
      used: true,
      scoreSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
      finalScore: distance,
      leaderboardUpdated: isNewPersonalBest,
    });

    return {
      success: true,
      message: isNewPersonalBest
        ? 'Score submitted successfully'
        : 'Run saved — your previous best score remains on the leaderboard',
      isNewPersonalBest,
    };
  } catch (error) {
    // Re-throw HttpsErrors as-is
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    console.error('Error submitting score:', error);
    throw new functions.https.HttpsError('internal', 'Failed to submit score');
  }
  });

// ============================================
// CLOUD FUNCTION: renameUser (MIE-23)
// ============================================
export const renameUser = functions.https.onCall(async (data) => {
  const { oldUsername, password, newName } = data ?? {};
  if (!oldUsername || !password || !newName) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing oldUsername, password, or newName');
  }

  const formatted = formatDisplayName(String(newName));
  if (!validateDisplayNameFormat(formatted)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid name length or characters');
  }
  if (isProfaneDisplayName(formatted)) {
    throw new functions.https.HttpsError('invalid-argument', 'Name not usable');
  }

  const oldDocId = await resolveUserDocId(String(oldUsername));
  if (!oldDocId) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }
  if (oldDocId === formatted) {
    throw new functions.https.HttpsError('invalid-argument', 'New name matches current name');
  }

  const lower = usernameLowerKey(formatted);
  const takenSnap = await db.collection(USERS_COLLECTION).where('usernameLower', '==', lower).limit(1).get();
  if (!takenSnap.empty && takenSnap.docs[0].id !== oldDocId) {
    throw new functions.https.HttpsError('already-exists', 'Name already taken');
  }
  const newDocSnap = await db.collection(USERS_COLLECTION).doc(formatted).get();
  if (newDocSnap.exists && newDocSnap.id !== oldDocId) {
    throw new functions.https.HttpsError('already-exists', 'Name already taken');
  }

  const oldRef = db.collection(USERS_COLLECTION).doc(oldDocId);
  const oldSnap = await oldRef.get();
  if (!oldSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }
  const userData = oldSnap.data() as Record<string, unknown>;
  if (userData.password !== password) {
    throw new functions.https.HttpsError('permission-denied', 'Incorrect password');
  }

  const isLegacyMigration =
    isLegacyInitialsUsername(oldDocId) && userData.isLegacyInitials !== false && userData.legacyRenameUsed !== true;
  const lastRenameAtMs = typeof userData.lastRenameAtMs === 'number' ? userData.lastRenameAtMs : 0;
  if (!isLegacyMigration && lastRenameAtMs && Date.now() - lastRenameAtMs < RENAME_COOLDOWN_MS) {
    throw new functions.https.HttpsError('failed-precondition', 'Rename locked — try again later');
  }

  const now = Date.now();
  const newUser = {
    ...userData,
    username: formatted,
    displayName: formatted,
    usernameLower: lower,
    lastRenameAtMs: now,
    legacyRenameUsed: isLegacyMigration ? true : userData.legacyRenameUsed ?? false,
    isLegacyInitials: false,
  };

  const batch = db.batch();
  batch.set(db.collection(USERS_COLLECTION).doc(formatted), newUser);
  batch.delete(oldRef);

  const oldLb = db.collection(LEADERBOARD_COLLECTION).doc(oldDocId);
  const lbSnap = await oldLb.get();
  if (lbSnap.exists) {
    batch.set(db.collection(LEADERBOARD_COLLECTION).doc(formatted), {
      ...lbSnap.data(),
      initials: formatted,
    });
    batch.delete(oldLb);
  }

  await batch.commit();

  return {
    success: true,
    username: formatted,
    displayName: formatted,
    message: 'Name updated',
  };
});

// ============================================
// LEVEL STUDIO (MIE-19) — secure level CRUD
// ============================================

const LEVELS_COLLECTION = 'levels';
const LEVEL_WORLD_W = 900;
const LEVEL_WORLD_H = 520;
const MAX_LEVEL_PLATFORMS = 100;
const MAX_LEVEL_BOMBS = 50;
const MAX_LEVEL_SPIKES = 50; // MIE-30 Studio spike traps

type LevelScrollDir = 'up' | 'down' | 'left' | 'right';

async function verifyUserCredentials(username: string, password: string): Promise<string> {
  const docId = await resolveUserDocId(String(username));
  if (!docId) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }
  const snap = await db.collection(USERS_COLLECTION).doc(docId).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }
  const data = snap.data() as Record<string, unknown>;
  if (data.password !== password) {
    throw new functions.https.HttpsError('permission-denied', 'Incorrect password');
  }
  return docId;
}

function sanitizeLevelPayload(raw: Record<string, unknown>, authorUsername: string, existing?: Record<string, unknown>) {
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : 'Untitled Level';
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 200) : '';
  const visibility = raw.visibility === 'public' ? 'public' : 'private';
  const screenScroll = (['up', 'down', 'left', 'right'] as LevelScrollDir[]).includes(raw.screenScroll as LevelScrollDir)
    ? (raw.screenScroll as LevelScrollDir)
    : 'down';
  const skyColor = typeof raw.skyColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.skyColor)
    ? raw.skyColor
    : '#1a1a2e';

  let ballSpawner: { x: number; y: number } | null = null;
  if (raw.ballSpawner && typeof raw.ballSpawner === 'object') {
    const s = raw.ballSpawner as { x?: unknown; y?: unknown };
    if (typeof s.x === 'number' && typeof s.y === 'number') {
      ballSpawner = {
        x: Math.max(0, Math.min(LEVEL_WORLD_W, s.x)),
        y: Math.max(0, Math.min(LEVEL_WORLD_H, s.y)),
      };
    }
  }

  const platforms = Array.isArray(raw.platforms)
    ? raw.platforms.slice(0, MAX_LEVEL_PLATFORMS).map((p, idx) => {
        const row = p as Record<string, unknown>;
        return {
          id: typeof row.id === 'string' ? row.id.slice(0, 64) : `platform-${idx}`,
          x: typeof row.x === 'number' ? row.x : 0,
          y: typeof row.y === 'number' ? row.y : 0,
          width: typeof row.width === 'number' ? Math.max(20, Math.min(400, row.width)) : 120,
          height: typeof row.height === 'number' ? Math.max(8, Math.min(80, row.height)) : 16,
          rotation: typeof row.rotation === 'number' ? row.rotation : 0,
          scale: typeof row.scale === 'number' ? Math.max(0.5, Math.min(3, row.scale)) : 1,
          isFinish: row.isFinish === true,
        };
      })
    : [];

  const bombs = Array.isArray(raw.bombs)
    ? raw.bombs.slice(0, MAX_LEVEL_BOMBS).map((b, idx) => {
        const row = b as Record<string, unknown>;
        return {
          id: typeof row.id === 'string' ? row.id.slice(0, 64) : `bomb-${idx}`,
          x: typeof row.x === 'number' ? row.x : 0,
          y: typeof row.y === 'number' ? row.y : 0,
          rotation: typeof row.rotation === 'number' ? row.rotation : 0,
          scale: typeof row.scale === 'number' ? Math.max(0.5, Math.min(3, row.scale)) : 1,
        };
      })
    : [];

  // Persist Studio spike traps (MIE-30) — older clients may omit spikes.
  const spikes = Array.isArray(raw.spikes)
    ? raw.spikes.slice(0, MAX_LEVEL_SPIKES).map((s, idx) => {
        const row = s as Record<string, unknown>;
        return {
          id: typeof row.id === 'string' ? row.id.slice(0, 64) : `spike-${idx}`,
          x: typeof row.x === 'number' ? row.x : 0,
          y: typeof row.y === 'number' ? row.y : 0,
          width: typeof row.width === 'number' ? Math.max(40, Math.min(200, row.width)) : 80,
          rotation: typeof row.rotation === 'number' ? row.rotation : 0,
          scale: typeof row.scale === 'number' ? Math.max(0.5, Math.min(3, row.scale)) : 1,
        };
      })
    : [];

  if (visibility === 'public') {
    if (!ballSpawner) {
      throw new functions.https.HttpsError('failed-precondition', 'Public levels require a Ball Spawner.');
    }
    if (platforms.length < 1) {
      throw new functions.https.HttpsError('failed-precondition', 'Public levels require at least one platform.');
    }
    if (!platforms.some((p) => p.isFinish)) {
      throw new functions.https.HttpsError('failed-precondition', 'Public levels require a finish platform.');
    }
  }

  const now = Date.now();
  return {
    name,
    description,
    authorUsername,
    visibility,
    archived: false,
    createdAtMs: typeof existing?.createdAtMs === 'number' ? existing.createdAtMs : now,
    updatedAtMs: now,
    playCount: typeof existing?.playCount === 'number' ? existing.playCount : 0,
    screenScroll,
    skyColor,
    ballSpawner,
    platforms,
    bombs,
    spikes,
  };
}

/** Create a blank level owned by the authenticated author. */
export const createLevel = functions.https.onCall(async (data) => {
  const { username, password } = data ?? {};
  if (!username || !password) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing username or password');
  }
  const authorUsername = await verifyUserCredentials(username, password);
  const now = Date.now();
  const ref = db.collection(LEVELS_COLLECTION).doc();
  const level = {
    name: 'Untitled Level',
    description: '',
    authorUsername,
    visibility: 'private',
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    playCount: 0,
    screenScroll: 'down',
    skyColor: '#1a1a2e',
    ballSpawner: { x: 200, y: 400 },
    platforms: [],
    bombs: [],
    spikes: [], // MIE-30
  };
  await ref.set(level);
  return { id: ref.id, ...level };
});

/** Update an existing level — author-only. */
export const updateLevel = functions.https.onCall(async (data) => {
  const { username, password, levelId, level } = data ?? {};
  if (!username || !password || !levelId || !level) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing username, password, levelId, or level');
  }
  const authorUsername = await verifyUserCredentials(username, password);
  const ref = db.collection(LEVELS_COLLECTION).doc(String(levelId));
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Level not found');
  }
  const existing = snap.data() as Record<string, unknown>;
  if (existing.authorUsername !== authorUsername) {
    throw new functions.https.HttpsError('permission-denied', 'Only the author can edit this level');
  }
  if (existing.archived === true) {
    throw new functions.https.HttpsError('failed-precondition', 'Archived levels cannot be edited');
  }
  const sanitized = sanitizeLevelPayload(level as Record<string, unknown>, authorUsername, existing);
  await ref.set(sanitized);
  return { id: ref.id, ...sanitized };
});

/** Archive (soft-delete) a level — author-only. */
export const archiveLevel = functions.https.onCall(async (data) => {
  const { username, password, levelId } = data ?? {};
  if (!username || !password || !levelId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing username, password, or levelId');
  }
  const authorUsername = await verifyUserCredentials(username, password);
  const ref = db.collection(LEVELS_COLLECTION).doc(String(levelId));
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Level not found');
  }
  const existing = snap.data() as Record<string, unknown>;
  if (existing.authorUsername !== authorUsername) {
    throw new functions.https.HttpsError('permission-denied', 'Only the author can archive this level');
  }
  await ref.update({ archived: true, updatedAtMs: Date.now() });
  return { success: true };
});

/** List author's non-archived levels including private drafts. */
export const getMyLevelsSecure = functions.https.onCall(async (data) => {
  const { username, password } = data ?? {};
  if (!username || !password) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing username or password');
  }
  const authorUsername = await verifyUserCredentials(username, password);
  const snap = await db.collection(LEVELS_COLLECTION)
    .where('authorUsername', '==', authorUsername)
    .orderBy('updatedAtMs', 'desc')
    .limit(50)
    .get();
  return snap.docs
    .filter((d) => (d.data() as Record<string, unknown>).archived !== true)
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
});

/** Load a level for play — public to anyone; private only for author. */
export const getLevelForPlay = functions.https.onCall(async (data) => {
  const { levelId, username, password } = data ?? {};
  if (!levelId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing levelId');
  }
  const ref = db.collection(LEVELS_COLLECTION).doc(String(levelId));
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Level not found');
  }
  const level = snap.data() as Record<string, unknown>;
  if (level.archived === true) {
    throw new functions.https.HttpsError('not-found', 'Level not found');
  }
  if (level.visibility === 'private') {
    if (!username || !password) {
      throw new functions.https.HttpsError('permission-denied', 'Private level — author login required');
    }
    const authorUsername = await verifyUserCredentials(username, password);
    if (level.authorUsername !== authorUsername) {
      throw new functions.https.HttpsError('permission-denied', 'Private level');
    }
  }
  return { id: snap.id, ...level };
});

/** Increment play count for public levels — skips author self-plays. */
export const incrementLevelPlayCountSecure = functions.https.onCall(async (data) => {
  const { levelId, username, password } = data ?? {};
  if (!levelId || !username || !password) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing levelId, username, or password');
  }
  const playerUsername = await verifyUserCredentials(username, password);
  const ref = db.collection(LEVELS_COLLECTION).doc(String(levelId));
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Level not found');
  }
  const level = snap.data() as Record<string, unknown>;
  if (level.archived === true || level.visibility !== 'public') {
    return { success: false };
  }
  if (level.authorUsername === playerUsername) {
    return { success: false, skipped: true };
  }
  await ref.update({
    playCount: admin.firestore.FieldValue.increment(1),
  });
  return { success: true };
});

// ============================================
// CLOUD FUNCTION: cleanupExpiredSessions (scheduled)
// ============================================
/**
 * Scheduled function to clean up expired/unused sessions
 * Runs every day at midnight to prevent database bloat
 */
export const cleanupExpiredSessions = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('America/Los_Angeles')
  .onRun(async (context) => {
    const expiryTime = Date.now() - SESSION_EXPIRY_MS;
    
    try {
      // Get all sessions older than expiry time that weren't used
      const expiredSessions = await db.collection(SESSIONS_COLLECTION)
        .where('clientTimestamp', '<', expiryTime)
        .get();
      
      // Delete in batches
      const batch = db.batch();
      let deleteCount = 0;
      
      expiredSessions.docs.forEach(doc => {
        batch.delete(doc.ref);
        deleteCount++;
      });
      
      if (deleteCount > 0) {
        await batch.commit();
        console.log(`Cleaned up ${deleteCount} expired game sessions`);
      }
      
      return null;
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
      return null;
    }
  });

// ============================================
// 3D AVATAR — GEMINI UGC TEXTURE GENERATION (MIE-18)
// ============================================

const AVATAR_ITEMS_COLLECTION = 'avatarItems';
const AVATAR_DRAFTS_COLLECTION = 'avatarDrafts';

// Includes head wear texture slot for Avatar Studio (MIE-41)
const UGC_TEXTURE_PART_TYPES = new Set([
  'shirt', 'hair', 'pants', 'arm', 'leg', 'hand', 'foot', 'sock', 'accessory', 'head',
]);

function isProfaneText(text: string): boolean {
  const lower = text.toLowerCase().replace(/\s+/g, '');
  return BLOCKED_NAME_SUBSTRINGS.some((word) => lower.includes(word));
}

/** PNG CRC32 for chunk checksums (MIE-40 — raster fallback instead of SVG). */
function pngCrc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const typeAndData = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

/** Solid-color PNG — Three.js-safe wear map when Gemini is unavailable (MIE-40). */
function buildFallbackTexturePng(prompt: string): Buffer {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = (hash * 31 + prompt.charCodeAt(i)) >>> 0;
  }
  // Simple HSL→RGB from prompt hash so fallbacks still look distinct
  const h = (hash % 360) / 360;
  const s = 0.7;
  const l = 0.5;
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  const width = 256;
  const height = 256;
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const i = rowStart + 1 + x * 4;
      // Mild vertical gradient so the fallback isn't a flat brick
      const shade = 0.85 + (y / height) * 0.3;
      raw[i] = Math.min(255, Math.round(r * shade));
      raw[i + 1] = Math.min(255, Math.round(g * shade));
      raw[i + 2] = Math.min(255, Math.round(b * shade));
      raw[i + 3] = 255;
    }
  }

  const compressed = zlib.deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Reject SVG wear URLs — they crash Avatar3DViewer on many clients (MIE-40). */
function assertRasterTextureUrl(url: string): void {
  const lower = url.toLowerCase();
  if (lower.includes('.svg') || lower.startsWith('data:image/svg')) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Texture must be a PNG/JPEG raster image (SVG wear maps are not supported)',
    );
  }
}

/** Upload texture bytes to public Storage and return the HTTPS URL. */
async function uploadAvatarTexture(
  buffer: Buffer,
  contentType: string,
  filename: string,
): Promise<string> {
  const bucket = admin.storage().bucket();
  const path = `public/avatar-ugc/${filename}`;
  const file = bucket.file(path);
  await file.save(buffer, {
    contentType,
    metadata: { cacheControl: 'public, max-age=31536000' },
  });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

/** Try Gemini image generation; falls back to procedural SVG texture. */
async function generateTextureImage(partType: string, prompt: string): Promise<{ buffer: Buffer; contentType: string }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const fullPrompt =
    `Generate a flat 2D game texture tile for a 3D avatar ${partType}. ` +
    `Style: colorful, kid-friendly platformer game. No text. Description: ${prompt}`;

  if (apiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
        },
      );

      if (response.ok) {
        const json = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
        };
        const parts = json.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          const inline = part.inlineData;
          if (inline?.data) {
            return {
              buffer: Buffer.from(inline.data, 'base64'),
              contentType: inline.mimeType || 'image/png',
            };
          }
        }
      }
    } catch (err) {
      console.warn('Gemini texture generation failed, using fallback:', err);
    }
  }

  // Prefer PNG over SVG so equipping never bricks the Three.js viewer (MIE-40)
  return { buffer: buildFallbackTexturePng(prompt), contentType: 'image/png' };
}

/** Generate a preview texture via Gemini (server-side) for player UGC (MIE-18). */
export const generateAvatarTexture = functions.https.onCall(async (data) => {
  const { username, password, partType, prompt } = data ?? {};
  if (!username || !password || !partType || !prompt) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing username, password, partType, or prompt');
  }
  if (!UGC_TEXTURE_PART_TYPES.has(String(partType))) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid part type for UGC textures');
  }
  if (String(prompt).trim().length < 3 || String(prompt).length > 300) {
    throw new functions.https.HttpsError('invalid-argument', 'Prompt must be 3–300 characters');
  }
  if (isProfaneText(String(prompt))) {
    throw new functions.https.HttpsError('invalid-argument', 'Prompt contains blocked words');
  }

  const playerUsername = await verifyUserCredentials(username, password);
  const { buffer, contentType } = await generateTextureImage(String(partType), String(prompt).trim());
  const draftId = `draft-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  // Always store as PNG/JPEG raster — never SVG (MIE-40)
  const safeType = contentType.includes('jpeg') || contentType.includes('jpg') ? 'image/jpeg' : 'image/png';
  const ext = safeType === 'image/jpeg' ? 'jpg' : 'png';
  const uploadBuffer =
    contentType.includes('svg') ? buildFallbackTexturePng(String(prompt).trim()) : buffer;
  const textureUrl = await uploadAvatarTexture(uploadBuffer, safeType, `${draftId}.${ext}`);

  const now = Date.now();
  await db.collection(AVATAR_DRAFTS_COLLECTION).doc(draftId).set({
    id: draftId,
    username: playerUsername,
    partType,
    prompt: String(prompt).trim(),
    textureUrl,
    previewImageUrl: textureUrl,
    createdAtMs: now,
  });

  return { draftId, textureUrl, previewImageUrl: textureUrl };
});

/** Publish a Gemini draft instantly to the Avatar shop (MIE-18 point #10). */
export const publishAvatarUgcItem = functions.https.onCall(async (data) => {
  const {
    username,
    password,
    draftId,
    name,
    description,
    partType,
    textureUrl,
    previewImageUrl,
    ugcPrompt,
  } = data ?? {};

  if (!username || !password || !draftId || !name || !partType || !textureUrl) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required publish fields');
  }
  if (isProfaneText(String(name)) || (ugcPrompt && isProfaneText(String(ugcPrompt)))) {
    throw new functions.https.HttpsError('invalid-argument', 'Name or prompt contains blocked words');
  }
  assertRasterTextureUrl(String(textureUrl));
  if (previewImageUrl) assertRasterTextureUrl(String(previewImageUrl));

  const playerUsername = await verifyUserCredentials(username, password);
  const draftSnap = await db.collection(AVATAR_DRAFTS_COLLECTION).doc(String(draftId)).get();
  if (!draftSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Draft not found — generate a preview first');
  }
  const draft = draftSnap.data() as Record<string, unknown>;
  if (draft.username !== playerUsername) {
    throw new functions.https.HttpsError('permission-denied', 'Draft belongs to another player');
  }

  const now = Date.now();
  const itemId = `ugc-${now}-${crypto.randomBytes(4).toString('hex')}`;
  const item = {
    id: itemId,
    name: String(name).trim().slice(0, 40),
    description: String(description || '').trim().slice(0, 200),
    creatorUsername: playerUsername,
    partType,
    gemPrice: 0,
    onSale: true,
    stock: null,
    previewImageUrl: previewImageUrl || textureUrl,
    textureUrl,
    source: 'ugc',
    ugcPrompt: String(ugcPrompt || draft.prompt || '').slice(0, 300),
    createdAtMs: now,
    updatedAtMs: now,
  };

  const userRef = db.collection(USERS_COLLECTION).doc(playerUsername);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }
  const userData = userSnap.data() as Record<string, unknown>;
  const owned = Array.isArray(userData.ownedAvatarItems) ? [...userData.ownedAvatarItems] : [];
  if (!owned.includes(itemId)) owned.push(itemId);

  const equipped = (userData.equippedAvatar as Record<string, string | null> | undefined) ?? {};
  equipped[String(partType)] = itemId;

  await db.collection(AVATAR_ITEMS_COLLECTION).doc(itemId).set(item);
  await userRef.update({
    ownedAvatarItems: owned,
    equippedAvatar: equipped,
  });
  await draftSnap.ref.delete();

  const updatedUser = {
    ...userData,
    username: playerUsername,
    ownedAvatarItems: owned,
    equippedAvatar: equipped,
  };

  return { itemId, user: updatedUser };
});

// ============================================
// AVATAR ITEM STUDIO (MIE-37)
// ============================================

const AVATAR_STUDIO_PROJECTS_COLLECTION = 'avatarStudioProjects';

/** Upload studio texture bytes to public Storage. */
async function uploadAvatarStudioTexture(buffer: Buffer, filename: string): Promise<string> {
  const bucket = admin.storage().bucket();
  const path = `public/avatar-studio/${filename}`;
  const file = bucket.file(path);
  await file.save(buffer, {
    contentType: 'image/png',
    metadata: { cacheControl: 'public, max-age=31536000' },
  });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

/** Create a blank avatar studio project for the logged-in player. */
export const createAvatarStudioProject = functions.https.onCall(async (data) => {
  const { username, password, targetPartType = 'shirt', name = 'Untitled project' } = data ?? {};
  if (!username || !password) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing username or password');
  }
  if (!UGC_TEXTURE_PART_TYPES.has(String(targetPartType))) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid target part type');
  }

  const playerUsername = await verifyUserCredentials(username, password);
  const now = Date.now();
  const projectId = `studio-${now}-${crypto.randomBytes(4).toString('hex')}`;
  const project = {
    id: projectId,
    ownerUsername: playerUsername,
    name: String(name).trim().slice(0, 60) || 'Untitled project',
    targetPartType,
    layers: [],
    createdAtMs: now,
    updatedAtMs: now,
  };

  await db.collection(AVATAR_STUDIO_PROJECTS_COLLECTION).doc(projectId).set(project);
  return project;
});

/** Save avatar studio project edits (owner-only). */
export const updateAvatarStudioProject = functions.https.onCall(async (data) => {
  const { username, password, project } = data ?? {};
  if (!username || !password || !project?.id) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing username, password, or project');
  }

  const playerUsername = await verifyUserCredentials(username, password);
  const ref = db.collection(AVATAR_STUDIO_PROJECTS_COLLECTION).doc(String(project.id));
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Project not found');
  }
  const existing = snap.data() as Record<string, unknown>;
  if (existing.ownerUsername !== playerUsername) {
    throw new functions.https.HttpsError('permission-denied', 'Not your project');
  }

  const now = Date.now();
  const updated = {
    id: String(project.id),
    ownerUsername: playerUsername,
    name: String(project.name || existing.name).trim().slice(0, 60),
    targetPartType: UGC_TEXTURE_PART_TYPES.has(String(project.targetPartType))
      ? project.targetPartType
      : existing.targetPartType,
    layers: Array.isArray(project.layers) ? project.layers : [],
    exportedTextureUrl: project.exportedTextureUrl || existing.exportedTextureUrl || null,
    previewImageUrl: project.previewImageUrl || existing.previewImageUrl || null,
    createdAtMs: existing.createdAtMs || now,
    updatedAtMs: now,
  };

  await ref.set(updated);
  return updated;
});

/** Load one studio project (owner-only). */
export const getAvatarStudioProject = functions.https.onCall(async (data) => {
  const { username, password, projectId } = data ?? {};
  if (!username || !password || !projectId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing username, password, or projectId');
  }

  const playerUsername = await verifyUserCredentials(username, password);
  const snap = await db.collection(AVATAR_STUDIO_PROJECTS_COLLECTION).doc(String(projectId)).get();
  if (!snap.exists) return null;

  const project = snap.data() as Record<string, unknown>;
  if (project.ownerUsername !== playerUsername) {
    throw new functions.https.HttpsError('permission-denied', 'Not your project');
  }
  return { id: snap.id, ...project };
});

/** List all studio projects owned by the player. */
export const getMyAvatarStudioProjects = functions.https.onCall(async (data) => {
  const { username, password } = data ?? {};
  if (!username || !password) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing username or password');
  }

  const playerUsername = await verifyUserCredentials(username, password);
  const snap = await db
    .collection(AVATAR_STUDIO_PROJECTS_COLLECTION)
    .where('ownerUsername', '==', playerUsername)
    .orderBy('updatedAtMs', 'desc')
    .limit(50)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});

/** Publish a studio project to the avatar shop with flattened texture (MIE-37). */
export const publishAvatarStudioItem = functions.https.onCall(async (data) => {
  const { username, password, projectId, name, description, textureBase64 } = data ?? {};
  if (!username || !password || !projectId || !name || !textureBase64) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required publish fields');
  }
  if (isProfaneText(String(name))) {
    throw new functions.https.HttpsError('invalid-argument', 'Name contains blocked words');
  }

  const playerUsername = await verifyUserCredentials(username, password);
  const projectRef = db.collection(AVATAR_STUDIO_PROJECTS_COLLECTION).doc(String(projectId));
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Project not found');
  }
  const project = projectSnap.data() as Record<string, unknown>;
  if (project.ownerUsername !== playerUsername) {
    throw new functions.https.HttpsError('permission-denied', 'Not your project');
  }

  const partType = String(project.targetPartType);
  if (!UGC_TEXTURE_PART_TYPES.has(partType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid part type on project');
  }

  const buffer = Buffer.from(String(textureBase64), 'base64');
  if (buffer.length < 32) {
    throw new functions.https.HttpsError('invalid-argument', 'Texture data is empty or too small');
  }
  // PNG magic bytes — reject non-raster uploads that would brick equip (MIE-40)
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
    throw new functions.https.HttpsError('invalid-argument', 'Studio publish requires a PNG texture');
  }
  const textureUrl = await uploadAvatarStudioTexture(buffer, `${projectId}.png`);

  const now = Date.now();
  const itemId = `studio-${now}-${crypto.randomBytes(4).toString('hex')}`;
  const item = {
    id: itemId,
    name: String(name).trim().slice(0, 40),
    description: String(description || '').trim().slice(0, 200),
    creatorUsername: playerUsername,
    partType,
    gemPrice: 5,
    onSale: true,
    stock: null,
    previewImageUrl: textureUrl,
    textureUrl,
    source: 'studio',
    createdAtMs: now,
    updatedAtMs: now,
  };

  const userRef = db.collection(USERS_COLLECTION).doc(playerUsername);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }
  const userData = userSnap.data() as Record<string, unknown>;
  const owned = Array.isArray(userData.ownedAvatarItems) ? [...userData.ownedAvatarItems] : [];
  if (!owned.includes(itemId)) owned.push(itemId);

  const equipped = (userData.equippedAvatar as Record<string, string | null> | undefined) ?? {};
  equipped[partType] = itemId;

  await db.collection(AVATAR_ITEMS_COLLECTION).doc(itemId).set(item);
  await userRef.update({
    ownedAvatarItems: owned,
    equippedAvatar: equipped,
  });
  await projectRef.update({
    exportedTextureUrl: textureUrl,
    previewImageUrl: textureUrl,
    updatedAtMs: now,
  });

  const updatedUser = {
    ...userData,
    username: playerUsername,
    ownedAvatarItems: owned,
    equippedAvatar: equipped,
  };

  return { itemId, user: updatedUser };
});
