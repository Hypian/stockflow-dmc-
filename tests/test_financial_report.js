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

// Simulate the exact SQL logic from reportController.js
function computeFinancialData(products, rawEntries, startDate, endDate) {
  const sorted = [...rawEntries].sort(compareEntriesDesc);

  const result = products.map(p => {
    // Entries in period
    const inPeriod = sorted.filter(e => {
      if (String(e.productId) !== String(p.id)) return false;
      if (startDate && e.date < startDate) return false;
      if (endDate && e.date > endDate) return false;
      return true;
    });

    const totalIn = inPeriod.reduce((s, e) => s + Number(e.received || 0), 0);
    const totalOut = inPeriod.reduce((s, e) => s + Number(e.disbursed || 0), 0);
    const totalDamaged = inPeriod.reduce((s, e) => s + Number(e.damaged || 0), 0);

    // Entries up to endDate (then)
    const upToEnd = sorted.filter(e => {
      if (String(e.productId) !== String(p.id)) return false;
      if (endDate && e.date > endDate) return false;
      return true;
    });

    // Stock at end of period
    const latestInPeriod = upToEnd.length > 0 ? upToEnd[0] : null;
    const periodStock = latestInPeriod ? Number(latestInPeriod.closing || 0) : 0;

    // Prior entries before startDate
    const priorEntries = sorted.filter(e => {
      if (String(e.productId) !== String(p.id)) return false;
      if (startDate && e.date >= startDate) return false;
      return true;
    });

    const derivedOpening = Math.max(periodStock - totalIn + totalOut + totalDamaged, 0);
    const openingStock = (startDate && priorEntries.length > 0)
      ? Number(priorEntries[0].closing || 0)
      : derivedOpening;

    const unitPrice = Number(p.unitPrice || 0);
    return {
      product_name: p.name,
      unit_price: unitPrice,
      opening_stock: openingStock,
      opening_value: openingStock * unitPrice,
      total_in: totalIn,
      received_value: totalIn * unitPrice,
      total_out: totalOut,
      stock_out_value: totalOut * unitPrice,
      total_damaged: totalDamaged,
      damaged_value: totalDamaged * unitPrice,
      current_stock: periodStock,
      current_value: periodStock * unitPrice
    };
  });

  const summary = {
    totalOpeningValue: result.reduce((s, r) => s + r.opening_value, 0),
    totalPeriodValue: result.reduce((s, r) => s + r.current_value, 0),
    totalCurrentValue: result.reduce((s, r) => s + r.current_value, 0),
    totalStockOutValue: result.reduce((s, r) => s + r.stock_out_value, 0),
    totalReceivedValue: result.reduce((s, r) => s + r.received_value, 0),
    totalDamagedValue: result.reduce((s, r) => s + r.damaged_value, 0)
  };

  return { data: result, summary };
}

// Sample Data
const products = [
  { id: 1, name: 'Bread(burger)', unitPrice: 1000, active: true },
  { id: 2, name: 'Aluminium foil', unitPrice: 15000, active: true }
];

const entries = [
  { id: 4, productId: 1, date: '2026-08-11', time: '17:03:39', shift: 'morning', opening: 3, received: 0, disbursed: 1, damaged: 0, closing: 2 },
  { id: 3, productId: 1, date: '2026-08-10', time: '16:54:54', shift: 'morning', opening: 1, received: 0, disbursed: 1, damaged: 0, closing: 0 },
  { id: 2, productId: 1, date: '2026-08-10', time: '07:56:44', shift: 'night', opening: 0, received: 4, disbursed: 0, damaged: 0, closing: 4 },
  { id: 1, productId: 1, date: '2026-08-09', time: '11:21:38', shift: 'morning', opening: 1, received: 0, disbursed: 0, damaged: 0, closing: 1 },
  // Aluminium foil: exited 2, ending stock 7, opening was 0 in entry record
  { id: 5, productId: 2, date: '2026-08-05', time: '14:00:00', shift: 'morning', opening: 0, received: 0, disbursed: 2, damaged: 0, closing: 7 }
];

// Test 1: Historical period (2026-08-09 to 2026-08-10)
const rep1 = computeFinancialData(products, entries, '2026-08-09', '2026-08-10');
assert.strictEqual(rep1.data[0].current_stock, 4);
assert.strictEqual(rep1.data[0].current_value, 4000);
assert.strictEqual(rep1.data[0].opening_stock, 1);
assert.strictEqual(rep1.data[0].opening_value, 1000);

// Test 2: Aluminium foil from user screenshot (2026-08-01 to 2026-08-11)
const rep2 = computeFinancialData(products, entries, '2026-08-01', '2026-08-11');
const alumFoil = rep2.data.find(p => p.product_name === 'Aluminium foil');
console.log('Aluminium foil test output:');
console.log(alumFoil);
console.log('Report Summary Output:');
console.log(rep2.summary);

// Assertions for Aluminium foil:
assert.strictEqual(alumFoil.current_stock, 7);
assert.strictEqual(alumFoil.current_value, 105000);
assert.strictEqual(alumFoil.opening_stock, 9);
assert.strictEqual(alumFoil.opening_value, 135000);

console.log('\nAll Financial Report test assertions passed successfully!');
