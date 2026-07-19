const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));

// Basic Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'success', message: 'Server is up and running' });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!', details: err.message });
});

const bcrypt = require('bcryptjs');

async function autoSeed(pool) {
  try {
    // 1. Seed Users
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    if (Number(usersCount.rows[0].count) === 0) {
      console.log('No users found. Auto-seeding default users...');
      const defaultUsers = [
        { name: 'Rusine Peggy', username: 'rusine', password: 'rusine123', role: 'admin' },
        { name: 'John Rwamanywa', username: 'john', password: 'john123', role: 'user' },
        { name: 'Binama David', username: 'binama', password: 'binama123', role: 'user' },
      ];
      for (const u of defaultUsers) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(u.password, salt);
        await pool.query(
          'INSERT INTO users (name, username, password, role) VALUES ($1, $2, $3, $4)',
          [u.name, u.username, hashedPassword, u.role]
        );
      }
      console.log('Default users auto-seeded successfully.');
    }

    // 2. Seed Products
    const productsCount = await pool.query('SELECT COUNT(*) FROM products');
    if (Number(productsCount.rows[0].count) === 0) {
      console.log('No products found. Auto-seeding default product catalog...');
      const defaultProducts = [
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
      for (const p of defaultProducts) {
        await pool.query(
          'INSERT INTO products (name, unit, unit_price, active) VALUES ($1, $2, $3, $4)',
          [p.name, p.unit, p.unit_price, p.active]
        );
      }
      console.log('Default product catalog auto-seeded successfully.');
    }

    // 3. Seed Entries
    const entriesCount = await pool.query('SELECT COUNT(*) FROM entries');
    if (Number(entriesCount.rows[0].count) === 0) {
      console.log('No entries found. Auto-seeding initial stock entries...');
      const dbProducts = await pool.query('SELECT id FROM products');
      const normalUser = await pool.query("SELECT id FROM users WHERE role = 'user' LIMIT 1");
      const userId = normalUser.rows.length > 0 ? normalUser.rows[0].id : 1;
      const todayStr = new Date().toISOString().split('T')[0];
      const timeStr = '10:30:00';

      for (const p of dbProducts.rows) {
        const opening = Math.floor(Math.random() * 50) + 10;
        const received = Math.floor(Math.random() * 20);
        const disbursed = Math.floor(Math.random() * 15);
        const damaged = Math.random() > 0.8 ? 1 : 0;
        const closing = opening + received - disbursed - damaged;
        const variance = 0;

        await pool.query(
          `INSERT INTO entries 
          (product_id, user_id, opening, received, disbursed, damaged, closing, variance, shift, entry_date, entry_time)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [p.id, userId, opening, received, disbursed, damaged, closing, variance, 'morning', todayStr, timeStr]
        );
      }
      console.log('Initial stock entries auto-seeded successfully.');
    }
  } catch (err) {
    console.error('Auto-seeding failed:', err);
  }
}

const { pool } = require('./config/db');

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Auto-migrate to ensure columns and indexes exist
  try {
    await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0');
    console.log('Database migration verified: unit_price column check complete.');
    
    // Performance Optimization: Create indexes on entries table for faster analytics/reports queries
    await pool.query('CREATE INDEX IF NOT EXISTS idx_entries_product_id ON entries (product_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_entries_entry_date ON entries (entry_date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_entries_product_date ON entries (product_id, entry_date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_entries_sorting ON entries (product_id, entry_date DESC, entry_time DESC, created_at DESC)');
    console.log('Database indexes verification complete.');

    // Auto-seed database if empty
    await autoSeed(pool);
  } catch (err) {
    console.error('Migration/Seeding failed:', err.message);
  }
});
