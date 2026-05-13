const { query } = require('../backend/config/db');

async function test() {
  try {
    const entries = await query('SELECT count(*) FROM entries');
    console.log('Total entries:', entries.rows[0].count);
    
    const damages = await query('SELECT count(*) FROM entries WHERE damaged > 0');
    console.log('Entries with damage:', damages.rows[0].count);
    
    // Test damage report query
    const sql = `
      SELECT p.name as product_name, e.damaged as quantity, e.entry_date as date, e.shift, u.name as user_name
      FROM entries e
      JOIN products p ON e.product_id = p.id
      JOIN users u ON e.user_id = u.id
      WHERE e.damaged > 0
    `;
    const res = await query(sql);
    console.log('Damage report result count:', res.rows.length);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

test();
