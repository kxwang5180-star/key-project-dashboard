# Key Project Dashboard

Key Project Dashboard is an internal project governance system for managing strategic initiatives, milestones, weekly progress, operating metrics, project members, risks, and Feishu group notifications.

The application was built for a practical PMO-style workflow: project members submit weekly updates, administrators maintain project metadata and metric definitions, and Feishu cards keep project groups informed about milestone deadlines and weekly progress.

## What It Does

- Centralizes key projects, owners, business lines, milestones, metrics, risks, and weekly reports.
- Provides a milestone calendar with due-date visibility, status highlighting, and weekly update context.
- Provides a metric dashboard grouped by project and business domain, with current values, target values, formulas, observation windows, and editable metric definitions.
- Supports project maintenance workflows for project briefs, milestone schedules, metric records, and weekly progress.
- Integrates with Feishu OAuth for user identity, role mapping, and project-member access control.
- Syncs Feishu groups and group members when administrators explicitly trigger chat/member synchronization.
- Sends Feishu interactive cards for milestone reminders and weekly progress notifications.
- Stores operational records in MySQL through Prisma, including users, projects, milestones, metrics, weekly reports, risks, governance tasks, Feishu chats, and audit logs.

## Tech Stack

- Runtime: Node.js 20+
- Server: Express
- Database: MySQL 8
- ORM: Prisma
- Frontend: static HTML, CSS, and browser JavaScript served by Express
- Auth: JWT cookie sessions, password login, Feishu OAuth
- Integrations: Feishu OpenAPI for identity, group sync, group members, and card messages
- Test runner: native `node:test`

## Repository Structure

```text
.
|-- app.js                         # Browser application
|-- index.html                     # Main HTML shell
|-- styles.css                     # Application styles
|-- data.js                        # Baseline project and metric source data
|-- prisma/schema.prisma           # MySQL data model
|-- src/
|   |-- app.js                     # Express app wiring
|   |-- server.js                  # Server entrypoint
|   |-- config.js                  # Environment configuration
|   |-- routes/                    # HTTP API routes
|   |-- services/                  # Domain and Feishu integration logic
|   |-- lib/                       # Shared utilities and Feishu API client
|   |-- middleware/                # Request middleware
|   `-- ui/                        # Frontend view-model helpers tested in Node
|-- scripts/                       # Seed, sync, preflight, and Feishu scripts
|-- tests/                         # Unit and integration-style tests
|-- DEPLOY_MYSQL.md                # Detailed deployment notes
`-- .env.example                   # Environment variable template
```

## Core Workflows

### 1. Project Governance

Administrators can maintain project overview information, project stages, milestones, metrics, business lines, project owners, risks, and Feishu group bindings. Members see only the projects they are allowed to maintain.

### 2. Weekly Updates

Project members submit weekly progress and risk/support requests against their project and relevant milestone. The system stores these records, surfaces them in the milestone calendar, and can send a green Feishu progress card to the bound project group.

### 3. Milestone Reminders

The reminder script reads due milestones from MySQL and sends orange Feishu reminder cards to project groups. It supports:

- Today due
- Tomorrow due
- Catch-up reminders for non-working-day due dates
- Preview sending to a test chat without writing sent logs
- Audit-log based deduplication to avoid repeated reminders

### 4. Metrics Dashboard

The metric dashboard uses project-level metric definitions from the database and baseline source data. It supports current/target values, formulas, observation time, status grouping, and project-scoped details.

### 5. Feishu Identity and Group Sync

Feishu permissions are intentionally split by workflow:

- Normal login only requests user identity scopes.
- Group and member synchronization requests chat scopes only when an administrator triggers synchronization.
- Card sending uses app message permissions and does not depend on the normal login scope.

This keeps member login lightweight while preserving administrator-only operational sync and notification capabilities.

## Prerequisites

- Node.js 20 or newer
- MySQL 8
- npm
- A Feishu self-built app if Feishu login, chat sync, or card notification features are enabled

## Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Minimum local development values:

```bash
PORT=3000
DATABASE_URL="mysql://root:password@127.0.0.1:3306/key_project_dashboard"
JWT_SECRET="replace-with-a-long-random-string"
JWT_EXPIRES_IN="7d"
ADMIN_NAME="System Admin"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="ChangeMe123!"
COOKIE_SECURE="false"
```

Create the database:

