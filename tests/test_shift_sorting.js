const assert = require('assert');

function getEntrySortKey(e) {
  if (!e) return '';
  const dateStr = e.date || e.entry_date || '';
  const timeStr = e.time || e.entry_time || '00:00:00';
  const shift = (e.shift || '').trim().toLowerCase();

  const parts = timeStr.split(':');
  let hours = parseInt(parts[0] || '0', 10);
  let mins = parseInt(parts[1] || '0', 10);
  let secs = parseInt(parts[2] || '0', 10);

  const shiftRank = shift === 'night' ? 2 : 1;

  let adjustedHours = hours;
  if (shift === 'night' && hours < 10) {
    adjustedHours += 24;
  }

  const pad = (n) => String(n).padStart(2, '0');
  return `${dateStr}_${shiftRank}_${pad(adjustedHours)}:${pad(mins)}:${pad(secs)}`;
}

function compareEntriesDesc(a, b) {
  const keyA = getEntrySortKey(a);
  const keyB = getEntrySortKey(b);
  if (keyA !== keyB) {
    return keyB.localeCompare(keyA);
  }
  const timeA = new Date(a.created_at || a.createdAt || 0).getTime();
  const timeB = new Date(b.created_at || b.createdAt || 0).getTime();
  return timeB - timeA;
}

// Test 1: User's reported scenario
// John: Morning shift at 16:54:54 on 2026-08-10
// David: Night shift at 07:56:44 on 2026-08-10
const johnMorning = {
  userName: 'John Rwamanywa',
  date: '2026-08-10',
  time: '16:54:54',
  shift: 'morning',
  closing: 0
};

const davidNight = {
  userName: 'Binama David',
  date: '2026-08-10',
  time: '07:56:44',
  shift: 'night',
  closing: 4
};

const johnNextDay = {
  userName: 'John Rwamanywa',
  date: '2026-08-11',
  time: '17:03:39',
  shift: 'morning',
  closing: 2
};

const entries = [johnMorning, davidNight, johnNextDay];
entries.sort(compareEntriesDesc);

console.log('Sorted Order:');
entries.forEach(e => console.log(`- ${e.date} ${e.time} (${e.shift}): ${e.userName} -> Closing: ${e.closing}`));

// Verification 1: Most recent overall is Aug 11 Morning (John)
assert.strictEqual(entries[0].userName, 'John Rwamanywa');
assert.strictEqual(entries[0].date, '2026-08-11');

// Verification 2: Most recent on 2026-08-10 is Binama David (Night shift)
assert.strictEqual(entries[1].userName, 'Binama David');
assert.strictEqual(entries[1].date, '2026-08-10');
assert.strictEqual(entries[1].shift, 'night');

// Verification 3: John (Morning shift) comes after David (Night shift) on 2026-08-10
assert.strictEqual(entries[2].userName, 'John Rwamanywa');
assert.strictEqual(entries[2].date, '2026-08-10');
assert.strictEqual(entries[2].shift, 'morning');

// Test 2: Overnight time order within Night shift
const nightEvening = { date: '2026-08-10', time: '22:00:00', shift: 'night', userName: 'Night Evening' };
const nightMorning = { date: '2026-08-10', time: '07:30:00', shift: 'night', userName: 'Night Morning' };
const nightEntries = [nightEvening, nightMorning];
nightEntries.sort(compareEntriesDesc);

assert.strictEqual(nightEntries[0].userName, 'Night Morning');
assert.strictEqual(nightEntries[1].userName, 'Night Evening');

console.log('\nAll test assertions passed successfully!');
