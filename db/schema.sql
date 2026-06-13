CREATE TABLE IF NOT EXISTS campaigns (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    message     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'draft',
    delay       INTEGER NOT NULL DEFAULT 5,
    delay_unit  TEXT NOT NULL DEFAULT 'seconds',
    send_mode   TEXT NOT NULL DEFAULT 'interval',
    token       TEXT UNIQUE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    phone       TEXT NOT NULL,
    name        TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
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
    message     TEXT,
    timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_campaign_status
    ON contacts(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_logs_campaign
    ON logs(campaign_id);
