const fs = require('fs');
const path = 'app.js';

let content = fs.readFileSync(path, 'utf8');

// Global contrast fixes for light theme
const mappings = {
    'text-white': 'text-slate-900',
    'text-slate-400': 'text-slate-600',
    // We don't want to replace text-slate-500 blindly as it might be used correctly,
    // but the user complained about "users name" and "entries today".
};

for (const [key, value] of Object.entries(mappings)) {
    content = content.split(key).join(value);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Contrast cleanup complete.');
