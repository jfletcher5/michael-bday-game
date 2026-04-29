# Firebase Setup Instructions

## Step 1: Get Your Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **michaels-web-game**
3. Click on the **gear icon** (⚙️) next to "Project Overview" → **Project settings**
4. Scroll down to **"Your apps"** section
5. If you haven't added a web app yet:
  - Click **"Add app"** → Select **Web** (</> icon)
  - Register your app with a nickname (e.g., "Michael's Birthday Game")
6. Copy the **firebaseConfig** object that looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "michaels-web-game",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## Step 2: Update Firebase Configuration File

1. Open `app/lib/firebase.ts`
2. Replace the placeholder values with your actual Firebase configuration:

```typescript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "YOUR_ACTUAL_AUTH_DOMAIN",
  projectId: "michaels-web-game",
  storageBucket: "YOUR_ACTUAL_STORAGE_BUCKET",
  messagingSenderId: "YOUR_ACTUAL_SENDER_ID",
  appId: "YOUR_ACTUAL_APP_ID"
};
```

## Step 3: Deploy Firestore Rules

The Firestore security rules have been updated to allow anyone to read and write to the leaderboard (no authentication required).

Deploy the updated rules by running:

```bash
firebase deploy --only firestore:rules
```

## Step 4: Create Firestore Database (if not already created)

1. In Firebase Console, go to **Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in production mode"** (the rules we deploy will control access)
4. Select your preferred location (e.g., us-central)
5. Click **"Enable"**

## Step 5: Test the Leaderboard

1. Run your development server:
  ```bash
   npm run dev
  ```
2. Play the game in infinite mode
3. Save your score
4. Check the leaderboard to see if scores are appearing

## Seed Season Pass Rewards

Season pass reward definitions live in the `seasonConfigs` collection. The app
reads those documents first and falls back to the checked-in configs if a season
document is missing or Firestore cannot be reached.

Deploy the updated Firestore rules before seeding:

```bash
npx -y firebase-tools@latest deploy --only firestore:rules
```

Then seed the current checked-in season configs:

```bash
FIREBASE_PROJECT_ID=michaels-web-game npm run seed:seasons
```

The seed script uses Firebase Admin credentials. Set
`GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON file, or provide the
JSON directly in `FIREBASE_SERVICE_ACCOUNT`.

## What Changed

✅ **Installed Firebase SDK** - Added `firebase` package to the project

✅ **Created Firebase configuration** - `app/lib/firebase.ts` initializes the Firebase app

✅ **Created Firestore service** - `app/lib/firestore.ts` handles reading/writing scores

✅ **Updated Leaderboard** - Now fetches scores from Firestore instead of localStorage

✅ **Updated Game** - Saves scores to Firestore instead of localStorage

✅ **Updated Security Rules** - Allows public read/write access to leaderboard (no auth required)

## Firestore Data Structure

Scores are stored in the `leaderboard` collection with the following structure:

```typescript
{
  username: string,      // Player's username
  distance: number,      // Distance survived
  date: string,          // ISO date string
  timestamp: Timestamp   // Server timestamp for ordering
}
```

Season pass rewards are stored in `seasonConfigs/{seasonId}`:

```typescript
{
  id: string,             // e.g. "april-2026"
  displayName: string,    // e.g. "April 2026"
  month: number,          // 1-indexed month number
  year: number,
  premiumCost: number,    // coins to unlock premium rewards
  emoji: string,
  seasonBall: {
    id: string,
    name: string,
    price: number,
    color: string,
    strokeColor: string,
    isDefault: boolean,
    imageUrl?: string,
    description?: string
  },
  levels: [
    {
      meterThreshold: number,
      freeReward: { type: 'coins' | 'extraBall' | 'ball', amount?: number, ballId?: string },
      premiumReward: { type: 'coins' | 'extraBall' | 'ball', amount?: number, ballId?: string }
    }
  ]
}
```

## Troubleshooting

**Error: "Firebase: No Firebase App '[DEFAULT]' has been created"**

- Make sure you've updated the Firebase config in `app/lib/firebase.ts`

**Error: "Missing or insufficient permissions"**

- Deploy the Firestore rules: `firebase deploy --only firestore:rules`

**Scores not appearing:**

- Check browser console for errors
- Verify Firestore database is created in Firebase Console
- Check that rules are deployed correctly

