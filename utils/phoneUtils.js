function normalizePhone(raw) {
    if (!raw || typeof raw !== 'string') return null;

    let cleaned = raw.trim();

    const stripped = cleaned.replace(/[\s\-\(\)\+]/g, '');
    if (/^[\d.]+[eE][+-]?\d+$/.test(stripped)) {
        return null;
    }

    cleaned = cleaned.replace(/[^\d]/g, '');

    if (cleaned.startsWith('00')) {
        cleaned = cleaned.replace(/^00+/, '');
    }

    if (cleaned.startsWith('0')) {
        cleaned = '92' + cleaned.slice(1);
    }

    if (cleaned.length < 11) {
        cleaned = '92' + cleaned;
    }

    if (!/^\d+$/.test(cleaned)) return null;

    if (cleaned.length < 10 || cleaned.length > 15) return null;

    return cleaned;
}

function validatePhone(phone) {
    const normalized = normalizePhone(phone);
    return normalized !== null;
}

module.exports = { normalizePhone, validatePhone };
