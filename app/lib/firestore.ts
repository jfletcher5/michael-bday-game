// Firestore service functions for leaderboard and user management
import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc,
  setDoc,
  updateDoc,
  doc,
  query, 
  orderBy, 
  limit,
  startAfter,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
  arrayUnion
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { Score, User, LoginCredentials } from './types';

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
    
    console.log('Score submitted via Cloud Function:', result.data);
    return result.data;
  } catch (error) {
    console.error('Error submitting score via Cloud Function:', error);
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
    
    // Update stats
    await updateDoc(userRef, {
      totalMeters: currentData.totalMeters + metersEarned,
      totalCoins: currentData.totalCoins + coinsEarned,
    });
    
    // Return updated user data
    const updatedUser: User = {
      ...currentData,
      totalMeters: currentData.totalMeters + metersEarned,
      totalCoins: currentData.totalCoins + coinsEarned,
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

