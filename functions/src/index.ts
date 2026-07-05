/**
 * Cloud Functions for Platform Drop game
 * Implements anti-cheat score submission with session validation
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

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
