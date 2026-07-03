/**
 * One-shot migration: collapse legacy per-run leaderboard docs into one
 * best-score row per username (leaderboard/{USERNAME}).
 *
 * Run after deploying the MIE-22 submitScore upsert change so the top-100
 * query reflects each player's personal best only.
 *
 * Usage:
 *   npx tsx scripts/migrateLeaderboardBestScores.ts
 *   FIREBASE_SERVICE_ACCOUNT='{...}' npx tsx scripts/migrateLeaderboardBestScores.ts
 */
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getFirestore, type DocumentReference, type DocumentData } from 'firebase-admin/firestore';

const LEADERBOARD_COLLECTION = 'leaderboard';
const BATCH_LIMIT = 400; // Firestore caps batches at 500 ops; leave headroom.

interface LeaderboardRow {
  avatarId: number;
  initials: string;
  distance: number;
  date: string;
  isVip?: boolean;
  sessionId?: string;
}

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

/** Normalize initials from legacy docs that may use username instead. */
function resolveInitials(data: DocumentData, docId: string): string {
  if (typeof data.initials === 'string' && data.initials.length > 0) {
    return data.initials.toUpperCase();
  }
  if (typeof data.username === 'string' && data.username.length > 0) {
    return data.username.slice(0, 3).toUpperCase();
  }
  // Doc id may already be the username after partial migration
  if (/^[A-Z]{3}$/.test(docId)) {
    return docId;
  }
  return 'UNK';
}

/** Pick the better row when two runs share the same username. */
function pickBest(
  current: { ref: DocumentReference; row: LeaderboardRow } | undefined,
  candidate: { ref: DocumentReference; row: LeaderboardRow }
): { ref: DocumentReference; row: LeaderboardRow } {
  if (!current) return candidate;
  if (candidate.row.distance > current.row.distance) return candidate;
  if (candidate.row.distance < current.row.distance) return current;
  // Tie-break: keep the earlier date (matches UI sort by distance only)
  return candidate.row.date < current.row.date ? candidate : current;
}

async function migrateLeaderboard() {
  initializeAdminApp();
  const db = getFirestore();

  const snap = await db.collection(LEADERBOARD_COLLECTION).get();
  if (snap.empty) {
    console.log('Leaderboard collection is empty — nothing to migrate.');
    return;
  }

  console.log(`Scanning ${snap.size} leaderboard doc(s)...`);

  const bestByInitials = new Map<
    string,
    { ref: DocumentReference; row: LeaderboardRow }
  >();
  const allRefs: DocumentReference[] = [];

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const initials = resolveInitials(data, docSnap.id);
    const row: LeaderboardRow = {
      avatarId: data.avatarId ?? 1,
      initials,
      distance: typeof data.distance === 'number' ? Math.floor(data.distance) : 0,
      date: data.date ?? new Date().toISOString(),
      isVip: data.isVip === true,
      sessionId: data.sessionId,
    };
    const entry = { ref: docSnap.ref, row };
    bestByInitials.set(initials, pickBest(bestByInitials.get(initials), entry));
    allRefs.push(docSnap.ref);
  });

  console.log(`Found ${bestByInitials.size} unique player(s).`);

  // Write canonical docs at leaderboard/{USERNAME}
  const canonicalRefs = new Set<string>();
  let upserted = 0;
  for (const [initials, { row }] of bestByInitials) {
    if (initials === 'UNK') {
      console.warn('Skipping row with unknown initials:', row);
      continue;
    }
    const canonicalRef = db.collection(LEADERBOARD_COLLECTION).doc(initials);
    await canonicalRef.set({
      avatarId: row.avatarId,
      initials: row.initials,
      distance: row.distance,
      date: row.date,
      isVip: row.isVip ?? false,
      ...(row.sessionId ? { sessionId: row.sessionId } : {}),
      timestamp: new Date(),
    });
    canonicalRefs.add(canonicalRef.path);
    upserted++;
  }
  console.log(`Upserted ${upserted} canonical best-score doc(s).`);

  // Delete every doc that is not the canonical leaderboard/{USERNAME} row
  const refsToDelete = allRefs.filter((ref) => !canonicalRefs.has(ref.path));
  console.log(`Deleting ${refsToDelete.length} duplicate/legacy doc(s)...`);

  for (let i = 0; i < refsToDelete.length; i += BATCH_LIMIT) {
    const slice = refsToDelete.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    slice.forEach((ref) => batch.delete(ref));
    await batch.commit();
    console.log(`  Deleted ${Math.min(i + slice.length, refsToDelete.length)}/${refsToDelete.length}`);
  }

  console.log('Migration complete.');
}

migrateLeaderboard().catch((err) => {
  console.error(err);
  process.exit(1);
});
