const bcrypt = require('bcryptjs');
const pool = require('./config/db');
require('dotenv').config();

const users = [
  { name: 'Rusine Peggy', username: 'rusine', password: 'rusine123', role: 'admin' },
  { name: 'John Rwamanywa', username: 'john', password: 'john123', role: 'user' },
  { name: 'Binama David', username: 'binama', password: 'binama123', role: 'user' },
];

async function seedUsers() {
  console.log('--- Starting User Seeding ---');
  
  for (const user of users) {
    try {
      // Check if user already exists
      const existing = await pool.query('SELECT id FROM users WHERE username = $1', [user.username]);
      
      if (existing.rows.length > 0) {
        console.log(`User "${user.username}" already exists. Skipping.`);
        continue;
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(user.password, salt);

      await pool.query(
        'INSERT INTO users (name, username, password, role) VALUES ($1, $2, $3, $4)',
        [user.name, user.username, hashedPassword, user.role]
      );
      
      console.log(`User "${user.username}" (${user.role}) seeded successfully.`);
    } catch (err) {
      console.error(`Error seeding user "${user.username}":`, err.message);
    }
  }

  console.log('--- Seeding Complete ---');
  process.exit();
}

seedUsers();
