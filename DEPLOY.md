# Firebase Deploy Guide

This project deploys a Next.js static export to **Firebase Hosting** (`michaels-web-game`), along with Firestore rules, Storage rules, and Cloud Functions.

CI deploys automatically on every push to `main` via `.github/workflows/firebase-deploy.yml`.

## Architecture

| Component | Source | Deploy target |
|-----------|--------|---------------|
| Web app | `npm run build` → `out/` | Firebase Hosting |
| Firestore rules | `firestore.rules` | Firestore |
| Storage rules | `storage.rules` | Cloud Storage |
| Cloud Functions | `functions/` | Cloud Functions |

## Secrets (GitHub Actions)

Add repository secrets at **GitHub → Repository → Settings → Secrets and variables → Actions**:

### Firebase web app config (required for build)

Get values from [Firebase Console → Project Settings](https://console.firebase.google.com/project/michaels-web-game/settings/general) → Your apps → Web app.

| Secret | Description |
|--------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | e.g. `michaels-web-game.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `michaels-web-game` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | e.g. `michaels-web-game.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Numeric sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Web app ID |

### Deploy credentials (required — use **one**)

**Option A — CI token (simplest)**

```bash
npx firebase-tools login:ci
```

Add the output as `FIREBASE_TOKEN`.

**Option B — Service account JSON**

1. Firebase Console → Project Settings → Service accounts → Generate new private key
2. Grant roles: **Firebase Admin** (or at minimum Hosting Admin + Cloud Functions Admin + Rules Admin)
3. Paste the **entire JSON file** as `FIREBASE_SERVICE_ACCOUNT`

## Cursor Cloud Agent secrets

For cloud agent deploys, add the same variable names in **Cursor → Dashboard → Cloud Agents → Secrets** (workspace-scoped). Then run:

```bash
npm run deploy
```

## GitHub Actions

Workflow: `.github/workflows/firebase-deploy.yml`

| Trigger | Behavior |
|---------|----------|
| Push to `main` | Build + deploy |
| Pull request | Build only (no deploy) |
| Manual (`workflow_dispatch`) | Build + deploy |

## Local development

```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_FIREBASE_* values
npm run dev
```

## Local deploy

```bash
npx firebase-tools login
cp .env.example .env.local   # fill in values
npm run deploy
```

### Deploy individual targets

```bash
npm run deploy:hosting    # Hosting only
npm run deploy:rules      # Firestore + Storage rules
npm run deploy:functions  # Cloud Functions only
```

## Cloud Functions secret

Anti-cheat uses `FUNCTIONS_SECRET_KEY` in `functions/src/index.ts`. Set it in production:

```bash
firebase functions:secrets:set FUNCTIONS_SECRET_KEY --project michaels-web-game
```

## First-time Firebase setup checklist

- [ ] Firestore database created ([console](https://console.firebase.google.com/project/michaels-web-game/firestore))
- [ ] Web app registered in Firebase project settings
- [ ] GitHub repository secrets configured
- [ ] `FUNCTIONS_SECRET_KEY` set for Cloud Functions (optional but recommended for production)

## Troubleshooting

**Build fails: missing Firebase config**

Ensure all `NEXT_PUBLIC_FIREBASE_*` secrets are set in GitHub Actions secrets or `.env.local`.

**Deploy fails: authentication**

Add either `FIREBASE_TOKEN` or `FIREBASE_SERVICE_ACCOUNT` to GitHub repository secrets.

**App loads but Firestore errors**

Deploy rules: `npm run deploy:rules`

**Scores rejected by anti-cheat**

Ensure Cloud Functions are deployed and `FUNCTIONS_SECRET_KEY` matches between client expectations and function runtime.
