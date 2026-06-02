require('dotenv').config();
const { query } = require('./config/db');

async function migrate() {
  try {
    console.log('Running migration: Add unit_price to products...');
    await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0');
    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
