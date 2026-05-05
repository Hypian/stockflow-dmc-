const fs = require('fs');
const path = 'app.js';

let content = fs.readFileSync(path, 'utf8');

const mappings = {
    'Ã¢â€ â‚¬': '─',
    'Ã¢â€¢Â': '═',
    'Ã¢â€ â€™': '→',
    'Ã¢â‚¬Â¢': '•',
    'Ã¢â‚¬Â¦': '…',
    'Ã¢â‚¬â€œ': '–',
    'Ã¢Ëœâ‚¬Ã¯Â¸Â': '☀️',
    'Ã°Å¸Å’â„¢': '🌙',
    'Ã‚Â·': '·',
    'Ã¢Å“â€œ': '✓',
    'Ã‚Â©': '©',
    'Ã¢â‚¬â€': '—',
    'Ã¢â‚¬Å“': '“',
    'Ã¢â‚¬Â': '”',
    'Ã¢â‚¬â„¢': '’',
    'Ã¢â€ ': '─',
    'Ã¢â€¢': '═',
    'Ã¢': '─' // Aggressive fallback for the common comment separators
};

for (const [key, value] of Object.entries(mappings)) {
    content = content.split(key).join(value);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Cleanup complete.');
