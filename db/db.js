const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migrations
try {
    db.exec("ALTER TABLE campaigns ADD COLUMN send_mode TEXT NOT NULL DEFAULT 'interval'");
} catch (_) {} // already exists
try {
    db.exec("ALTER TABLE campaigns ADD COLUMN delay_unit TEXT NOT NULL DEFAULT 'seconds'");
} catch (_) {} // already exists

logger.info('Database initialized successfully');

module.exports = db;
