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

// Anti-cheat configuration
const MAX_METERS_PER_SECOND = 30; // Maximum plausible score rate
const MIN_GAME_DURATION_MS = 1000; // Minimum game duration (1 second)
const SESSION_EXPIRY_MS = 60 * 60 * 1000; // Sessions expire after 1 hour
const SECRET_KEY = process.env.FUNCTIONS_SECRET_KEY || 'platform-drop-secret-key-2024';

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
 * Validate initials format (3 uppercase letters)
 */
function validateInitials(initials: string): boolean {
  return /^[A-Z]{3}$/.test(initials);
}

/**
 * Validate avatar ID (1-9)
 */
function validateAvatarId(avatarId: number): boolean {
  return Number.isInteger(avatarId) && avatarId >= 1 && avatarId <= 9;
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
  
  if (!validateInitials(initials)) {
    throw new functions.https.HttpsError('invalid-argument', 'Initials must be exactly 3 uppercase letters');
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
    
    // All validations passed - save the score
    await db.collection(LEADERBOARD_COLLECTION).add({
      avatarId,
      initials: initials.toUpperCase(),
      distance: Math.floor(distance), // Ensure integer
      date: new Date().toISOString(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      sessionId, // Reference to the game session
    });
    
    // Mark the session as used
    await db.collection(SESSIONS_COLLECTION).doc(sessionId).update({
      used: true,
      scoreSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
      finalScore: distance,
    });
    
    console.log(`Score submitted: ${initials} - ${distance}m (session: ${sessionId})`);
    
    return {
      success: true,
      message: 'Score submitted successfully',
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
