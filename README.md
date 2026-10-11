# SDG 16 Awareness and Public Issue Reporting System

A responsive educational project about Sustainable Development Goal 16, with public awareness pages, anonymous issue reporting, and a private administrator dashboard. It uses HTML, CSS, vanilla JavaScript, Express, and SQLite.

This application is **not** an official government complaint portal or emergency service. Submitted reports are stored in this project's database and are not automatically sent to the police, courts, government departments, or another authority.

## Features

- Public home, Awareness, Rights Awareness, Reporting, and Resources pages. Public visitors do not register or sign in.
- Optional username/password user registration and sign-in, without collecting an email address or phone number.
- A private user dashboard lists only non-anonymous reports submitted while the user was signed in.
- Educational overview of peace, justice, equality, rights, transparency, accountability, access to justice, and participation.
- Rights information about Part III of the Constitution of India, with an educational-not-legal-advice notice.
- Report categories: Public Safety, Corruption Concern, Discrimination, Access to Justice, Human Rights Concern, and Other.
- Anonymous reporting enabled by default; the form does not request names, contact information, or location.
- Server-side validation, a generated report reference, SQLite persistence, rate limits, request size limits, and CSRF protection.
- Private user and administrator dashboards, with separate server-side authorization.
- User and administrator passwords hashed with bcrypt. Administrator accounts can only be created through the secure CLI.

## Requirements

- Node.js 18 or newer
- npm

## Install and configure (PowerShell)

Open PowerShell in the project folder:

```powershell
cd "C:\Users\johnr\OneDrive\Desktop\Helen"
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Generate a session secret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Open `.env` with a text editor and replace the `SESSION_SECRET` placeholder with the generated value. Keep `.env` private and do not commit it. The server refuses to start in production without a session secret of at least 32 characters.

The example local settings are:

```dotenv
PORT=3000
NODE_ENV=development
SESSION_SECRET=replace-with-a-long-random-secret
DB_PATH=./data/sdg16.db
```

## Create the first administrator

Run the CLI command without supplying credentials as command-line arguments:

```powershell
npm run create-admin
```

Enter the administrator username when prompted. Password characters are masked as you type. Passwords must be 12–128 characters. The script creates the first administrator only and refuses to overwrite an existing account.

The database and schema initialize automatically on startup. SQLite data is stored at `data/sdg16.db` by default; set `DB_PATH` to change its location. Keep database files private and backed up securely.

## Start the app

```powershell
npm start
```

Open <http://localhost:3000>. The admin login is at <http://localhost:3000/admin-login.html>; the dashboard is served only to an authenticated administrator at <http://localhost:3000/admin/dashboard> (also available at `/admin.html`).
User account creation is at <http://localhost:3000/user-register.html>, sign-in is at <http://localhost:3000/user-login.html>, and the account dashboard is at <http://localhost:3000/account.html>.

Users do not need an account to browse the public site or submit reports. Anonymous reports are never linked to an account. If a signed-in user turns off the anonymous option, the report is linked to that account and appears in its private dashboard. Reports submitted without signing in are never retroactively connected to an account.

For development with Node's built-in file watcher:

```powershell
npm run dev
```

## Test

```powershell
npm test
```

Tests create a unique SQLite database under the operating system's temporary directory and remove that test directory when finished. They do not delete or modify the normal application database.

The current automated tests cover public pages, user registration and authentication, bcrypt password storage, ownership-scoped user report history, unauthenticated user/admin access, CSRF rejection, request-size and report validation, anonymous submission defaults, persistence after reopening the SQLite file in an independent process, unpredictable unique references, duplicate rejection, admin authentication and logout, login/report rate limits, statistics, filtering, pagination, status updates, SQL-injection-safe storage, and XSS-safe dashboard rendering.

## REST API

### Public

- `GET /api/health` — health status
- `GET /api/csrf-token` — session-bound CSRF token used by form submissions
- `POST /api/reports` — validate and save a report; returns a reference only after successful insertion
- `POST /api/users/register` — create an optional regular user account
- `POST /api/users/login` — sign in and start a server-side user session
- `POST /api/users/logout` — invalidate the user session
- `GET /api/users/me` — get the current signed-in user's basic account details
- `GET /api/users/reports` — list only that user's non-anonymous linked reports; requires user authentication

Report body example:

```json
{
  "category": "Public Safety",
  "description": "Describe the concern in at least 20 characters.",
  "anonymous": true
}
```

### Administrator

All endpoints below require a valid server-side admin session except `POST /api/admin/login`.

- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/me`
- `GET /api/admin/stats`
- `GET /api/admin/reports?page=1&limit=10&status=New&category=Public%20Safety&search=&sort=newest`
- `GET /api/admin/reports/:id`
- `PATCH /api/admin/reports/:id/status` with `{ "status": "Under Review" }`

