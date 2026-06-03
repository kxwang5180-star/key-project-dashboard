# Key Project Dashboard Continuation Note

## Project Summary

This repo is a key project management dashboard with:

- Frontend: static `index.html` + `app.js` + `styles.css`
- Backend: Express API under `src/`
- Database: Prisma + MySQL
- Auth: Feishu OAuth login
- Permissions: admin vs member, plus project-level access via Feishu group membership

## Current Deployment Context

- Local repo: `/Users/kk/Documents/Codex/2026-05-27/ai-ai-ai`
- Server app dir: `/srv/key-project-dashboard`
- Process manager: `pm2`
- Because server access to GitHub is unstable, deployment is currently done by:
  - packaging locally
  - uploading tarball to server
  - extracting into `/srv/key-project-dashboard`
  - running `npm install`, `npm run prisma:generate`, `npx prisma db push`, `pm2 reload ... --update-env`

## Feishu Login Status

- Feishu login is working now.
- Root cause of prior 404 was wrong callback IP / wrong ingress target.
- Callback path that must stay aligned between `.env` and Feishu Open Platform:
  - `http://<correct-server-ip>/api/auth/feishu/callback`

## Important Environment Variables

These are important and must exist on the server `.env`:

```bash
FEISHU_SCOPES="contact:user.base:readonly auth:user.id:read im:chat:read im:chat.members:read"
FEISHU_ADMIN_NAMES="王康旭,赵长硕,姚翔宇"
FEISHU_IDENTITY_ADMIN_NAMES="王康旭"
```

Notes:

- `FEISHU_ADMIN_NAMES` controls who becomes `ADMIN`.
- `FEISHU_IDENTITY_ADMIN_NAMES` controls who can see/manage the identity binding page.
- Current intended behavior:
  - 王康旭: admin + identity admin
  - 赵长硕 / 姚翔宇: admin, but not identity admin
  - other users: member, only see their project maintenance scope

## Role / Identity Logic

### What is already implemented

- Feishu login writes/updates user records.
- Existing `ADMIN` users are no longer downgraded to `MEMBER` on relogin.
- Admin name fallback is baked into code for:
  - 王康旭
  - 赵长硕
  - 姚翔宇
- `canManageIdentity` is separate from `isAdmin`.

### Matching behavior

Users are matched to projects using:

- `feishuUserId`
- `feishuOpenId`
- `feishuUnionId`
- email fallback when available

Project membership comes from synced Feishu group members written into `ProjectMember`.

## Current Frontend State

### Identity / Register view

Ongoing redesign has partially landed:

- identity page was being converted from flat rows to:
  - admin group
  - per-project groups
  - avatar click -> modal edit
- `返回看板` and `退出登录` were reintroduced into the identity management area
- group chat binding area was moved toward a 2-column layout
- chat search was updated to support IME composition

### Important current caveat

`app.js` is in a partially transitioned state:

- old row-based binding logic and new grouped-avatar logic have both existed during edits
- latest local changes were syntactically checked and passed
- after deployment, identity page behavior should be verified carefully in browser

## Current Backend State

### Already implemented

- `/api/auth/me` returns authenticated user and allowed project ids
- `/api/projects` is filtered by allowed projects for non-admin users
- `/api/bootstrap` is filtered by allowed projects for non-admin users
- `/api/projects/:id/chat` binds project to Feishu chat
- `/api/projects/:id/chat/sync` syncs members from bound Feishu chat
- `/api/auth/feishu/my-chats/sync` syncs current admin's chats and members

### Improved error handling already added

- frontend `apiRequest()` no longer blindly JSON parses HTML responses
- `/api/*` unknown paths now return JSON 404 instead of static HTML

## Group Chat Sync Status

### Current symptom

Latest known symptom:

- sync can write many chats
- member count still comes back as `0`
- UI reports something like:
  - `已写入 49 个群聊、0 条成员记录`

### What has already been tried

- user token + tenant token
- `member_id_type=user_id`
- `member_id_type=open_id`
- frontend now records `chatSyncErrors`

### Most likely remaining Feishu-side causes

- app robot capability not enabled
- app robot not actually in target groups
- group member read permission still blocked at app / tenant / group scope
- returned ids differ from assumptions and need live inspection from server logs / DB rows

### Next debugging target

After next deploy, use the updated UI error list and inspect:

- server logs for `/api/auth/feishu/my-chats/sync`
- stored `FeishuChat.raw`
- stored `FeishuChatMember` rows

## Milestone / Metrics Maintenance Status

### Already implemented

- focused milestone editor now has independent save path
- milestone save calls backend `PUT /api/projects/:id/milestones`
- metric save calls backend `PUT /api/projects/:id/metrics`
- milestone input updates draft on `input`, not only on `change`

### Verify after deploy

- change milestone date only
- click `保存里程碑`
- refresh page
- confirm date persists from backend, not only localStorage

## Files Most Relevant For Next Session

- `app.js`
- `styles.css`
- `index.html`
- `src/app.js`
- `src/config.js`
- `src/routes/auth.js`
- `src/routes/projects.js`
- `src/services/bootstrap.js`
- `src/services/project-members.js`
- `src/services/feishu-chat-sync.js`

## What Was Being Fixed Most Recently

The most recent local changes focused on:

1. identity page usability
2. grouped user binding UI
3. restore navigation / logout controls
4. 2-column project chat binding layout
5. better chat sync feedback
6. IME-safe chat search
7. milestone direct save

## Recommended Next Session Priorities

1. Deploy the latest local changes to the server
2. Verify identity page rendering in browser
3. Verify grouped user binding interaction
4. Confirm project chat binding renders in two columns
5. Retry Feishu chat sync and capture exact per-chat failure messages
6. Fix remaining member sync issue using live API evidence

## Useful Server Checks

```bash
grep -E '^FEISHU_ADMIN_NAMES=|^FEISHU_IDENTITY_ADMIN_NAMES=|^FEISHU_SCOPES=' /srv/key-project-dashboard/.env
pm2 reload key-project-dashboard --update-env
pm2 logs key-project-dashboard --lines 100
curl -i http://127.0.0.1/api/health
```

## Suggested Prompt For New Chat

Use something like:

> Continue from `CONTINUATION.md`. Focus first on deploying the latest local changes, then verify the identity page layout and debug why Feishu group member sync still returns 0 members.

