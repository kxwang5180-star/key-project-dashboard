# Identity And Chat Sync Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the identity-management page and improve Feishu chat member sync diagnostics so deployment can distinguish permission failures from empty member responses.

**Architecture:** Keep the existing static frontend and Express service structure. Make the identity grouping change in `app.js`, and keep Feishu sync diagnostics inside `src/services/feishu-chat-sync.js` with a small exported pure helper for regression testing.

**Tech Stack:** Static HTML/CSS/JS frontend, Express, Prisma, Node.js built-in test runner.

---

### Task 1: Feishu Empty-Member Diagnostics

**Files:**
- Create: `tests/feishu-chat-sync-diagnostics.test.js`
- Modify: `src/services/feishu-chat-sync.js`

- [x] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildEmptyMemberSyncWarning } from "../src/services/feishu-chat-sync.js";

test("buildEmptyMemberSyncWarning describes empty member responses with token source", () => {
  const warning = buildEmptyMemberSyncWarning({
    chatId: "oc_123",
    chatName: "项目周会群",
    source: "tenant:user_id",
    memberIdType: "user_id",
  });

  assert.deepEqual(warning, {
    chatId: "oc_123",
    name: "项目周会群",
    message: "成员接口返回 0 条记录（tenant:user_id，member_id_type=user_id）。请确认应用机器人已在该群内，且具备 im:chat.members:read 权限。"
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/feishu-chat-sync-diagnostics.test.js`
Expected: FAIL because `buildEmptyMemberSyncWarning` is not exported.

- [x] **Step 3: Write minimal implementation**

Add `buildEmptyMemberSyncWarning()` to `src/services/feishu-chat-sync.js`, and call it when `fetchChatMembersWithFallback()` succeeds but returns an empty member list.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/feishu-chat-sync-diagnostics.test.js`
Expected: PASS.

### Task 2: Identity Groups Default Visibility

**Files:**
- Modify: `app.js`

- [x] **Step 1: Update expansion semantics**

Change grouped identity cards so groups are expanded by default and only collapse after the user explicitly toggles them closed.

- [x] **Step 2: Verify syntax**

Run: `node --check app.js`
Expected: exit code 0.

### Task 3: Full Local Verification

**Files:**
- No code changes.

- [x] **Step 1: Run JavaScript syntax checks**

Run: `node --check app.js && node --check src/services/feishu-chat-sync.js`
Expected: both commands exit 0.

- [x] **Step 2: Run focused test**

Run: `node --test tests/feishu-chat-sync-diagnostics.test.js`
Expected: PASS.

- [x] **Step 3: Inspect working tree**

Run: `git status --short`
Expected: only intentional files changed.
