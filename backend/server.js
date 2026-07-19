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
  } catch (err) {
    console.error('Migration failed:', err.message);
  }
});
