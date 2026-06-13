const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const auth = require('../middleware/auth');
const db = require('../db/db');
const config = require('../config');
const logger = require('../utils/logger');
const { generateToken } = require('../utils/tokenUtils');

const triggerRateMap = new Map();

function getStats(campaignId) {
    const total = db.prepare('SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ?').get(campaignId).count;
    const sent = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = 'sent'").get(campaignId).count;
    const failed = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = 'failed'").get(campaignId).count;
    const pending = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = 'pending'").get(campaignId).count;
    return { total, sent, failed, pending };
}

// --- Public trigger endpoint (no auth, uses token) ---
router.use('/:id/trigger/:token', (req, res, next) => {
    const { id, token } = req.params;
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    if (!campaign || campaign.token !== token) {
        return res.status(404).json({ error: 'Campaign not found or token mismatch' });
    }
    const now = Date.now();
    const lastTrigger = triggerRateMap.get(id) || 0;
    if (now - lastTrigger < 60000) {
        return res.status(429).json({ error: 'Rate limit exceeded. Try again in 60 seconds.' });
    }
    triggerRateMap.set(id, now);
    req.campaign = campaign;
    next();
});

router.get('/:id/trigger/:token', async (req, res) => {
    const io = req.app.get('io');
    const campaignService = require('../services/campaignService');

    if (req.campaign.send_mode === 'interval') {
        // Legacy mode: trigger = start the whole campaign
        if (req.campaign.status === 'running') {
            return res.json({ message: 'Campaign already running', status: 'running' });
        }
        if (req.campaign.status === 'draft' || req.campaign.status === 'paused') {
            campaignService.startCampaign(req.campaign.id, io);
            return res.json({ message: 'Campaign triggered', status: 'running' });
        }
        return res.status(400).json({ error: `Cannot trigger campaign with status: ${req.campaign.status}` });
    }

    // Cron mode: trigger = send 1 message
    const result = await campaignService.triggerCronSend(req.campaign.id, io);
    res.json(result);
});

// --- Auth-protected routes ---
router.use(auth);

router.get('/', (req, res) => {
    const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
    const result = campaigns.map((c) => ({
        ...c,
        stats: getStats(c.id),
    }));
    res.json(result);
});

router.get('/:id', (req, res) => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json({
        ...campaign,
        stats: getStats(campaign.id),
    });
});

router.get('/:id/contacts', (req, res) => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const contacts = db.prepare(
        'SELECT id, phone, name, status, retries, sent_at, error FROM contacts WHERE campaign_id = ? ORDER BY id ASC LIMIT ? OFFSET ?'
    ).all(campaign.id, limit, offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ?').get(campaign.id).count;
    res.json({ contacts, total, page, limit, pages: Math.ceil(total / limit) });
});

router.get('/:id/export', (req, res) => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    const contacts = db.prepare(
        'SELECT phone, name, status, retries, sent_at, error FROM contacts WHERE campaign_id = ? ORDER BY id ASC'
    ).all(campaign.id);
    const header = 'phone,name,status,retries,sent_at,error\n';
    const rows = contacts.map((c) => {
        const esc = (v) => (v || '').replace(/"/g, '""');
        return `"${esc(c.phone)}","${esc(c.name)}","${esc(c.status)}",${c.retries},"${esc(c.sent_at || '')}","${esc(c.error || '')}"`;
    }).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${campaign.id}-export.csv"`);
    res.send(header + rows);
});

router.post('/', (req, res) => {
    const { name, message, delay, delay_unit, send_mode } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Campaign name is required' });
    }
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Campaign message is required' });
    }
    const token = generateToken();
    const result = db.prepare(
        'INSERT INTO campaigns (name, message, delay, delay_unit, send_mode, token) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name.trim(), message.trim(), delay || 5, delay_unit || 'seconds', send_mode || 'interval', token);
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({
        ...campaign,
        stats: { total: 0, sent: 0, failed: 0, pending: 0 },
    });
});