```sql
CREATE DATABASE key_project_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## Feishu Configuration

If Feishu features are enabled, configure:

```bash
FEISHU_APP_ID="cli_xxx"
FEISHU_APP_SECRET="xxx"
FEISHU_REDIRECT_URI="https://your-domain.com/api/auth/feishu/callback"
FEISHU_POST_LOGIN_REDIRECT="/"
PUBLIC_BASE_URL="https://your-domain.com/"
```

### Login Scopes

Normal user login should only use:

```bash
FEISHU_SCOPES="contact:user.base:readonly auth:user.id:read"
```

The server also filters the login authorization URL defensively, so legacy environment values containing chat or message scopes will not be sent during normal login.

### Chat Sync Scopes

Group and member synchronization is administrator-only and uses:

```bash
FEISHU_CHAT_SYNC_SCOPES="im:chat:read im:chat.members:read"
```

This is used only by the dedicated chat-sync OAuth flow.

### Message/Card Scopes

Milestone reminders and weekly progress cards require a message-send permission such as:

```bash
FEISHU_MESSAGE_SCOPES="im:message"
```

Depending on the Feishu app permission model, `im:message:send_as_bot` or `im:message:send` may also be acceptable. The app must have the relevant permissions approved in Feishu Open Platform.

### Access Control

Recommended production settings:

```bash
FEISHU_ALLOW_ALL_USERS="false"
FEISHU_ALLOWED_EMAILS="person@example.com"
FEISHU_ADMIN_NAMES="Admin Name"
FEISHU_IDENTITY_ADMIN_NAMES="Identity Admin Name"
```

Identity administrators can manage user/project bindings and trigger chat synchronization.

## Installation

```bash
npm ci
npm run prisma:generate
npx prisma db push
npm run seed
```

`npm run seed` imports baseline projects, milestones, metrics, and the initial administrator account from `data.js` and `.env`.

## Running Locally

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

Production start:

```bash
npm start
```

The repository also includes `ecosystem.config.cjs` for PM2-based deployment.

## Data Operations

Seed baseline data:

```bash
npm run seed
```

Synchronize metric definitions from `data.js` to MySQL:

```bash
npm run metrics:sync
```

Fetch Feishu chat members for diagnostics:

```bash
npm run feishu:chat-members -- --chat-id oc_xxx
```

## Feishu Reminder Scripts

Dry-run milestone reminders:

```bash
npm run feishu:milestone-reminders -- --base-url="https://your-domain.com/#report"
```

Send real milestone reminders:

```bash
npm run feishu:milestone-reminders:send -- --base-url="https://your-domain.com/#report"
```

Send a test milestone card:

```bash
npm run feishu:test-card -- --today --chat-name="Feishu Test Group" --send
```

Recommended cron example:

```cron
30 10 * * 1-5 cd /srv/key-project-dashboard && /usr/bin/npm run feishu:milestone-reminders:send -- --base-url="https://your-domain.com/#report" >> /var/log/key-project-milestone-reminders.log 2>&1
```

## Static GitHub Pages Build

The repository includes a GitHub Pages workflow and a static build script:

```bash
npm run build:pages
```

This produces `dist/` for static hosting. The full authenticated application still requires the Node.js API and MySQL backend.

## Quality Checks

Run syntax checks:

```bash
npm run check
```

Run the test suite:

```bash
npm test
```

Run deployment preflight checks:

```bash
npm run preflight -- --skip-http
```

After the service is running:

```bash
npm run preflight -- --base-url http://127.0.0.1:3000
```

The preflight script validates environment variables, Feishu callback URLs, login scopes, chat sync scopes, message permissions, callback configuration, and JSON responses from core API paths.

## Database Model Summary

The Prisma schema covers:

- `User`: password and Feishu-authenticated users
- `Project`: core project metadata and Feishu chat binding
- `ProjectMember`: project membership resolved from Feishu chat members
- `FeishuChat` and `FeishuChatMember`: synchronized Feishu group data
- `Milestone`: project milestone schedule and status
- `Metric` and `MetricRecord`: project metrics and history
- `WeeklyReport`: weekly progress submissions
- `Risk`: project risks
- `GovernanceTask`: governance follow-up items
- `AuditLog`: operational audit and reminder deduplication records

## Deployment Notes

For a production-like deployment:

1. Use MySQL 8 with `utf8mb4`.
2. Set `COOKIE_SECURE=true` behind HTTPS.
3. Keep `JWT_SECRET` long and private.
4. Configure `FEISHU_REDIRECT_URI` exactly as registered in Feishu Open Platform.
5. Configure `PUBLIC_BASE_URL` to the externally reachable application URL.
6. Run `npm run check`, `npm test`, and `npm run preflight` before switching traffic.
7. Use PM2, systemd, or another process manager for the Node.js server.
8. Schedule milestone reminder scripts only after verifying a dry run.

See `DEPLOY_MYSQL.md` for more detailed deployment notes.

## Development Principles

- Keep Feishu login, chat synchronization, and message sending permissions separated.
- Prefer database-backed project, milestone, metric, and report data over local-only state.
- Keep reminder card previews on the real reminder path instead of using synthetic demo cards.
- Use tests for permission, card, metric, report, and dashboard behavior before changing production logic.
- Avoid changing unrelated generated or deployment files when making targeted product changes.
