const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

let status = 'disconnected';
let client = null;
let ioInstance = null;
let readyFired = false;
let authHandled = false;
let reinitQueued = false;
let readyTimeout = null;

const SESSION_DIR = path.join(config.sessionPath, 'session');

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function sessionExists() {
    try {
        return require('fs').existsSync(SESSION_DIR);
    } catch (_) {
        return false;
    }
}

async function destroyClient() {
    const c = client;
    client = null;
    readyFired = false;
    authHandled = false;
    status = 'disconnected';
    if (c) {
        c.removeAllListeners();
        try { await c.destroy(); } catch (_) {}
        await sleep(3000);
    }
}

async function safeDestroyAndClearSession() {
    await destroyClient();
    for (let i = 0; i < 5; i++) {
        try {
            await fs.rm(SESSION_DIR, { recursive: true, force: true });
            logger.info('Session data cleared');
            break;
        } catch (e) {
            if (i === 4) {
                logger.error(`Session clear failed after 5 attempts: ${e.message}`);
            } else {
                logger.warn(`Session files busy, retrying (${i + 1}/5)...`);
                await sleep(1000);
            }
        }
    }
}

async function reinitializeClient(forceFresh) {
    if (reinitQueued) return;
    reinitQueued = true;
    logger.info(`Re-initializing client (forceFresh=${forceFresh})...`);
    await destroyClient();
    await init(ioInstance, forceFresh);
    reinitQueued = false;
}

async function init(io, forceFresh = false) {
    ioInstance = io;
    status = 'connecting';
    readyFired = false;
    authHandled = false;
    clearTimeout(readyTimeout);

    await destroyClient();

    if (forceFresh) {
        try {
            require('fs').rmSync(SESSION_DIR, { recursive: true, force: true });
            logger.info('Session cleared (forceFresh)');
        } catch (_) {}
    }

    logger.info('Initializing WhatsApp client...');

    try {
        client = new Client({
            authStrategy: new LocalAuth({ dataPath: config.sessionPath }),
            puppeteer: {
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--single-process',
                    '--no-zygote',
                ],
                headless: true,
            },
        });
    } catch (err) {
        status = 'disconnected';
        logger.error(`Failed to create WhatsApp client: ${err.message}`);
        return;
    }

    client.once('qr', async (qr) => {
        status = 'connecting';
        readyFired = false;
        logger.info('QR code received from WA');

        const credsPath = path.join(SESSION_DIR, 'Default', 'CREDENTIALS');
        const hasCredentials = require('fs').existsSync(credsPath);

        if (hasCredentials) {
            logger.info('QR emitted with existing CREDENTIALS — corrupt session, wiping');
            io.emit('whatsapp:qr', await qrcode.toDataURL(qr, { width: 400, margin: 2 }).catch(() => qr));
            await safeDestroyAndClearSession();
            await init(ioInstance, true);
            return;
        }

        try {
            const qrImage = await qrcode.toDataURL(qr, { width: 400, margin: 2 });
            io.emit('whatsapp:qr', qrImage);
            logger.info('QR image sent to frontend (clean session)');
        } catch (err) {
            logger.error(`Failed to generate QR image: ${err.message}`);
            io.emit('whatsapp:qr', qr);
        }
    });

    client.on('authenticated', () => {
        if (authHandled) return;
        authHandled = true;
        logger.info('WhatsApp session authenticated');
        clearTimeout(readyTimeout);
        readyTimeout = setTimeout(async () => {
            if (status === 'connected') return;
            logger.warn('Ready not received 30s after auth — restarting with saved session');
            await init(ioInstance, false);
        }, 30000);
    });

    client.on('ready', () => {
        if (readyFired) return;
        readyFired = true;
        status = 'connected';
        clearTimeout(readyTimeout);
        logger.info('WhatsApp connected and ready');
        io.emit('whatsapp:status', 'connected');
    });

    client.on('auth_failure', (msg) => {
        if (status === 'disconnected') return;
        status = 'disconnected';
        readyFired = false;
        authHandled = false;
        clearTimeout(readyTimeout);
        logger.error(`WhatsApp auth failure: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
        io.emit('whatsapp:status', 'disconnected');
        destroyClient();
    });

    client.on('disconnected', (reason) => {
        if (status === 'disconnected') return;
        status = 'disconnected';
        readyFired = false;
        authHandled = false;
        clearTimeout(readyTimeout);
        logger.warn(`WhatsApp disconnected: ${reason}`);
        io.emit('whatsapp:status', 'disconnected');

        if (reason === 'LOGOUT') {
            logger.info('LOGOUT — clearing session');
            safeDestroyAndClearSession().then(() => init(ioInstance, true).catch(e => logger.error(`LOGOUT reinit failed: ${e.message}`)));
            return;
        }

        destroyClient();
        logger.info('Auto-reconnect in 5s...');
        setTimeout(() => {
            if (!client && ioInstance) init(ioInstance, true).catch(e => logger.error(`Reconnect init failed: ${e.message}`));
        }, 5000);
    });

    client.on('loading_screen', (percent, message) => {
        if (percent === 100) return;
        logger.info(`WA loading: ${percent}% - ${message}`);
    });

    logger.info('Starting WhatsApp client...');
    client.initialize().then(() => {
        logger.info('Client initialize() completed');
    }).catch((err) => {
        if (status === 'disconnected') return;
        status = 'disconnected';
        readyFired = false;
        authHandled = false;
        clearTimeout(readyTimeout);
        logger.error(`Client initialize() failed: ${err.message}`);
        io.emit('whatsapp:status', 'disconnected');
        destroyClient();
    });
}

async function sendMessage(phone, message) {
    if (!client || status !== 'connected') throw new Error('WhatsApp not connected');
    const { normalizePhone } = require('../utils/phoneUtils');
    const normalized = phone.includes('@c.us') ? phone.split('@')[0] : phone;
    const clean = normalizePhone(normalized);
    if (!clean) throw new Error(`Invalid phone: ${phone}`);
    const chatId = `${clean}@c.us`;
    return client.sendMessage(chatId, message);
}

function getStatus() { return status; }
function getClient() { return client; }

module.exports = { init, sendMessage, getStatus, getClient, sessionExists };