router.put('/:id', (req, res) => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    const { name, message, delay, delay_unit, send_mode } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (message !== undefined) updates.message = message.trim();
    if (delay !== undefined) updates.delay = delay;
    if (delay_unit !== undefined) updates.delay_unit = delay_unit;
    if (send_mode !== undefined) updates.send_mode = send_mode;
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }
    const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(campaign.id);
    db.prepare(`UPDATE campaigns SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaign.id);
    res.json({ ...updated, stats: getStats(campaign.id) });
});

router.post('/:id/duplicate', (req, res) => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    const token = generateToken();
    const result = db.prepare(
        'INSERT INTO campaigns (name, message, delay, delay_unit, send_mode, token) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(`${campaign.name} (copy)`, campaign.message, campaign.delay, campaign.delay_unit, campaign.send_mode, token);
    const dup = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...dup, stats: { total: 0, sent: 0, failed: 0, pending: 0 } });
});

router.post('/:id/start', (req, res) => {
    const io = req.app.get('io');
    const campaignService = require('../services/campaignService');
    const whatsappService = require('../services/whatsappService');

    if (whatsappService.getStatus() !== 'connected') {
        return res.status(503).json({ error: 'WhatsApp not connected' });
    }

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    if (campaign.status === 'running') {
        return res.status(409).json({ error: 'Campaign already running' });
    }
    if (campaign.send_mode === 'cron') {
        return res.status(400).json({ error: 'Cron campaigns cannot be started. Use the trigger URL to send one message at a time.' });
    }

    const pendingCount = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = 'pending'").get(campaign.id).count;
    if (pendingCount === 0) {
        return res.status(400).json({ error: 'No pending contacts to send to' });
    }

    campaignService.startCampaign(campaign.id, io);
    res.json({ message: 'Campaign started', status: 'running' });
});

router.post('/:id/pause', (req, res) => {
    const io = req.app.get('io');
    const campaignService = require('../services/campaignService');

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    if (campaign.status !== 'running') {
        return res.status(400).json({ error: 'Campaign is not running' });
    }

    campaignService.pauseCampaign(campaign.id, io);
    res.json({ message: 'Campaign paused', status: 'paused' });
});

router.post('/:id/resume', (req, res) => {
    const io = req.app.get('io');
    const campaignService = require('../services/campaignService');
    const whatsappService = require('../services/whatsappService');

    if (whatsappService.getStatus() !== 'connected') {
        return res.status(503).json({ error: 'WhatsApp not connected' });
    }

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    if (campaign.status !== 'paused') {
        return res.status(400).json({ error: 'Campaign is not paused' });
    }

    campaignService.resumeCampaign(campaign.id, io);
    res.json({ message: 'Campaign resumed', status: 'running' });
});

router.post('/:id/stop', (req, res) => {
    const io = req.app.get('io');
    const campaignService = require('../services/campaignService');

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }

    campaignService.stopCampaign(campaign.id, io);
    res.json({ message: 'Campaign stopped' });
});

router.post('/:id/retry', (req, res) => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    const result = db.prepare(
        "UPDATE contacts SET status = 'pending', retries = 0, error = NULL WHERE campaign_id = ? AND status = 'failed'"
    ).run(campaign.id);
    db.prepare("UPDATE campaigns SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaign.id);
    logger.info(`Retried ${result.changes} failed contacts for campaign ${campaign.id}`);
    res.json({ retried: result.changes });
});

router.delete('/:id', (req, res) => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    if (!['draft', 'completed', 'failed'].includes(campaign.status)) {
        return res.status(400).json({ error: `Cannot delete campaign with status: ${campaign.status}` });
    }

    db.prepare('DELETE FROM logs WHERE campaign_id = ?').run(campaign.id);
    db.prepare('DELETE FROM contacts WHERE campaign_id = ?').run(campaign.id);
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaign.id);

    res.status(204).send();
});

router.post('/:id/token/regenerate', (req, res) => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    const newToken = generateToken();
    db.prepare('UPDATE campaigns SET token = ? WHERE id = ?').run(newToken, campaign.id);
    res.json({ token: newToken });
});

router.get('/:id/logs', (req, res) => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    const logPath = path.join(config.logPath, `campaign-${req.params.id}.log`);
    try {
        if (!fs.existsSync(logPath)) {
            return res.json([]);
        }
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean).slice(-200);
        res.json(lines.map((line) => {
            const match = line.match(/\[(.*?)\] (SENT|FAILED|.*?): (.*)/);
            if (match) {
                return {
                    timestamp: match[1],
                    event: match[2].toLowerCase(),
                    message: match[3],
                };
            }
            return { timestamp: '', event: 'info', message: line };
        }));
    } catch (err) {
        logger.error(`Failed to read campaign log: ${err.message}`);
        res.json([]);
    }
});

router.get('/logs/app', (req, res) => {
    const logPath = path.join(config.logPath, 'app.log');
    try {
        if (!fs.existsSync(logPath)) {
            return res.json([]);
        }
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean).slice(-200);
        res.json(lines);
    } catch (err) {
        logger.error(`Failed to read app log: ${err.message}`);
        res.json([]);
    }
});

module.exports = router;
