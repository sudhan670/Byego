# Byego — Multi-Tenant Feature Flag Management

A small SaaS-style feature flag system with three front-end apps and a Node.js/Express backend.

## Architecture

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Super Admin UI │  │    Admin UI     │  │    User UI      │
│  /super-admin   │  │    /admin       │  │    /user        │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    Express API (port 3000)
                    Custom JWT auth (bcrypt)
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
        SQLite (default)              Firebase Firestore
```

## Roles

| Role | Auth | Capabilities |
|------|------|--------------|
| **Super Admin** | Static credentials (env/config) | Create & list organizations |
| **Org Admin** | Sign up + login (bcrypt) | CRUD feature flags for their org |
| **End User** | Sign up + login (bcrypt) | Check if a feature is enabled |

## Quick Start (SQLite — zero config)

```bash
npm install
npm start
```

Open:
- Super Admin: http://localhost:3000/super-admin
- Admin: http://localhost:3000/admin
- User: http://localhost:3000/user

**Default super admin credentials:**
- Email: `superadmin@byego.local`
- Password: `SuperAdmin123!`

## Demo Flow

1. **Super Admin** — log in and create an organization (e.g. name: `Acme Corp`, slug: `acme-corp`)
2. **Admin** — sign up with the org slug, create flags like `dark_mode`, toggle enabled/disabled
3. **User** — sign up with the same org slug, enter a feature key to check its status

## Environment Variables

Copy `.env.example` to `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | `dev-secret-change-me` | JWT signing secret |
| `SUPER_ADMIN_EMAIL` | `superadmin@byego.local` | Super admin login email |
| `SUPER_ADMIN_PASSWORD` | `SuperAdmin123!` | Super admin login password |
| `DB_PROVIDER` | `sqlite` | `sqlite` or `firebase` |
| `FIREBASE_PROJECT_ID` | — | Firebase project ID |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | — | Path to service account JSON |
| `FIRESTORE_EMULATOR_HOST` | — | e.g. `localhost:8080` for local emulator |

## Firebase Firestore Setup

Authentication is **custom** (JWT + bcrypt) — Firebase Auth is not used.

1. Create a Firebase project and enable Firestore
2. Download a service account key JSON
3. Configure `.env`:

```env
DB_PROVIDER=firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
```

**Local emulator:**

```bash
firebase emulators:start --only firestore
```

```env
DB_PROVIDER=firebase
FIREBASE_PROJECT_ID=demo-byego
FIRESTORE_EMULATOR_HOST=localhost:8080
```

## API Endpoints

### Super Admin (`/api/super-admin`)
- `POST /login` — authenticate
- `GET /organizations` — list orgs (auth required)
- `POST /organizations` — create org (auth required)

### Admin (`/api/admin`)
- `POST /signup` — register org admin
- `POST /login` — authenticate
- `GET /feature-flags` — list flags
- `POST /feature-flags` — create flag
- `PUT /feature-flags/:id` — update flag
- `DELETE /feature-flags/:id` — delete flag

### User (`/api/user`)
- `POST /signup` — register end user
- `POST /login` — authenticate
- `POST /check-feature` — check if feature is enabled
- `GET /me` — current user info

## Data Model

**SQLite tables / Firestore collections:**
- `organizations` — name, slug
- `users` — email, password hash, organization, role (`org_admin` | `end_user`)
- `roles` — role definitions (SQLite table; Firestore seed docs)
- `feature_flags` — organization-scoped keys with enabled/disabled state

Feature flags are isolated per organization — admins only see/modify their org's flags, and users only check flags for their org.

## Scripts

```bash
npm start      # Start server
npm run dev    # Start with file watch
npm run init-db # Initialize database schema
```

## Design Decisions

- **Custom JWT auth** — no third-party auth providers per assignment requirements
- **SQLite default** — runs immediately with no external services; Firebase optional for cloud persistence
- **Organization slug** — human-readable identifier used during signup to join an org
- **Feature key validation** — lowercase alphanumeric + underscores, must start with a letter
- **Plain HTML/JS frontends** — minimal UI focused on demonstrating API flows
