const { Pool, types } = require('pg');
require('dotenv').config();

// Override default date parser to prevent automatic JS Date conversion and local timezone shift bugs
types.setTypeParser(1082, function(stringValue) {
  return stringValue; // Preserve 'YYYY-MM-DD' as plain string
});

// Parse DATABASE_URL for Render deployment or use individual env vars for local development
let poolConfig;

if (process.env.DATABASE_URL) {
  // Render provides DATABASE_URL
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  };
} else {
  // Local development with individual env vars
  poolConfig = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false
  };
}

const pool = new Pool(poolConfig);

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
