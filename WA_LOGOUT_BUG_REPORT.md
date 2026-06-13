# WhatsApp LOGOUT Bug Report

## Environment
- **OS:** Windows 10 (build 22631.6199)
- **Node.js:** v22.22.2
- **whatsapp-web.js:** 1.34.7
- **puppeteer (via whatsapp-web.js):** ^24.38.0
- **Chrome:** System Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`

## Symptom Summary

After scanning the QR code and successfully authenticating, WhatsApp immediately logs out (LOGOUT) within 5 seconds of the `ready` event. The process then crashes with a "detached Frame" error, and the corrupt session cannot be cleared due to EBUSY file locks.

## Detailed Log

```
[02:10:52] WhatsApp session found — auto-connecting...
[02:10:52] Initializing WhatsApp client...
[02:10:52] Starting WhatsApp client...
[02:11:00] QR code received from WA                ← session is corrupt, QR generated
[02:11:00] QR image sent to frontend
[02:11:00] Client initialize() completed
[02:11:11] WhatsApp session authenticated           ← user scanned QR (3× auth)
[02:11:11] WhatsApp session authenticated
[02:11:11] WhatsApp session authenticated
[02:11:12] WhatsApp connected and ready             ← connected
[02:11:15] WhatsApp session authenticated           ← more auth events (5×)
[02:11:15] WhatsApp session authenticated
[02:11:15] WhatsApp session authenticated
[02:11:15] WhatsApp session authenticated
[02:11:15] WhatsApp session authenticated
[02:11:16] WhatsApp disconnected: LOGOUT            ← LOGOUT after ~5s
[02:11:16] LOGOUT — clearing session
[02:11:16] Failed to clear session: EBUSY           ← files still locked by browser
[02:11:17] Unhandled rejection: Attempted to use detached Frame    ← crash
```

## Timeline

| Time | Event |
|------|-------|
| T+0s | Server starts, session found, init() called |
| T+8s | QR code received (session is corrupt, fallback to QR) |
| T+19s | User scans QR → "authenticated" (3×) |
| T+20s | "connected and ready" |
| T+23s | "authenticated" again (5× more) |
| T+24s | LOGOUT |
| T+24s | destroyClient → browser process killed |
| T+24s | clearSession fails with EBUSY (browser still has file locks) |
| T+25s | whatsapp-web.js internal inject() runs on detached frame → crash |

## Issues Identified

### 1. Duplicate Event Firing
`authenticated` fires 3 times initially, then 5 more times after `ready`. `ready` fires once but is followed by more `authenticated` events. This suggests a race condition in whatsapp-web.js's event emission during the QR handshake + session merge.

### 2. LOGOUT Immediately After Connection
WhatsApp logs out the device ~5 seconds after connection. This typically means:
- The session data being saved by `LocalAuth` conflicts with the existing (corrupt) session CREDENTIALS file
- WhatsApp detects the device as compromised or detects an inconsistent authentication state
- The multi-device protocol handshake fails because the old session file pollutes the new authentication

### 3. Detached Frame Crash
After `destroyClient()` kills the browser, whatsapp-web.js's `Client.inject()` method (at `src/Client.js:126`) tries to call `page.evaluate()` on a frame that no longer exists. This is an unhandled promise rejection that crashes the process.

### 4. EBUSY Session Cleanup
The Chrome browser process holds file locks on `sessions/session/Default/Account Web Data` even after `client.destroy()`. The `rm -rf` call fails because Windows file locking doesn't release fast enough.

## Root Cause Hypothesis

The `LocalAuth` auth strategy stores session data in `/sessions/session/`. When a session file becomes partially corrupted (e.g., after an interrupted LOGOUT from a previous run), the new authentication flow:

1. Reads the corrupt CREDENTIALS file
2. Attempts multi-device pairing (QR scan)
3. The QR handshake succeeds → `authenticated` fires
4. The client saves the new credentials ON TOP of the corrupt ones
5. WhatsApp detects the inconsistency → LOGOUT
6. The LOGOUT triggers `client.destroy()` while an `inject()` call is in-flight → detached frame error

## Attempted Fixes (in current codebase)

Each fix still allows the LOGOUT + crash:

1. **`clearSession()` with retry** — retries 5× with 1s delay, but EBUSY persists because Chrome's file lock release is async
2. **`.corrupt` marker file** — written when clearSession fails, so next boot skips the bad session. But the LOGOUT still happens
3. **`process.on('uncaughtException')`** — catches the crash but doesn't prevent it from happening
4. **`process.on('unhandledRejection')`** — same
5. **`readyFired` guard** — prevents duplicate `ready` events from re-entering handlers
6. **`status === 'disconnected'` guard** — prevents event handlers from running after destroy

## What's Needed

A solution that prevents the LOGOUT or properly handles the session lifecycle so this cycle doesn't occur. Possible approaches:

1. **Delete the corrupt CREDENTIALS file before authenticate** — before the QR handshake completes, clear any stale session files so the new auth writes to a clean slate
2. **Use a custom auth strategy** instead of `LocalAuth` to have full control over session read/write timing
3. **Downgrade whatsapp-web.js** to a known-stable version (1.22.x or earlier) that doesn't have this race condition
4. **Wait for browser process exit** before clearing session — use `client.destroy().then()` to properly sequence cleanup
5. **Use `puppeteer-extra` with stealth plugin** — some users report LOGOUT is caused by WhatsApp detecting automation; stealth plugin may help
6. **Switch to `@whiskeysockets/baileys`** — a different WhatsApp library that doesn't use puppeteer at all (pure WebSocket implementation)

## Key Files for Debugging

- `/services/whatsappService.js` — WhatsApp client lifecycle
- `/sessions/session/` — LocalAuth session storage
- `/node_modules/whatsapp-web.js/src/Client.js` — whatsapp-web.js source (lines 126 and 503 are crash points)
- `/node_modules/whatsapp-web.js/src/authStrategies/LocalAuth.js` — session save/load logic

## Reproduction

100% reproducible on this Windows machine:
```
rm -rf sessions/
node server.js
# Open http://localhost:4000/connect
# Scan QR code with WhatsApp
# ~5 seconds after connected → LOGOUT → crash
```
