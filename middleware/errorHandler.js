const logger = require('../utils/logger');

module.exports = (err, req, res, _next) => {
    logger.error(`Unhandled error: ${err.message}`, { stack: err.stack, path: req.originalUrl, method: req.method });
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
    });
};
