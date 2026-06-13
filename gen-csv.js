const fs = require('fs');
const phone = process.argv[2] || '+923483469617';
const count = parseInt(process.argv[3], 10) || 10;
const lines = ['phone,name'];
for (let i = 1; i <= count; i++) {
    lines.push(`${phone},Test ${i}`);
}
fs.writeFileSync('contacts.csv', lines.join('\n'));
console.log(`Created contacts.csv with ${count} entries for ${phone}`);
