const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./db/db');
const auth = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

process.on('uncaughtException', (err) => {
    const msg = err?.message || String(err);
    if (msg.includes('detached Frame') || msg.includes('Target closed')) return;
    logger.error(`Uncaught exception: ${msg}`);
});
process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    if (msg.includes('detached Frame') || msg.includes('Target closed')) return;
    logger.error(`Unhandled rejection: ${msg}`);
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

app.set('io', io);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/whatsapp', auth, require('./routes/whatsapp'));
app.use('/api/campaign', require('./routes/campaign'));
app.use('/api/campaign', auth, require('./routes/contacts'));

const clientDistPath = path.join(__dirname, 'client', 'dist');

function serveIndexHtml(res) {
    const indexPath = path.join(clientDistPath, 'index.html');
    if (!fs.existsSync(indexPath)) {
        return res.status(404).send('Frontend not built. Run: cd client && npm run build');
    }
    let html = fs.readFileSync(indexPath, 'utf8');
    html = html.replace(
        '</head>',
        `<script>window.__API_KEY__ = ${JSON.stringify(config.apiKey)}</script></head>`
    );
    res.type('html').send(html);
}

app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
    }
    const filePath = path.join(clientDistPath, req.path === '/' ? 'index.html' : req.path);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        if (req.path === '/' || req.path === '/index.html') {
            return serveIndexHtml(res);
        }
        return res.sendFile(filePath);
    }
    serveIndexHtml(res);
});

io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    socket.on('join', (room) => {
        socket.join(room);
        logger.info(`Socket ${socket.id} joined room: ${room}`);
    });
    socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`);
    });
});

app.use(errorHandler);

server.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);

    const campaignService = require('./services/campaignService');
    campaignService.resumeOnBoot(io);

    const whatsappService = require('./services/whatsappService');
    if (whatsappService.sessionExists()) {
        logger.info('WhatsApp session found — auto-connecting...');
        whatsappService.init(io).catch(e => logger.error(`Auto-init failed: ${e.message}`));
    } else {
        logger.info('No WhatsApp session found — waiting for user to connect');
    }
});

module.exports = { app, server, io };
