# Phone SMS Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `5sim` and `NexSMS` phone/SMS provider support to the current branch without overwriting branch-specific behavior.

**Architecture:** Extend the current HeroSMS-centered config/state model into a provider-aware model. Keep the existing step-9 flow structure, but route activation acquisition and code polling by provider.

**Tech Stack:** Chrome extension sidepanel UI, background service worker, Node test runner

---

### Task 1: Add failing tests for provider config UI

**Files:**
- Modify: `tests/sidepanel-phone-verification-settings.test.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run `node --test tests/sidepanel-phone-verification-settings.test.js` and verify it fails**
- [ ] **Step 3: Implement minimal sidepanel HTML/JS additions**
- [ ] **Step 4: Re-run `node --test tests/sidepanel-phone-verification-settings.test.js` and verify it passes**

### Task 2: Add failing tests for provider activation helpers

**Files:**
- Modify: `tests/phone-verification-flow.test.js`
- Modify: `background/phone-verification-flow.js`
- Modify: `background.js`

- [ ] **Step 1: Write failing tests for 5sim and NexSMS helper behavior**
- [ ] **Step 2: Run `node --test tests/phone-verification-flow.test.js` and verify it fails**
- [ ] **Step 3: Implement minimal provider-aware helper logic**
- [ ] **Step 4: Re-run `node --test tests/phone-verification-flow.test.js` and verify it passes**

### Task 3: Run focused regression coverage

**Files:**
- Modify: `background.js`
- Modify: `background/phone-verification-flow.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`

- [ ] **Step 1: Run `node --test tests/sidepanel-phone-verification-settings.test.js tests/phone-verification-flow.test.js`**
- [ ] **Step 2: Run any directly impacted branch-specific regressions**
- [ ] **Step 3: Fix remaining failures without broad refactors**
