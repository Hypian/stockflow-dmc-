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

async function restoreFromAuditLogs(pool) {
  try {
    console.log('--- STARTING DATABASE AUTO-RECOVERY FROM AUDIT LOGS ---');

    // 1. Reconstruct Products
    const productLogs = await pool.query(`
      SELECT * FROM audit_logs 
      WHERE table_name = 'products' 
      ORDER BY timestamp ASC
    `);
    
    const productsMap = new Map();
    for (const log of productLogs.rows) {
      const { action, record_id, new_values } = log;
      if (action === 'CREATE' || action === 'UPDATE') {
        if (new_values) {
          productsMap.set(record_id, {
            id: record_id,
            name: new_values.name,
            unit: new_values.unit,
            unit_price: new_values.unit_price || new_values.unitPrice || 0,
            active: new_values.active !== undefined ? new_values.active : true
          });
        }
      } else if (action === 'DELETE') {
        productsMap.delete(record_id);
      }
    }

    const restoredProducts = Array.from(productsMap.values());
    console.log(`Reconstructed ${restoredProducts.length} products from audit logs.`);

    // 2. Reconstruct Entries
    const entryLogs = await pool.query(`
      SELECT * FROM audit_logs 
      WHERE table_name = 'entries' 
      ORDER BY timestamp ASC
    `);

    const entriesMap = new Map();
    for (const log of entryLogs.rows) {
      const { action, record_id, new_values } = log;
      if (action === 'CREATE' || action === 'UPDATE') {
        if (new_values) {
          entriesMap.set(record_id, {
            id: record_id,
            product_id: new_values.product_id || new_values.productId,
            user_id: new_values.user_id || new_values.userId,
            opening: new_values.opening,
            received: new_values.received,
            disbursed: new_values.disbursed,
            damaged: new_values.damaged,
            closing: new_values.closing,
            variance: new_values.variance,
            shift: new_values.shift,
            entry_date: new_values.entry_date || new_values.date,
            entry_time: new_values.entry_time || new_values.time
          });
        }
      } else if (action === 'DELETE') {
        entriesMap.delete(record_id);
      }
    }

    const restoredEntries = Array.from(entriesMap.values());
    console.log(`Reconstructed ${restoredEntries.length} entries from audit logs.`);

    // 3. Restore to Database
    if (restoredProducts.length > 0) {
      console.log('Restoring products and entries...');
      await pool.query('TRUNCATE TABLE entries CASCADE');
      await pool.query('TRUNCATE TABLE products CASCADE');

      // Insert products with their original IDs
      for (const p of restoredProducts) {
        await pool.query(
          'INSERT INTO products (id, name, unit, unit_price, active) VALUES ($1, $2, $3, $4, $5)',
          [p.id, p.name, p.unit, p.unit_price, p.active]
        );
      }

      // Insert entries with their original IDs
      for (const e of restoredEntries) {
        const productExists = restoredProducts.some(p => p.id === e.product_id);
        if (productExists) {
          await pool.query(
            `INSERT INTO entries 
            (id, product_id, user_id, opening, received, disbursed, damaged, closing, variance, shift, entry_date, entry_time)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [e.id, e.product_id, e.user_id, e.opening, e.received, e.disbursed, e.damaged, e.closing, e.variance, e.shift, e.entry_date, e.entry_time]
          );
        }
      }

      // 4. Update the PostgreSQL sequences for the tables
      await pool.query(`SELECT setval('products_id_seq', COALESCE((SELECT MAX(id)+1 FROM products), 1), false)`);
      await pool.query(`SELECT setval('entries_id_seq', COALESCE((SELECT MAX(id)+1 FROM entries), 1), false)`);
      
      console.log('Database successfully restored from audit logs!');
    } else {
      console.log('No product audit logs found to restore.');
    }
  } catch (err) {
    console.error('Database auto-recovery failed:', err);
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

    // Auto-restore database from audit logs
    await restoreFromAuditLogs(pool);
  } catch (err) {
    console.error('Migration/Restoration failed:', err.message);
  }
});
