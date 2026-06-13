require('dotenv').config();
const path = require('path');

const config = {
    port: parseInt(process.env.PORT, 10) || 4000,
    nodeEnv: process.env.NODE_ENV || 'development',
    apiKey: process.env.API_KEY || 'default-dev-key',
    sessionPath: path.resolve(process.env.SESSION_PATH || './sessions'),
    dbPath: path.resolve(process.env.DB_PATH || './data/db.sqlite'),
    logPath: path.resolve(process.env.LOG_PATH || './logs'),
    uploadPath: path.resolve(process.env.UPLOAD_PATH || './uploads'),
    waHeadless: process.env.WA_HEADLESS !== 'false',
    chromePath: process.env.CHROME_PATH || '',
    defaultDelay: parseInt(process.env.DEFAULT_DELAY, 10) || 8,
};

module.exports = config;
