# Firebase Deploy Guide

This project deploys a Next.js static export to **Firebase Hosting** (`michaels-web-game`), along with Firestore rules, Storage rules, and Cloud Functions.

CI deploys automatically on every push to `main` via `.github/workflows/firebase-deploy.yml`.

## Architecture

| Component | Source | Deploy target |
|-----------|--------|---------------|
| Web app | `npm run build` → `out/` | Firebase Hosting (`michaels-web-game`) |
| Firestore rules | `firestore.rules` | Firestore |
| Storage rules | `storage.rules` | Cloud Storage |
| Cloud Functions | `functions/` | Cloud Functions |

Hosting is pinned in `firebase.json` (`hosting.site`) and `.firebaserc` (default project + hosting target) so `firebase-tools` 15.x can resolve the site without interactive setup.

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

#### Option A — Service account JSON (recommended)

Service account keys do **not** expire like CI tokens, so this is the preferred method for GitHub Actions.

1. Open [Firebase Console → Project Settings → Service accounts](https://console.firebase.google.com/project/michaels-web-game/settings/serviceaccounts/adminsdk)
2. Click **Generate new private key** and download the JSON file
3. In Google Cloud IAM, ensure the service account has deploy roles, for example:
   - **Firebase Admin**, or
   - **Firebase Hosting Admin** + **Cloud Functions Admin** + **Firebase Rules Admin** + **Service Account User** (for functions)
4. In GitHub → **Settings → Secrets and variables → Actions**, create secret **`FIREBASE_SERVICE_ACCOUNT`**
5. Paste the **entire JSON file contents** (single line or pretty-printed — both work)

The workflow validates the JSON before deploy and uses Application Default Credentials (no token refresh needed).

#### Option B — CI token (fallback)

CI tokens expire periodically. Use only if you cannot use a service account.

```bash
npx firebase-tools@15.19.1 login:ci
```

Copy the printed token into GitHub secret **`FIREBASE_TOKEN`**.

To regenerate after expiry or auth errors:

```bash
npx firebase-tools@15.19.1 login:ci
```

Update the `FIREBASE_TOKEN` secret with the new value. The workflow prefers `FIREBASE_SERVICE_ACCOUNT` when both secrets are set.

### Recommended durable setup

| Secret | Required | Notes |
|--------|----------|-------|
| All `NEXT_PUBLIC_FIREBASE_*` | Yes | Build-time config |
| `FIREBASE_SERVICE_ACCOUNT` | **Preferred** | Long-lived deploy auth |
| `FIREBASE_TOKEN` | Optional fallback | Regenerate with `login:ci` when it expires |

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

Deploy behavior:

- **Build** jobs cancel superseded runs on the same branch (`cancel-in-progress: true`)
- **Deploy** jobs do **not** cancel an in-progress deploy when a newer push lands (`cancel-in-progress: false`)
- Deploy runs **hosting**, **firestore:rules + storage**, and **functions** as separate steps (clearer partial-failure logs)
- Each deploy step retries up to 3 times with exponential backoff (30s, 60s)
- `firebase-tools` is pinned to `15.19.1` in the workflow
- Verifies `out/` and `functions/lib/` exist before deploy

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
- [ ] `.firebaserc` and `firebase.json` committed (project `michaels-web-game`, hosting site `michaels-web-game`)
- [ ] GitHub repository secrets configured (`FIREBASE_SERVICE_ACCOUNT` preferred)
- [ ] `FUNCTIONS_SECRET_KEY` set for Cloud Functions (optional but recommended for production)

## Troubleshooting

**Build fails: missing Firebase config**

Ensure all `NEXT_PUBLIC_FIREBASE_*` secrets are set in GitHub Actions secrets or `.env.local`.

**Deploy fails: authentication / token expired**

- **Preferred fix:** Add or update `FIREBASE_SERVICE_ACCOUNT` with a fresh service-account JSON key (does not expire).
- **Fallback:** Regenerate `FIREBASE_TOKEN` with `npx firebase-tools@15.19.1 login:ci` and update the GitHub secret.
- Workflow error logs indicate which method was attempted and what to configure.

**Deploy fails: `Assertion failed: resolving hosting target of a site with no site name or target name`**

This means Firebase CLI could not resolve the Hosting site. Ensure the repo contains:

1. **`.firebaserc`** with `"default": "michaels-web-game"` under `projects`
2. **`firebase.json`** with `"hosting": { "site": "michaels-web-game", ... }`

The default Hosting site ID matches the Firebase project ID (`michaels-web-game`). Confirm the site exists in [Firebase Hosting](https://console.firebase.google.com/project/michaels-web-game/hosting/sites).

**Deploy fails: `out/` missing or empty**

The build job failed or the artifact did not upload. Check the **Build** job logs for `npm run build` errors.

**Deploy fails: Cloud Functions / `node_modules`**

The workflow runs `npm ci --prefix functions --omit=dev` before deploy. If functions still fail, verify `functions/package-lock.json` is committed and matches `functions/package.json`.

**App loads but Firestore errors**

Deploy rules: `npm run deploy:rules`

**Scores rejected by anti-cheat**

Ensure Cloud Functions are deployed and `FUNCTIONS_SECRET_KEY` matches between client expectations and function runtime.