Allowed report states are `New`, `Under Review`, and `Resolved`. The `sort` query accepts `newest` or `oldest`; private administrator responses use no-store cache headers. There is no public report-reference lookup endpoint.

## Database overview

The private SQLite database contains:

- `reports`: internal ID, unique unpredictable reference, category, description, anonymous preference, status, duplicate-detection hash, optional user ownership for non-anonymous signed-in reports, timestamps, and the updating administrator ID.
- `users`: internal ID, case-insensitive unique username, bcrypt password hash, and account creation time.
- `administrators`: internal ID, unique username, bcrypt password hash, and account creation time.
- `sessions`: server-side session records with expiry timestamps.

The schema uses constraints, parameterized SQL, foreign keys, and indexes. The database is stored under `data/`, not the publicly served `public/` folder.

## Privacy, safety, and deployment

- No user account is required to use public content or submit a report.
- User accounts are optional and use a username plus password; no email address, phone number, or real name is collected. There is no password recovery mechanism because email is not collected—users who lose their password cannot recover the account through this app.
- The anonymous option means the stored report has no user-account link; it consequently cannot appear in a user dashboard. Turning anonymity off while signed in links the report to the account, visible to the authenticated account holder and administrators.
- The form does not ask for name, email, telephone number, home address, geolocation, or password.
- A short-lived first-party session cookie supports CSRF protection and administrator login; it is not used for analytics or identity profiling.
- No report description, password, or sensitive request body is logged by application code.
- The report's reference ID is not an access credential and cannot be used to retrieve a report publicly.
- Technical anonymity cannot be guaranteed absolutely. Hosting providers, network infrastructure, and server configuration may process connection metadata.
- Do not include identifying details in a report unless you choose to share them.
- If someone is in immediate danger, contact the appropriate local emergency service directly. This app is not monitored for emergencies.
- External resource links are maintained by their organisations and can change. A few government sites restrict automated verification; if a deep link fails, start from the official organisation homepage.
- Production requires HTTPS, a strong environment-provided session secret, restricted database/file access, regular backups, and secure host configuration. Session cookies are HttpOnly, SameSite=Lax, and Secure in production. The app uses SQLite-backed sessions.
- The administrator login rotates the session ID to reduce session-fixation risk. The session store uses the application SQLite database, so protect and back up that file accordingly.
- The configured rate limiter uses in-process storage. A multi-instance public deployment needs a shared rate-limit store and suitable reverse-proxy configuration.

## Troubleshooting

- **`SESSION_SECRET` error in production:** provide a random secret of at least 32 characters in the environment.
- **Port already in use:** change `PORT` in `.env` and restart.
- **Admin login fails:** create the initial admin with `npm run create-admin`; the script intentionally refuses to reset an existing account.
- **CSRF error:** reload the page and submit again so the browser obtains a fresh session token.
- **Database permission error:** ensure the process can read and write the directory specified by `DB_PATH`.
- **Official link does not load:** open the organisation's official homepage and navigate to the relevant information.

## Project structure

```text
public/
  awareness.html
  admin-login.html
  admin.html
  account.html
  index.html
  report.html
  resources.html
  rights-awareness.html
  user-login.html
  user-register.html
  css/styles.css
  js/app.js
  js/admin.js
  js/user-auth.js
  js/user-account.js
src/
  app.js
  server.js
  config/
    db.js
    env.js
    sessionStore.js
  middleware/
    auth.js
    csrfProtection.js
    errorHandler.js
  routes/api.js
  utils/validation.js
scripts/create-admin.js
tests/app.test.js
data/                 # private local SQLite database; ignored by Git
```
