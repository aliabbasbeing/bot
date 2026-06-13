const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const whatsappService = require('../services/whatsappService');

router.post('/connect', async (req, res) => {
    logger.info('POST /api/whatsapp/connect called');
    const currentStatus = whatsappService.getStatus();

    if (currentStatus === 'connected') {
        return res.json({ message: 'Already connected', status: 'connected' });
    }

    const io = req.app.get('io');

    if (currentStatus === 'connecting') {
        logger.info('Already connecting, not re-initializing');
        return res.json({ message: 'Connection already in progress' });
    }

    await whatsappService.init(io, true);
    res.json({ message: 'QR generation initiated' });
});

router.get('/status', (req, res) => {
    const st = whatsappService.getStatus();
    logger.info(`GET /api/whatsapp/status → ${st}`);
    res.json({ status: st });
});

router.post('/send-test', async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) {
        return res.status(400).json({ error: 'Phone and message are required' });
    }
    try {
        const { normalizePhone } = require('../utils/phoneUtils');
        const normalized = normalizePhone(phone);
        if (!normalized) {
            return res.status(400).json({ error: `Invalid phone number: ${phone}` });
        }
        const result = await whatsappService.sendMessage(normalized, message);
        logger.info(`Test message sent to ${normalized}`);
        res.json({ success: true, id: result.id._serialized });
    } catch (err) {
        const msg = typeof err === 'object' && err ? (err.message || JSON.stringify(err)) : String(err);
        logger.error(`Test message failed: ${msg}`);
        res.status(500).json({ error: msg });
    }
});

module.exports = router;
