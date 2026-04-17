const { Pool, types } = require('pg');
require('dotenv').config();

// Override default date parser to prevent automatic JS Date conversion and local timezone shift bugs
types.setTypeParser(1082, function(stringValue) {
  return stringValue; // Preserve 'YYYY-MM-DD' as plain string
});

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL Database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
