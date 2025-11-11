// Firestore service functions for leaderboard management
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit,
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';
import { Score } from './types';

// Collection name in Firestore
const LEADERBOARD_COLLECTION = 'leaderboard';

/**
 * Add a new score to the Firestore leaderboard
 * @param score - The Score object to add
 * @returns Promise that resolves when score is added
 */
export async function addScoreToFirestore(score: Score): Promise<void> {
  try {
    // Add score to Firestore with server timestamp
    await addDoc(collection(db, LEADERBOARD_COLLECTION), {
      username: score.username || 'Anonymous',
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
 * Get top scores from Firestore leaderboard
 * @param limitCount - Maximum number of scores to retrieve (default: 10)
 * @returns Promise that resolves to array of Score objects
 */
export async function getScoresFromFirestore(limitCount: number = 10): Promise<Score[]> {
  try {
    // Query Firestore for top scores ordered by distance (descending)
    const scoresQuery = query(
      collection(db, LEADERBOARD_COLLECTION),
      orderBy('distance', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(scoresQuery);
    
    // Map Firestore documents to Score objects
    const scores: Score[] = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        username: data.username || 'Anonymous',
        distance: data.distance || 0,
        date: data.date || new Date().toISOString()
      };
    });
    
    return scores;
  } catch (error) {
    console.error('Error fetching scores from Firestore:', error);
    throw error;
  }
}

