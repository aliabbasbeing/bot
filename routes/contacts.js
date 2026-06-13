const express = require('express');
const router = express.Router();
const multer = require('multer');
const config = require('../config');
const csvService = require('../services/csvService');
const db = require('../db/db');
const logger = require('../utils/logger');
const { normalizePhone } = require('../utils/phoneUtils');

const upload = multer({ dest: config.uploadPath });

// --- Bulk CSV upload ---
router.post('/:id/upload-csv', upload.single('contacts'), (req, res) => {
    const campaignId = parseInt(req.params.id, 10);
    if (!campaignId) {
        return res.status(400).json({ error: 'Invalid campaign ID' });
    }

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Use field name "contacts".' });
    }

    const result = csvService.parseCSV(req.file.path);

    const insert = db.prepare(
        'INSERT INTO contacts (campaign_id, phone, name, status) VALUES (?, ?, ?, ?)'
    );

    let imported = 0;

    const tx = db.transaction(() => {
        for (const contact of result.valid) {
            insert.run(campaignId, contact.phone, contact.name || null, 'pending');
            imported++;
        }
    });

    tx();

    logger.info(`CSV import for campaign ${campaignId}: ${imported} imported, 0 duplicates, ${result.invalid.length} invalid`);

    res.json({
        imported,
        skipped_duplicates: 0,
        skipped_invalid: result.invalid.length,
        invalid_samples: result.invalid.slice(0, 10),
    });
});

// --- Add single contact ---
router.post('/:id/contacts', (req, res) => {
    const campaignId = parseInt(req.params.id, 10);
    if (!campaignId) {
        return res.status(400).json({ error: 'Invalid campaign ID' });
    }

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }

    const { phone, name } = req.body;
    if (!phone) {
        return res.status(400).json({ error: 'Phone is required' });
    }

    const normalized = normalizePhone(phone);
    if (!normalized) {
        return res.status(400).json({ error: `Invalid phone number: ${phone}` });
    }

    const existing = db.prepare(
        'SELECT id FROM contacts WHERE campaign_id = ? AND phone = ?'
    ).get(campaignId, normalized);

    if (existing) {
        return res.status(409).json({ error: 'Contact with this phone already exists in this campaign' });
    }

    const result = db.prepare(
        'INSERT INTO contacts (campaign_id, phone, name, status) VALUES (?, ?, ?, ?)'
    ).run(campaignId, normalized, name || null, 'pending');

    const contact = db.prepare('SELECT id, phone, name, status, retries, sent_at, error FROM contacts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(contact);
});

// --- Edit single contact ---
router.put('/:id/contacts/:contactId', (req, res) => {
    const campaignId = parseInt(req.params.id, 10);
    const contactId = parseInt(req.params.contactId, 10);
    if (!campaignId || !contactId) {
        return res.status(400).json({ error: 'Invalid campaign or contact ID' });
    }

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND campaign_id = ?').get(contactId, campaignId);
    if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
    }

    const { phone, name } = req.body;
    if (!phone && name === undefined) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name || null;
    if (phone !== undefined) {
        const normalized = normalizePhone(phone);
        if (!normalized) {
            return res.status(400).json({ error: `Invalid phone number: ${phone}` });
        }
        updates.phone = normalized;
    }

    const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(contactId);
    db.prepare(`UPDATE contacts SET ${setClauses} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT id, phone, name, status, retries, sent_at, error FROM contacts WHERE id = ?').get(contactId);
    res.json(updated);
});

// --- Delete single contact ---
router.delete('/:id/contacts/:contactId', (req, res) => {
    const campaignId = parseInt(req.params.id, 10);
    const contactId = parseInt(req.params.contactId, 10);
    if (!campaignId || !contactId) {
        return res.status(400).json({ error: 'Invalid campaign or contact ID' });
    }

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND campaign_id = ?').get(contactId, campaignId);
    if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
    }

    db.prepare('DELETE FROM contacts WHERE id = ?').run(contactId);
    res.status(204).send();
});

// --- Delete multiple contacts (bulk) ---
router.post('/:id/contacts/bulk-delete', (req, res) => {
    const campaignId = parseInt(req.params.id, 10);
    if (!campaignId) {
        return res.status(400).json({ error: 'Invalid campaign ID' });
    }

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids array is required' });
    }

    const placeholders = ids.map(() => '?').join(', ');
    const result = db.prepare(
        `DELETE FROM contacts WHERE campaign_id = ? AND id IN (${placeholders})`
    ).run(campaignId, ...ids);

    res.json({ deleted: result.changes });
});

module.exports = router;
