const { Pool, types } = require('pg');
require('dotenv').config();

// Override default date parser to prevent automatic JS Date conversion and local timezone shift bugs
types.setTypeParser(1082, function(stringValue) {
  return stringValue; // Preserve 'YYYY-MM-DD' as plain string
});

// Parse DATABASE_URL for Render deployment or use individual env vars for local development
function buildPoolConfig() {
  const rawUrl = (process.env.DATABASE_URL || '').trim();
  const localConfig = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false
  };

  if (rawUrl) {
    try {
      // Validate URL before passing to pg
      new URL(rawUrl);
      return {
        connectionString: rawUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      };
    } catch (err) {
      console.warn('Invalid DATABASE_URL detected. Falling back to individual DB_* environment variables.');
    }
  }

  const placeholders = ['your_db_user', 'your_db_password', 'your_db_host', 'your_db_name', 'username', 'password', 'host', 'database'];
  const hasPlaceholder = [localConfig.user, localConfig.password, localConfig.host, localConfig.database]
    .some(value => !value || placeholders.includes(String(value).toLowerCase()));

  if (hasPlaceholder) {
    throw new Error(
      'Database configuration appears to use placeholder values. Update backend/.env with your real PostgreSQL credentials or set a valid DATABASE_URL.'
    );
  }

  if (!localConfig.user || !localConfig.host || !localConfig.database) {
    throw new Error('Database configuration is invalid. Provide a valid DATABASE_URL or DB_USER/DB_HOST/DB_NAME in environment variables.');
  }

  return localConfig;
}

const poolConfig = buildPoolConfig();

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
