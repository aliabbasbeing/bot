const db = require('../db/db');
const logger = require('../utils/logger');
const whatsappService = require('./whatsappService');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const activeCampaigns = new Map();

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCampaignLogPath(campaignId) {
    return path.join(config.logPath, `campaign-${campaignId}.log`);
}

function logToFile(campaignId, message) {
    const logPath = getCampaignLogPath(campaignId);
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
}

function getStats(campaignId) {
    const total = db.prepare('SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ?').get(campaignId).count;
    const sent = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = 'sent'").get(campaignId).count;
    const failed = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = 'failed'").get(campaignId).count;
    const pending = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND status = 'pending'").get(campaignId).count;
    return { total, sent, failed, pending };
}

function getDelayMs(campaign) {
    const seconds = campaign.delay_unit === 'minutes' ? (campaign.delay || 5) * 60 : (campaign.delay || 5);
    return seconds * 1000;
}

async function sendOne(campaign, contact) {
    let success = false;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const message = campaign.message.replace(/\{\{name\}\}/g, contact.name || '');
            await whatsappService.sendMessage(contact.phone, message);
            success = true;
            break;
        } catch (err) {
            lastError = err.message;
            logger.warn(`Send attempt ${attempt}/3 failed for ${contact.phone}: ${err.message}`);
            db.prepare('UPDATE contacts SET retries = retries + 1 WHERE id = ?').run(contact.id);
            if (attempt < 3) {
                await sleep(2000);
            }
        }
    }
    return { success, lastError };
}

