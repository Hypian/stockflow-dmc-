require('dotenv').config();
const { query, pool } = require('./config/db');

const products = [
  { name: 'Paracetamol 500mg', unit: 'boxes', unit_price: 2500, active: true },
  { name: 'Amoxicillin 250mg', unit: 'packs', unit_price: 4500, active: true },
  { name: 'Surgical Gloves (Pairs)', unit: 'boxes', unit_price: 8000, active: true },
  { name: 'Syringe 5ml', unit: 'pcs', unit_price: 150, active: true },
  { name: 'Face Mask 3-ply', unit: 'boxes', unit_price: 3500, active: true },
  { name: 'Iodine Solution 100ml', unit: 'bottles', unit_price: 1200, active: true },
  { name: 'Ibuprofen 400mg', unit: 'packs', unit_price: 3000, active: true },
  { name: 'Saline Infusion 500ml', unit: 'bottles', unit_price: 1800, active: true },
  { name: 'IV Cannula 20G', unit: 'pcs', unit_price: 600, active: true },
  { name: 'Gauze Swab 10x10cm', unit: 'packs', unit_price: 2200, active: true }
];

async function seed() {
  console.log('--- Starting Data Seeding ---');
  try {
    // 1. Check if we have users. If not, seed them first.
    const userCheck = await query('SELECT id FROM users LIMIT 1');
    let adminUserId = 1;
    let normalUserId = 2;
    
    if (userCheck.rows.length === 0) {
      console.log('No users found. Please run seedUsers.js first.');
      process.exit(1);
    } else {
      const adminUser = await query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
      const normalUser = await query("SELECT id FROM users WHERE role = 'user' LIMIT 1");
      if (adminUser.rows.length > 0) adminUserId = adminUser.rows[0].id;
      if (normalUser.rows.length > 0) normalUserId = normalUser.rows[0].id;
    }

    // 2. Check if we have products.
    const productCheck = await query('SELECT id FROM products LIMIT 1');
    if (productCheck.rows.length > 0) {
      console.log('Products already exist in database. Skipping product seeding.');
    } else {
      console.log('Seeding products...');
      for (const p of products) {
        await query(
          'INSERT INTO products (name, unit, unit_price, active) VALUES ($1, $2, $3, $4)',
          [p.name, p.unit, p.unit_price, p.active]
        );
      }
      console.log('Products seeded successfully.');
    }

    // 3. Check if we have entries.
    const entryCheck = await query('SELECT id FROM entries LIMIT 1');
    if (entryCheck.rows.length > 0) {
      console.log('Entries already exist in database. Skipping entry seeding.');
    } else {
      console.log('Seeding entries...');
      const dbProducts = await query('SELECT id, name FROM products');
      const todayStr = new Date().toISOString().split('T')[0];
      const timeStr = '10:30:00';

      for (const p of dbProducts.rows) {
        // Let's seed a morning shift entry
        const opening = Math.floor(Math.random() * 50) + 10;
        const received = Math.floor(Math.random() * 20);
        const disbursed = Math.floor(Math.random() * 15);
        const damaged = Math.random() > 0.8 ? 1 : 0;
        const closing = opening + received - disbursed - damaged;
        const variance = 0; // expected

        await query(
          `INSERT INTO entries 
          (product_id, user_id, opening, received, disbursed, damaged, closing, variance, shift, entry_date, entry_time)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [p.id, normalUserId, opening, received, disbursed, damaged, closing, variance, 'morning', todayStr, timeStr]
        );
      }
      console.log('Entries seeded successfully.');
    }

    console.log('--- Seeding Complete ---');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding database:', err);
    process.exit(1);
  }
}

seed();
