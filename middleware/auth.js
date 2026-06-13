const config = require('../config');

module.exports = (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (!key || key !== config.apiKey) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};
