/**
 * One-shot reset for the May 2026 season pass.
 *
 * Clears every user's claimed-reward arrays so they can re-earn rewards under
 * the new 25-tier structure. Keeps each user's accumulated season meters and
 * `premiumUnlocked` flag intact (anyone who already paid still has the upgrade).
 *
 * Usage:
 *   npx tsx scripts/resetMaySeasonAchievements.ts
 *   FIREBASE_SERVICE_ACCOUNT='{...}' npx tsx scripts/resetMaySeasonAchievements.ts
 */
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TARGET_SEASON_ID = 'may-2026';
const USERS_COLLECTION = 'users';
const BATCH_LIMIT = 400; // Firestore caps batches at 500 ops; leave headroom.

function parseServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must be valid service account JSON.');
  }
}

function initializeAdminApp() {
  if (getApps().length > 0) return;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'michaels-web-game';
  const serviceAccount = parseServiceAccount();
  initializeApp({
    credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
    projectId,
  });
}

async function resetSeasonAchievements() {
  initializeAdminApp();
  const db = getFirestore();

  const snap = await db
    .collection(USERS_COLLECTION)
    .where('seasonData.seasonId', '==', TARGET_SEASON_ID)
    .get();

  if (snap.empty) {
    console.log(`No users have season "${TARGET_SEASON_ID}" data — nothing to reset.`);
    return;
  }

  console.log(`Found ${snap.size} user(s) with ${TARGET_SEASON_ID} season data.`);

  let processed = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const slice = snap.docs.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    slice.forEach((d) => {
      batch.update(d.ref, {
        'seasonData.claimedFree': [],
        'seasonData.claimedPremium': [],
      });
    });
    await batch.commit();
    processed += slice.length;
    console.log(`  Reset ${processed}/${snap.size}`);
  }

  console.log(`Done. Cleared claimed-reward arrays for ${processed} user(s).`);
}

resetSeasonAchievements().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
