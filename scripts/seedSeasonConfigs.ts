import { applicationDefault, cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { SEASON_CONFIGS } from '../app/lib/seasons';

const SEASON_CONFIGS_COLLECTION = 'seasonConfigs';

function parseServiceAccount(): ServiceAccount | null {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawServiceAccount) return null;

  try {
    return JSON.parse(rawServiceAccount) as ServiceAccount;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must be valid service account JSON.');
  }
}

function initializeAdminApp() {
  if (getApps().length > 0) return;

  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'michaels-web-game';
  const serviceAccount = parseServiceAccount();

  // Prefer explicit service account JSON when provided; otherwise use local
  // Application Default Credentials such as GOOGLE_APPLICATION_CREDENTIALS.
  initializeApp({
    credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
    projectId,
  });
}

async function seedSeasonConfigs() {
  initializeAdminApp();

  const db = getFirestore();
  const batch = db.batch();

  for (const config of SEASON_CONFIGS) {
    const docRef = db.collection(SEASON_CONFIGS_COLLECTION).doc(config.id);
    // JSON serialization removes undefined optional fields before Firestore
    // validation, while preserving the plain config shape used by the app.
    batch.set(docRef, JSON.parse(JSON.stringify(config)), { merge: true });
  }

  await batch.commit();
  console.log(`Seeded ${SEASON_CONFIGS.length} season config(s) into ${SEASON_CONFIGS_COLLECTION}.`);
}

seedSeasonConfigs().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
