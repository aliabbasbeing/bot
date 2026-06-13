const config = require('../config');
const logger = require('../utils/logger');

module.exports = (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (!key || key !== config.apiKey) {
        logger.warn(`Auth failed for ${req.method} ${req.path}: key=${key ? 'present' : 'missing'}`);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};
