// Firebase configuration and initialization
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';

// Firebase configuration object
// TODO: Replace with your actual Firebase project configuration
// You can find these values in your Firebase Console > Project Settings > General
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "michaels-web-game",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

declare global {
  var __PLATFORM_DROP_FIRESTORE_EMULATOR_CONNECTED__: boolean | undefined;
}

// Initialize Firebase app (singleton pattern to prevent multiple initializations)
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Initialize Firestore
export const db: Firestore = getFirestore(app);

// Local manual tests can opt into the Firestore emulator without changing
// production behavior; HMR may reload this module, so guard the one-time connect.
const firestoreEmulatorHost = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST;
if (firestoreEmulatorHost && !globalThis.__PLATFORM_DROP_FIRESTORE_EMULATOR_CONNECTED__) {
  const [host, port] = firestoreEmulatorHost.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  globalThis.__PLATFORM_DROP_FIRESTORE_EMULATOR_CONNECTED__ = true;
}

// Initialize Firebase Functions
export const functions: Functions = getFunctions(app);

