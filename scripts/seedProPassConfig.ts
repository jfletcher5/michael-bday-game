import { applicationDefault, cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { PRO_PASS_CONFIG } from '../app/lib/proPass';

const PRO_PASS_CONFIGS_COLLECTION = 'proPassConfigs';

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

  initializeApp({
    credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
    projectId,
  });
}

async function seedProPassConfig() {
  initializeAdminApp();

  const db = getFirestore();
  const docRef = db.collection(PRO_PASS_CONFIGS_COLLECTION).doc(PRO_PASS_CONFIG.id);
  await docRef.set(JSON.parse(JSON.stringify(PRO_PASS_CONFIG)), { merge: true });

  console.log(`Seeded Pro Pass config ${PRO_PASS_CONFIG.id} into ${PRO_PASS_CONFIGS_COLLECTION}.`);
}

seedProPassConfig().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
