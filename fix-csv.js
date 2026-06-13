const fs = require('fs');
const { parse } = require('csv-parse/sync');

const inputPath = process.argv[2];
if (!inputPath) {
    console.error('Usage: node fix-csv.js <input.csv> [output.csv]');
    process.exit(1);
}

const outputPath = process.argv[3] || inputPath.replace('.csv', '_fixed.csv');
const content = fs.readFileSync(inputPath, 'utf8');

const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
});

function normalize(phone) {
    if (!phone) return '';
    let cleaned = phone.trim().replace(/[\s]/g, '');
    if (/^[\d.]+[eE][+-]?\d+$/.test(cleaned.replace(/^\+/, ''))) return '';
    cleaned = cleaned.replace(/[^\d]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('00')) cleaned = cleaned.replace(/^00+/, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.slice(1);
    if (cleaned.length < 11) cleaned = '92' + cleaned;
    if (cleaned.length < 10 || cleaned.length > 15) return '';
    return '+' + cleaned;
}

const phoneKey = Object.keys(records[0] || {}).find(k => k.toLowerCase().includes('phone'));
if (!phoneKey) {
    console.error('No phone column found in CSV');
    process.exit(1);
}

const keys = Object.keys(records[0]);
const outLines = [keys.join(',')];
let valid = 0, invalid = 0;

for (const r of records) {
    const norm = normalize(r[phoneKey]);
    if (!norm) { invalid++; continue; }
    r[phoneKey] = norm;
    valid++;
    const vals = keys.map(k => {
        const v = r[k] || '';
        return /[,"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    });
    outLines.push(vals.join(','));
}

fs.writeFileSync(outputPath, outLines.join('\n'));
console.log(`Processed: ${valid} valid, ${invalid} invalid → ${outputPath}`);
