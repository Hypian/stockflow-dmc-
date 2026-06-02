require('dotenv').config();
const { pool } = require('./config/db');
(async () => {
  try {
    await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0');
    console.log("Migration done");
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
})();
