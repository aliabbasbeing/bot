function normalizePhone(raw) {
    if (!raw || typeof raw !== 'string') return null;

    let cleaned = raw.replace(/[\s\-\(\)\+]/g, '');

    if (!/^\d+$/.test(cleaned)) return null;

    if (cleaned.length < 10 || cleaned.length > 15) return null;

    return cleaned;
}

function validatePhone(phone) {
    const normalized = normalizePhone(phone);
    return normalized !== null;
}

module.exports = { normalizePhone, validatePhone };
