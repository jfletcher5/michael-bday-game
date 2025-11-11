# 🚀 Quick Start - Firebase Leaderboard

## ⚡ What You Need to Do

### 1. Get Your Firebase Web App Config

Visit: https://console.firebase.google.com/project/michaels-web-game/settings/general

Scroll to "Your apps" section → Click on your web app → Copy the config object.

### 2. Update `app/lib/firebase.ts`

Replace the placeholder values with your actual Firebase configuration from step 1.

Look for these lines:
```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",           // ← Replace this
  authDomain: "YOUR_AUTH_DOMAIN",   // ← Replace this
  projectId: "michaels-web-game",
  storageBucket: "YOUR_STORAGE_BUCKET",      // ← Replace this
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // ← Replace this
  appId: "YOUR_APP_ID"              // ← Replace this
};
```

### 3. Ensure Firestore Database is Created

1. Visit: https://console.firebase.google.com/project/michaels-web-game/firestore
2. If you see "Create database" button, click it and choose "Start in production mode"
3. Select your region (e.g., us-central1)

### 4. Test It Out! 🎮

```bash
npm run dev
```

Play the game, save a score, and check the leaderboard!

---

## ✅ What's Already Done

- ✅ Firebase SDK installed
- ✅ Firestore rules deployed (public read/write for leaderboard)
- ✅ Leaderboard page updated to use Firestore
- ✅ Game page updated to save scores to Firestore
- ✅ Error handling added

## 📁 Files Changed

- `app/lib/firebase.ts` - **⚠️ YOU NEED TO UPDATE THIS**
- `app/lib/firestore.ts` - Firestore service functions
- `app/leaderboard/page.tsx` - Reads from Firestore
- `app/game/page.tsx` - Saves to Firestore
- `firestore.rules` - Security rules (deployed)
- `package.json` - Added firebase dependency

---

See `FIREBASE_SETUP.md` for detailed instructions and troubleshooting.

