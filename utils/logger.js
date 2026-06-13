const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

if (!fs.existsSync(config.logPath)) {
    fs.mkdirSync(config.logPath, { recursive: true });
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
        })
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(config.logPath, 'app.log'),
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: 'HH:mm:ss' }),
                winston.format.printf(({ timestamp, level, message }) =>
                    `[${timestamp}] ${level}: ${message}`
                )
            ),
        }),
    ],
});

module.exports = logger;