async function triggerCronSend(campaignId, io) {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) return { sent: false, error: 'Campaign not found' };

    const contact = db.prepare(
        "SELECT * FROM contacts WHERE campaign_id = ? AND status = 'pending' ORDER BY id ASC LIMIT 1"
    ).get(campaignId);

    if (!contact) {
        db.prepare("UPDATE campaigns SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
        io.to(`campaign-${campaignId}`).emit('campaign:complete', { stats: getStats(campaignId) });
        return { sent: false, error: 'No pending contacts' };
    }

    const { success, lastError } = await sendOne(campaign, contact);

    if (success) {
        db.prepare(
            "UPDATE contacts SET status = 'sent', sent_at = CURRENT_TIMESTAMP, error = NULL WHERE id = ?"
        ).run(contact.id);
        logToFile(campaignId, `SENT to ${contact.phone}`);
        db.prepare(
            'INSERT INTO logs (campaign_id, phone, event, message) VALUES (?, ?, ?, ?)'
        ).run(campaignId, contact.phone, 'sent', 'Sent successfully');
    } else {
        db.prepare(
            "UPDATE contacts SET status = 'failed', error = ? WHERE id = ?"
        ).run(lastError, contact.id);
        logToFile(campaignId, `FAILED to ${contact.phone}: ${lastError}`);
        db.prepare(
            'INSERT INTO logs (campaign_id, phone, event, message) VALUES (?, ?, ?, ?)'
        ).run(campaignId, contact.phone, 'failed', lastError);
    }

    const stats = getStats(campaignId);
    io.to(`campaign-${campaignId}`).emit('campaign:progress', stats);

    if (stats.pending === 0) {
        db.prepare("UPDATE campaigns SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
        io.to(`campaign-${campaignId}`).emit('campaign:complete', { stats });
    }

    return { sent: success, error: success ? undefined : lastError };
}

async function runCampaign(campaignId, io) {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) return;

    const contacts = db.prepare(
        "SELECT * FROM contacts WHERE campaign_id = ? AND status = 'pending' ORDER BY id ASC"
    ).all(campaignId);

    if (contacts.length === 0) {
        db.prepare("UPDATE campaigns SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
        logger.info(`Campaign ${campaignId} completed (no pending contacts)`);
        logToFile(campaignId, 'Campaign completed (no pending contacts)');
        io.to(`campaign-${campaignId}`).emit('campaign:complete', { stats: getStats(campaignId) });
        activeCampaigns.delete(campaignId);
        return;
    }

    activeCampaigns.set(campaignId, { running: true, paused: false, stopped: false });
    db.prepare("UPDATE campaigns SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);

    logger.info(`Campaign ${campaignId} started with ${contacts.length} contacts`);
    logToFile(campaignId, `Campaign started with ${contacts.length} contacts`);

    for (const contact of contacts) {
        const state = activeCampaigns.get(campaignId);
        if (!state || state.stopped) {
            logger.info(`Campaign ${campaignId} stopped manually`);
            logToFile(campaignId, 'Campaign stopped manually');
            activeCampaigns.delete(campaignId);
            return;
        }

        if (state.paused) {
            db.prepare("UPDATE campaigns SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
            logger.info(`Campaign ${campaignId} paused`);
            logToFile(campaignId, 'Campaign paused');
            io.to(`campaign-${campaignId}`).emit('campaign:paused', { stats: getStats(campaignId) });
            return;
        }

        const { success, lastError } = await sendOne(campaign, contact);

        if (success) {
            db.prepare(
                "UPDATE contacts SET status = 'sent', sent_at = CURRENT_TIMESTAMP, error = NULL WHERE id = ?"
            ).run(contact.id);
            logger.info(`Sent to ${contact.phone}`);
            logToFile(campaignId, `SENT to ${contact.phone}`);
            db.prepare(
                'INSERT INTO logs (campaign_id, phone, event, message) VALUES (?, ?, ?, ?)'
            ).run(campaignId, contact.phone, 'sent', 'Sent successfully');
        } else {
            db.prepare(
                "UPDATE contacts SET status = 'failed', error = ? WHERE id = ?"
            ).run(lastError, contact.id);
            logger.error(`Failed to send to ${contact.phone}: ${lastError}`);
            logToFile(campaignId, `FAILED to ${contact.phone}: ${lastError}`);
            db.prepare(
                'INSERT INTO logs (campaign_id, phone, event, message) VALUES (?, ?, ?, ?)'
            ).run(campaignId, contact.phone, 'failed', lastError);
        }

        const stats = getStats(campaignId);
        io.to(`campaign-${campaignId}`).emit('campaign:progress', stats);

        const jitter = Math.random() * 3000;
        await sleep(getDelayMs(campaign) + jitter);
    }

    const state = activeCampaigns.get(campaignId);
    if (state && !state.paused && !state.stopped) {
        db.prepare("UPDATE campaigns SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
        logger.info(`Campaign ${campaignId} completed`);
        logToFile(campaignId, 'Campaign completed');
        io.to(`campaign-${campaignId}`).emit('campaign:complete', { stats: getStats(campaignId) });
        activeCampaigns.delete(campaignId);
    }
}

function startCampaign(campaignId, io) {
    if (activeCampaigns.has(campaignId)) {
        const state = activeCampaigns.get(campaignId);
        if (state && state.running && !state.paused) {
            logger.warn(`Campaign ${campaignId} is already running`);
            return;
        }
    }

    runCampaign(campaignId, io);
}

function pauseCampaign(campaignId, io) {
    const state = activeCampaigns.get(campaignId);
    if (state) {
        state.paused = true;
    } else {
        db.prepare("UPDATE campaigns SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
        io.to(`campaign-${campaignId}`).emit('campaign:paused', { stats: getStats(campaignId) });
    }
}

function resumeCampaign(campaignId, io) {
    const state = activeCampaigns.get(campaignId);
    if (state) {
        state.paused = false;
        runCampaign(campaignId, io);
    } else {
        runCampaign(campaignId, io);
    }
}

function stopCampaign(campaignId, io) {
    const state = activeCampaigns.get(campaignId);
    if (state) {
        state.stopped = true;
        state.running = false;
    }
    db.prepare("UPDATE campaigns SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
    io.to(`campaign-${campaignId}`).emit('campaign:stopped', { stats: getStats(campaignId) });
    activeCampaigns.delete(campaignId);
}

async function resumeOnBoot(io) {
    const running = db.prepare("SELECT id FROM campaigns WHERE status = 'running'").all();

    for (const campaign of running) {
        logger.info(`Resuming campaign ${campaign.id} after restart`);
        logToFile(campaign.id, 'Campaign resumed after server restart');
        runCampaign(campaign.id, io);
    }

    if (running.length === 0) {
        logger.info('No campaigns to resume on boot');
    }
}

module.exports = {
    startCampaign,
    pauseCampaign,
    resumeCampaign,
    stopCampaign,
    resumeOnBoot,
    getStats,
    triggerCronSend,
    getDelayMs,
};
