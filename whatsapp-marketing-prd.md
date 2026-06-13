# PRD: WhatsApp Marketing Tool
**Version:** 1.0  
**Type:** Personal Automation Tool (Single-User)  
**Target AI Agent:** Cursor / Claude / Copilot  

> **AI AGENT INSTRUCTIONS:** Read this entire PRD before writing any code. Follow the build order in Section 10. Never skip ahead. Each phase depends on the previous. When in doubt, refer back to Section 3 (Constraints) and Section 11 (Acceptance Criteria).

---

## Table of Contents

1. [Project Summary](#1-project-summary)
2. [Tech Stack](#2-tech-stack)
3. [Hard Constraints](#3-hard-constraints)
4. [Architecture Overview](#4-architecture-overview)
5. [Folder Structure](#5-folder-structure)
6. [Database Schema](#6-database-schema)
7. [Service Layer Specs](#7-service-layer-specs)
8. [API Endpoints](#8-api-endpoints)
9. [Frontend Spec](#9-frontend-spec)
10. [Build Order (AI Agent Roadmap)](#10-build-order-ai-agent-roadmap)
11. [Acceptance Criteria](#11-acceptance-criteria)
12. [Error Handling Rules](#12-error-handling-rules)
13. [PHP Integration Examples](#13-php-integration-examples)
14. [Deployment Guide](#14-deployment-guide)
15. [Environment Variables](#15-environment-variables)

---

## 1. Project Summary

Build a **self-hosted WhatsApp bulk messaging tool** for personal/business automation.  
No SaaS. No multi-tenancy. One user. One VPS. Runs offline (except WhatsApp itself).

### What It Does
- Connects WhatsApp via QR code scan
- Imports contacts via CSV upload
- Creates and runs message campaigns
- Sends bulk WhatsApp messages with configurable delay
- Tracks live sending progress via websocket
- Exposes REST API for PHP/external integration
- Survives server restarts (resumes where it left off)

### What It Does NOT Do
- No multi-user support
- No cloud database
- No external queue service
- No payment or billing
- No public-facing SaaS features

---

## 2. Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Runtime | Node.js 20 LTS | Stable, widely supported |
| Framework | Express 4 | Simple, no overhead |
| WhatsApp | whatsapp-web.js | QR-based WA Web automation |
| Database | SQLite (better-sqlite3) | Local, fast, sync API, zero config |
| Realtime | Socket.IO 4 | Live progress to UI |
| Scheduler | node-cron | Lightweight cron triggers |
| Frontend | React 18 (Vite) | Simple component UI |
| Process Manager | PM2 | Restart-safe background execution |
| Reverse Proxy | Nginx | Port 80/443 forwarding |
| Auth | API key (header-based) | Simple, no JWT overhead |

> **AI NOTE:** Do not substitute any item in this table. Do not add Redis, MongoDB, RabbitMQ, or any external service. If you feel you need them, re-read Section 3.

---

## 3. Hard Constraints

These rules cannot be broken. If any implementation decision conflicts with these, the constraint wins.

```
✅ MUST use SQLite only — no other database
✅ MUST store sessions on local filesystem (/sessions/)
✅ MUST persist campaign progress after every single message send
✅ MUST resume running campaigns automatically on server restart
✅ MUST run entirely on one VPS
✅ MUST work with UI closed (background execution)
✅ MUST log every error to file
✅ MUST use API key authentication on all API routes

❌ NO Redis
❌ NO external message queues (BullMQ, RabbitMQ, SQS)
❌ NO microservices
❌ NO multi-user / multi-tenant logic
❌ NO cloud storage
❌ NO complex design patterns (no DDD, no CQRS, no event sourcing)
```

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    DigitalOcean VPS                      │
│                                                          │
│  ┌──────────┐     ┌───────────────────────────────────┐ │
│  │  Nginx   │────▶│         Node.js App (PM2)         │ │
│  │ :80/:443 │     │              :3000                │ │
│  └──────────┘     │                                   │ │
│                   │  ┌─────────────────────────────┐  │ │
│                   │  │        Express Server        │  │ │
│                   │  │  - REST API Routes           │  │ │
│                   │  │  - Static React Build        │  │ │
│                   │  │  - Socket.IO Server          │  │ │
│                   │  └──────────┬──────────────────┘  │ │
│                   │             │                      │ │
│                   │  ┌──────────▼──────────────────┐  │ │
│                   │  │       Service Layer          │  │ │
│                   │  │                             │  │ │
│                   │  │  whatsappService            │  │ │
│                   │  │  ├─ whatsapp-web.js client  │  │ │
│                   │  │  └─ LocalAuth (/sessions/)  │  │ │
│                   │  │                             │  │ │
│                   │  │  campaignService            │  │ │
│                   │  │  ├─ in-memory queue         │  │ │
│                   │  │  └─ SQLite persistence      │  │ │
│                   │  │                             │  │ │
│                   │  │  csvService                 │  │ │
│                   │  │  └─ parse/validate/dedupe   │  │ │
│                   │  └──────────┬──────────────────┘  │ │
│                   │             │                      │ │
│                   │  ┌──────────▼──────────────────┐  │ │
│                   │  │   SQLite DB (/data/db.sqlite)│  │ │
│                   │  └─────────────────────────────┘  │ │
│                   │                                   │ │
│                   │  /sessions/   ← WA session files  │ │
│                   │  /logs/       ← app + campaign logs│ │
│                   │  /uploads/    ← temp CSV files    │ │
│                   └───────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Data Flow: Sending a Campaign

```
UI clicks "Start"
    │
    ▼
POST /api/campaign/:id/start
    │
    ▼
campaignService.startCampaign(id)
    │
    ├─ Load pending contacts from SQLite
    ├─ Set campaign status = 'running' in DB
    │
    ▼
Sending Loop (async, non-blocking):
    │
    ├─ sendMessage(contact)
    │   ├─ whatsappService.send(phone, message)
    │   ├─ on success → update contact status = 'sent' in DB
    │   ├─ on failure → retry up to 2x → mark 'failed'
    │   ├─ log result to /logs/campaign-{id}.log
    │   └─ emit Socket.IO event → UI updates live
    │
    ├─ wait(delay + jitter)
    └─ repeat until all contacts done
         │
         ▼
    Set campaign status = 'completed'
    Emit final Socket.IO event
```

---

## 5. Folder Structure

```
/app
├── server.js                  ← Entry point. Mount routes, init Socket.IO, boot services
├── package.json
├── .env                       ← See Section 15 for required vars
│
├── /config
│   └── index.js               ← Load .env, export config object
│
├── /db
│   ├── db.js                  ← better-sqlite3 singleton, export `db`
│   └── schema.sql             ← All CREATE TABLE statements
│
├── /services
│   ├── whatsappService.js     ← WA client init, QR, send, status
│   ├── campaignService.js     ← Queue, start/pause/resume/stop logic
│   └── csvService.js          ← Parse, validate, normalize, dedupe
│
├── /routes
│   ├── whatsapp.js            ← /api/whatsapp/*
│   ├── campaign.js            ← /api/campaign/*
│   └── contacts.js            ← /api/campaign/:id/upload-csv
│
├── /middleware
│   ├── auth.js                ← API key check middleware
│   └── errorHandler.js        ← Global Express error handler
│
├── /utils
│   ├── logger.js              ← Winston logger, file + console
│   ├── tokenUtils.js          ← Generate/verify cron tokens
│   └── phoneUtils.js          ← Normalize, validate phone numbers
│
├── /sessions                  ← whatsapp-web.js LocalAuth stores here
│   └── .gitkeep
│
├── /uploads                   ← Temp CSV upload storage (multer)
│   └── .gitkeep
│
├── /logs
│   ├── app.log                ← Global app log
│   └── .gitkeep               ← campaign-{id}.log files created dynamically
│
├── /data
│   └── .gitkeep               ← db.sqlite created here on first run
│
└── /client                    ← React app (Vite)
    ├── index.html
    ├── vite.config.js
    └── /src
        ├── main.jsx
        ├── App.jsx
        ├── /pages
        │   ├── Dashboard.jsx
        │   ├── ConnectPage.jsx
        │   ├── CampaignList.jsx
        │   ├── CreateCampaign.jsx
        │   ├── CampaignDetail.jsx
        │   └── LogsViewer.jsx
        ├── /components
        │   ├── QRCodeDisplay.jsx
        │   ├── ProgressBar.jsx
        │   ├── LiveLog.jsx
        │   ├── StatusBadge.jsx
        │   └── Navbar.jsx
        └── /lib
            ├── api.js          ← Axios instance with API key header
            └── socket.js       ← Socket.IO client singleton
```

---

## 6. Database Schema

> **AI NOTE:** Run `schema.sql` on first boot via `db.js`. Use `CREATE TABLE IF NOT EXISTS` on all tables. Never drop tables in production code.

```sql
-- /db/schema.sql

CREATE TABLE IF NOT EXISTS campaigns (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    message     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'draft',
    -- status values: draft | running | paused | completed | failed
    delay       INTEGER NOT NULL DEFAULT 5,
    -- delay in seconds between messages
    token       TEXT UNIQUE,
    -- cron trigger token (random hex)
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    phone       TEXT NOT NULL,
    name        TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    -- status values: pending | sent | failed
    retries     INTEGER NOT NULL DEFAULT 0,
    sent_at     DATETIME,
    error       TEXT,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER,
    phone       TEXT,
    event       TEXT NOT NULL,
    -- event values: sent | failed | retry | paused | resumed | started | completed
    message     TEXT,
    timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_campaign_status
    ON contacts(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_logs_campaign
    ON logs(campaign_id);
```

---

## 7. Service Layer Specs

### 7.1 whatsappService.js

**Responsibilities:**
- Initialize whatsapp-web.js client with `LocalAuth`
- Emit QR code to Socket.IO room `'qr'`
- Maintain and expose connection status
- Provide `sendMessage(phone, text)` method
- Auto-reconnect on disconnect

**Key Implementation:**

```javascript
// Pattern to follow (not final code — agent must implement fully)

const { Client, LocalAuth } = require('whatsapp-web.js');

let status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
let client = null;

function init(io) {
    client = new Client({
        authStrategy: new LocalAuth({ dataPath: config.sessionPath }),
        puppeteer: { args: ['--no-sandbox'] }
    });

    client.on('qr', (qr) => {
        status = 'connecting';
        io.emit('whatsapp:qr', qr);         // Frontend renders QR
    });

    client.on('ready', () => {
        status = 'connected';
        io.emit('whatsapp:status', 'connected');
        logger.info('WhatsApp connected');
    });

    client.on('disconnected', (reason) => {
        status = 'disconnected';
        io.emit('whatsapp:status', 'disconnected');
        logger.warn(`WhatsApp disconnected: ${reason}`);
        // Auto-reconnect after 5s
        setTimeout(() => client.initialize(), 5000);
    });

    client.initialize();
}

async function sendMessage(phone, message) {
    if (status !== 'connected') throw new Error('WhatsApp not connected');
    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
    return client.sendMessage(chatId, message);
}

module.exports = { init, sendMessage, getStatus: () => status };
```

---

### 7.2 campaignService.js

**Responsibilities:**
- Manage in-memory running state (Map of active campaign loops)
- Start / pause / resume / stop campaigns
- Run sending loop with delay and jitter
- Retry failed messages up to 2 times
- Persist every status change to SQLite immediately
- Resume unfinished campaigns on boot
- Emit Socket.IO events for live UI updates

**Campaign Loop Pseudocode:**

```
async function runCampaign(campaignId, io):
    campaign = db.getCampaign(campaignId)
    contacts = db.getPendingContacts(campaignId)  ← only status='pending'
    
    activeCampaigns.set(campaignId, { running: true })
    db.setCampaignStatus(campaignId, 'running')
    
    for each contact in contacts:
        if activeCampaigns.get(campaignId).paused:
            db.setCampaignStatus(campaignId, 'paused')
            break  ← exit loop, state saved in DB
        
        success = false
        for attempt in [1, 2, 3]:  ← max 3 attempts (1 + 2 retries)
            try:
                await whatsappService.sendMessage(contact.phone, campaign.message)
                db.setContactStatus(contact.id, 'sent')
                success = true
                break
            catch error:
                db.incrementRetries(contact.id)
                if attempt === 3:
                    db.setContactStatus(contact.id, 'failed', error.message)
        
        db.insertLog(campaignId, contact.phone, success ? 'sent' : 'failed')
        io.to(`campaign-${campaignId}`).emit('campaign:progress', getStats(campaignId))
        
        jitter = Math.random() * 3000  ← 0-3 second random extra delay
        await sleep(campaign.delay * 1000 + jitter)
    
    if all contacts processed:
        db.setCampaignStatus(campaignId, 'completed')
        io.to(`campaign-${campaignId}`).emit('campaign:complete')
    
    activeCampaigns.delete(campaignId)
```

**Restart Recovery (call on server boot):**

```javascript
async function resumeOnBoot(io) {
    const running = db.prepare(
        `SELECT id FROM campaigns WHERE status = 'running'`
    ).all();
    
    for (const campaign of running) {
        logger.info(`Resuming campaign ${campaign.id} after restart`);
        runCampaign(campaign.id, io);  // Non-blocking
    }
}
```

---

### 7.3 csvService.js

**Responsibilities:**
- Parse CSV buffer (using `csv-parse`)
- Validate each row has a phone column
- Normalize phone numbers (strip spaces, dashes, `+`, ensure digits only)
- Validate length (10–15 digits)
- Deduplicate by phone number within the same campaign
- Return `{ valid: [], invalid: [] }`

**Phone Normalization Rules:**
```
Input  → Output
+601234567890  → 601234567890
+60 12-345 6789 → 601234567890
(+60) 123456789 → 60123456789
Invalid: abc123, 123 (too short), skip these
```

---

## 8. API Endpoints

> **AI NOTE:** All routes except `GET /api/campaign/:id/trigger/:token` require `X-API-Key` header matching `process.env.API_KEY`.

### Authentication Middleware

```javascript
// /middleware/auth.js
module.exports = (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (!key || key !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};
```

---

### WhatsApp Endpoints

#### `POST /api/whatsapp/connect`
Trigger QR code generation. Client must be listening to `whatsapp:qr` Socket.IO event.

**Response:**
```json
{ "message": "QR generation initiated. Listen to whatsapp:qr socket event." }
```

---

#### `GET /api/whatsapp/status`

**Response:**
```json
{ "status": "connected" }
// status: "connected" | "connecting" | "disconnected"
```

---

### Campaign Endpoints

#### `POST /api/campaign`
Create new campaign.

**Request Body:**
```json
{
    "name": "Promo July 2025",
    "message": "Hi {{name}}, check out our offer!",
    "delay": 8
}
```

**Response:**
```json
{
    "id": 1,
    "name": "Promo July 2025",
    "status": "draft",
    "token": "a3f9bc12e4d07812",
    "created_at": "2025-07-01T10:00:00Z"
}
```

> `token` is auto-generated with `crypto.randomBytes(8).toString('hex')`.

---

#### `GET /api/campaign/:id`

**Response:**
```json
{
    "id": 1,
    "name": "Promo July 2025",
    "message": "Hi {{name}}, check out our offer!",
    "status": "running",
    "delay": 8,
    "token": "a3f9bc12e4d07812",
    "stats": {
        "total": 150,
        "sent": 42,
        "failed": 3,
        "pending": 105
    },
    "created_at": "2025-07-01T10:00:00Z"
}
```

---

#### `GET /api/campaign`
List all campaigns.

**Response:** Array of campaign objects (same shape as above, with stats).

---

#### `POST /api/campaign/:id/start`
Start a draft or paused campaign.

**Response:**
```json
{ "message": "Campaign started", "status": "running" }
```

**Errors:**
- `400` — Campaign already running
- `400` — No pending contacts
- `503` — WhatsApp not connected

---

#### `POST /api/campaign/:id/pause`

**Response:**
```json
{ "message": "Campaign paused", "status": "paused" }
```

---

#### `POST /api/campaign/:id/resume`

**Response:**
```json
{ "message": "Campaign resumed", "status": "running" }
```

---

#### `POST /api/campaign/:id/stop`
Hard stop. Marks remaining contacts as-is (pending stays pending for future resume).

**Response:**
```json
{ "message": "Campaign stopped" }
```

---

#### `DELETE /api/campaign/:id`
Delete campaign + all contacts + all logs for this campaign.
Only allowed if status is `draft`, `completed`, or `failed`.

**Response:** `204 No Content`

---

#### `POST /api/campaign/:id/token/regenerate`
Regenerate cron trigger token.

**Response:**
```json
{ "token": "new_token_hex_string" }
```

---

### Contact Endpoints

#### `POST /api/campaign/:id/upload-csv`
Upload CSV file. Multipart form with field name `contacts`.

**CSV Format:**
```csv
phone,name
601234567890,John Doe
6012345678,Jane
+60 11-2345 6789,Bob
```
Name column is optional.

**Response:**
```json
{
    "imported": 148,
    "skipped_duplicates": 2,
    "skipped_invalid": 3,
    "invalid_samples": ["abc123", "123"]
}
```

---

### Cron Trigger Endpoint

#### `GET /api/campaign/:id/trigger/:token`
Trigger campaign start via URL. No API key required (token is the auth).

**Rules:**
- Validate token matches campaign's token in DB
- Rate limit: max 1 trigger per 60 seconds per campaign (store last trigger time in memory)
- If campaign is `draft` or `paused` → start/resume it
- If already `running` → return `200` with current status, do not restart

**Response:**
```json
{ "message": "Campaign triggered", "status": "running" }
```

**Errors:**
- `404` — Campaign not found or token mismatch
- `429` — Rate limit exceeded
- `503` — WhatsApp not connected

---

## 9. Frontend Spec

### Tech
- React 18 + Vite
- React Router v6
- Socket.IO client
- Axios (with `X-API-Key` header pre-configured)
- Tailwind CSS (utility classes, dark-friendly)

### Pages & Key Behavior

#### `/` — Dashboard
- Cards: Total campaigns, Active campaigns, WhatsApp status
- Recent campaign list (last 5)
- WhatsApp status indicator (green/yellow/red dot + text)

#### `/connect` — WhatsApp QR Page
- Button: "Connect WhatsApp"
- On click: POST `/api/whatsapp/connect`, then listen for `whatsapp:qr` socket event
- Render QR code using `qrcode.react` library
- Auto-refresh QR if it expires
- Show "Connected ✓" when `whatsapp:status = 'connected'` event fires

#### `/campaigns` — Campaign List
- Table: Name | Status badge | Contacts | Created | Actions
- Actions: View | Delete (with confirm dialog)
- Button: "Create Campaign"

#### `/campaigns/new` — Create Campaign
- Fields: Campaign Name, Message (textarea), Delay (number, seconds)
- Submit → POST `/api/campaign`
- After creation → redirect to CSV upload step on same page

**CSV Upload Step (within Create page):**
- File picker (`.csv` only)
- On upload → POST `/api/campaign/:id/upload-csv`
- Show preview: imported count, skipped count, sample invalid numbers
- Confirm button → go to campaign detail page

#### `/campaigns/:id` — Campaign Detail (Live)
- Header: Campaign name, status badge, delay setting
- Stats row: Total | Sent | Failed | Remaining
- Progress bar: `sent / total * 100%`
- Action buttons:
  - `draft` → "Start Campaign" button
  - `running` → "Pause" button
  - `paused` → "Resume" button
  - `completed/failed` → No action buttons
- Live log feed (last 50 entries, auto-scroll):
  - Green row: ✓ Sent to [phone]
  - Red row: ✗ Failed [phone] — [error]
- Cron URL box: show trigger URL, copy button, regenerate token button

**Socket.IO events this page listens to (room: `campaign-{id}`):**

```javascript
socket.emit('join', `campaign-${id}`);         // Join room on mount
socket.on('campaign:progress', (stats) => { }); // Update stats + log
socket.on('campaign:complete', () => { });       // Show completion state
socket.on('campaign:paused', () => { });
```

#### `/logs` — Logs Viewer
- Dropdown: Select campaign (or "App Log")
- Display last 200 lines from log file
- Auto-refresh every 10s
- Filter by: all | sent | failed | errors

---

## 10. Build Order (AI Agent Roadmap)

> Follow this order exactly. Do not start a phase until the previous is working and tested.

```
Phase 1 — Foundation
─────────────────────
[ ] 1.1  Init Node.js project, install all dependencies
[ ] 1.2  Create .env file structure (see Section 15)
[ ] 1.3  Create /db/schema.sql and /db/db.js (SQLite singleton)
[ ] 1.4  Run schema on boot, verify tables created
[ ] 1.5  Create /config/index.js, /utils/logger.js

Phase 2 — WhatsApp Service
───────────────────────────
[ ] 2.1  Build whatsappService.js (init, QR, status, sendMessage)
[ ] 2.2  Create server.js skeleton with Express + Socket.IO
[ ] 2.3  Mount /routes/whatsapp.js
[ ] 2.4  Test: scan QR, verify 'connected' status
[ ] 2.5  Test: send one test message via Postman/curl

Phase 3 — CSV + Contacts
──────────────────────────
[ ] 3.1  Build csvService.js (parse, validate, normalize, dedupe)
[ ] 3.2  Mount multer for file upload
[ ] 3.3  Mount /routes/contacts.js
[ ] 3.4  Test: upload a CSV, verify contacts inserted in DB
[ ] 3.5  Test: duplicate detection, invalid number skipping

Phase 4 — Campaign CRUD
────────────────────────
[ ] 4.1  Build campaign DB helper functions (create, get, list, update status)
[ ] 4.2  Mount /routes/campaign.js (CRUD endpoints only, no send yet)
[ ] 4.3  Test: create campaign, get campaign, list campaigns, delete campaign

Phase 5 — Sending Engine
─────────────────────────
[ ] 5.1  Build campaignService.js (runCampaign loop)
[ ] 5.2  Wire start/pause/resume/stop to routes
[ ] 5.3  Wire Socket.IO progress events
[ ] 5.4  Test: start small campaign (3 contacts), watch DB update after each send
[ ] 5.5  Test: pause mid-campaign, check DB state, resume, verify it continues
[ ] 5.6  Test: kill server mid-campaign, restart, verify auto-resume fires

Phase 6 — Cron Trigger
───────────────────────
[ ] 6.1  Build tokenUtils.js
[ ] 6.2  Generate token on campaign create
[ ] 6.3  Build GET /api/campaign/:id/trigger/:token route
[ ] 6.4  Add rate limiting (in-memory, per campaign)
[ ] 6.5  Test: hit URL in browser, verify campaign starts
[ ] 6.6  Test: hit again within 60s, verify 429

Phase 7 — Frontend
────────────────────
[ ] 7.1  Scaffold React + Vite in /client
[ ] 7.2  Configure Vite proxy to :3000 for dev
[ ] 7.3  Build Navbar, routing skeleton
[ ] 7.4  Build ConnectPage.jsx (QR display)
[ ] 7.5  Build CampaignList.jsx
[ ] 7.6  Build CreateCampaign.jsx + CSV upload
[ ] 7.7  Build CampaignDetail.jsx with live Socket.IO
[ ] 7.8  Build Dashboard.jsx
[ ] 7.9  Build LogsViewer.jsx
[ ] 7.10 Run `vite build`, copy dist to /client/dist, serve via Express static

Phase 8 — Hardening
─────────────────────
[ ] 8.1  Add global error handler middleware
[ ] 8.2  Verify all errors are logged to file (not just console)
[ ] 8.3  Test WhatsApp disconnect mid-campaign → verify reconnect + campaign resumes
[ ] 8.4  Add input validation on all POST endpoints
[ ] 8.5  Test restart recovery end-to-end (kill -9, restart, check DB + resume)

Phase 9 — Deployment
──────────────────────
[ ] 9.1  Write PM2 ecosystem.config.js
[ ] 9.2  Write Nginx config
[ ] 9.3  Deploy to VPS, test all endpoints via public URL
[ ] 9.4  Verify /sessions/ and /data/ persist across PM2 restarts
```

---

## 11. Acceptance Criteria

The app is complete when ALL of the following pass:

```
WhatsApp
[ ] QR displays in UI within 5 seconds of clicking Connect
[ ] After scan, status shows 'connected' in UI
[ ] Sending a message to a real number works end-to-end

CSV Import
[ ] CSV with 100 rows imports in under 3 seconds
[ ] Duplicate phone numbers within same campaign are deduplicated
[ ] Invalid phone numbers are skipped and reported in response
[ ] Name column (optional) is stored when present

Campaign Engine
[ ] Campaign with 5 contacts sends all 5 with delay between each
[ ] Pausing mid-campaign stops sending after current message
[ ] Resuming continues from next pending contact
[ ] After server restart, running campaigns auto-resume
[ ] Each contact status (pending/sent/failed) persists in DB immediately after send
[ ] Failed sends are retried up to 2 times before marking failed

Live Progress
[ ] Campaign detail page shows live count updates while sending
[ ] Progress bar reflects real percentage
[ ] Each sent/failed event appears in live log within 2 seconds

Cron Trigger
[ ] GET /api/campaign/:id/trigger/:token starts campaign
[ ] Second trigger within 60s returns 429
[ ] Wrong token returns 404

Logging
[ ] /logs/app.log exists and contains startup events
[ ] /logs/campaign-{id}.log exists after campaign runs
[ ] Every send attempt (success or fail) is logged

Restart Recovery
[ ] Kill server with campaign running → restart → campaign resumes automatically
[ ] No messages are double-sent after restart
[ ] No contacts are skipped after restart
```

---

## 12. Error Handling Rules

Every service function must follow this pattern:

```javascript
// Wrap external calls (WA send, DB writes) in try/catch
// Log the error with context
// Return structured error up to route handler
// Route handler returns appropriate HTTP status

// Example:
async function sendMessage(phone, message) {
    try {
        await whatsappService.sendMessage(phone, message);
        return { success: true };
    } catch (err) {
        logger.error(`Send failed to ${phone}: ${err.message}`);
        return { success: false, error: err.message };
    }
}
```

**HTTP Status Codes to use:**

| Situation | Status |
|-----------|--------|
| Success | 200 / 201 |
| Bad input | 400 |
| Unauthorized (bad API key) | 401 |
| Not found | 404 |
| Conflict (already running) | 409 |
| Rate limited | 429 |
| WhatsApp not connected | 503 |
| Unexpected server error | 500 |

**Never expose stack traces in API responses.** Log them to file, return only `{ error: "message" }`.

---

## 13. PHP Integration Examples

```php
<?php

$BASE_URL = 'https://your-vps-domain.com';
$API_KEY  = 'your-secret-api-key';

function waRequest($method, $path, $body = null) {
    global $BASE_URL, $API_KEY;
    
    $ch = curl_init("$BASE_URL$path");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'X-API-Key: ' . $API_KEY,
        'Content-Type: application/json',
    ]);
    if ($body) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $code, 'body' => json_decode($res, true)];
}

// --- Create Campaign ---
$campaign = waRequest('POST', '/api/campaign', [
    'name'    => 'July Promo',
    'message' => 'Hi, check our offer!',
    'delay'   => 8,
]);
$campaignId = $campaign['body']['id'];
echo "Created campaign: $campaignId\n";

// --- Upload CSV ---
$ch = curl_init("$BASE_URL/api/campaign/$campaignId/upload-csv");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-API-Key: ' . $API_KEY]);
curl_setopt($ch, CURLOPT_POSTFIELDS, [
    'contacts' => new CURLFile('/path/to/contacts.csv', 'text/csv'),
]);
$uploadRes = json_decode(curl_exec($ch), true);
curl_close($ch);
echo "Imported: {$uploadRes['imported']} contacts\n";

// --- Start Campaign ---
$start = waRequest('POST', "/api/campaign/$campaignId/start");
echo "Status: {$start['body']['status']}\n";

// --- Check Campaign Status ---
$status = waRequest('GET', "/api/campaign/$campaignId");
$stats  = $status['body']['stats'];
echo "Sent: {$stats['sent']} / {$stats['total']}\n";

// --- Trigger via Cron URL ---
$token   = $campaign['body']['token'];
$trigger = file_get_contents("$BASE_URL/api/campaign/$campaignId/trigger/$token");
echo "Trigger response: $trigger\n";
```

---

## 14. Deployment Guide

### Server Setup (Ubuntu 22.04)

```bash
# 1. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install PM2 globally
sudo npm install -g pm2

# 3. Install Chromium (for whatsapp-web.js / puppeteer)
sudo apt-get install -y chromium-browser

# 4. Clone/upload app to /var/www/wa-app
cd /var/www/wa-app
npm install

# 5. Create .env file
cp .env.example .env
nano .env   # Fill in values (see Section 15)

# 6. Create required directories
mkdir -p sessions uploads logs data

# 7. Build React frontend
cd client && npm install && npm run build && cd ..

# 8. Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Run the output command to enable auto-start

# 9. Configure Nginx
sudo nano /etc/nginx/sites-available/wa-app
sudo ln -s /etc/nginx/sites-available/wa-app /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### PM2 Config (`ecosystem.config.js`)

```javascript
module.exports = {
    apps: [{
        name:         'wa-app',
        script:       'server.js',
        cwd:          '/var/www/wa-app',
        instances:    1,               // Single instance ONLY
        autorestart:  true,
        watch:        false,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production',
        }
    }]
};
```

### Nginx Config

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';   # Required for Socket.IO
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

> Add SSL with `certbot --nginx -d your-domain.com` after confirming HTTP works.

---

## 15. Environment Variables

```bash
# .env.example — copy to .env and fill in

# Server
PORT=3000
NODE_ENV=production

# Security
API_KEY=change_this_to_a_long_random_string_min_32_chars

# Paths (relative to app root)
SESSION_PATH=./sessions
DB_PATH=./data/db.sqlite
LOG_PATH=./logs
UPLOAD_PATH=./uploads

# WhatsApp
WA_HEADLESS=true
# Set to false only for local debugging to see Chromium window

# Campaign defaults
DEFAULT_DELAY=8
# Default seconds between messages if not specified in campaign
```

---

## Appendix: Key Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "whatsapp-web.js": "^1.23.0",
    "better-sqlite3": "^9.0.0",
    "socket.io": "^4.7.0",
    "node-cron": "^3.0.0",
    "multer": "^1.4.5",
    "csv-parse": "^5.5.0",
    "winston": "^3.11.0",
    "qrcode": "^1.5.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-router-dom": "^6.0.0",
    "axios": "^1.6.0",
    "socket.io-client": "^4.7.0",
    "qrcode.react": "^3.1.0",
    "tailwindcss": "^3.4.0"
  }
}
```

---

*PRD Version 1.0 — For AI agent use. Follow build order in Section 10. All constraints in Section 3 are non-negotiable.*
