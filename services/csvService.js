const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { normalizePhone } = require('../utils/phoneUtils');
const logger = require('../utils/logger');

function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const valid = [];
    const invalid = [];

    let records;
    try {
        records = parse(content, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
        });
    } catch (err) {
        logger.error(`CSV parse error: ${err.message}`);
        return { valid: [], invalid: ['Failed to parse CSV: ' + err.message] };
    } finally {
        fs.unlink(filePath, () => {});
    }

    for (const row of records) {
        const phoneRaw = row.phone || row.Phone || row.PHONE || row.phone_number || '';
        const phone = normalizePhone(phoneRaw);

        if (!phone) {
            const trimmed = phoneRaw.trim();
            const reason = /^[\d.]+[eE][+-]?\d+$/.test(trimmed.replace(/[\s\-\(\)\+]/g, ''))
                ? `${trimmed} — Excel scientific notation, re-export with column formatted as Text`
                : trimmed || '(empty)';
            invalid.push(reason);
            continue;
        }

        valid.push({
            phone,
            name: row.name || row.Name || row.NAME || row.full_name || '',
        });
    }

    logger.info(`CSV parsed: ${valid.length} valid, ${invalid.length} invalid`);
    return { valid, invalid };
}

module.exports = { parseCSV };
