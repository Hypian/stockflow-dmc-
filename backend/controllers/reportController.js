const { query } = require('../config/db');

// @desc    Get Damage Report data
// @route   GET /api/reports/damages
// @access  Private/Admin
const getDamageReport = async (req, res) => {
  const { startDate, endDate, productId, categoryId } = req.query;
  
  try {
    let sql = `
      SELECT p.name as product_name, e.damaged as quantity, e.entry_date as date, e.shift, u.name as user_name
      FROM entries e
      JOIN products p ON e.product_id = p.id
      JOIN users u ON e.user_id = u.id
      WHERE e.damaged > 0
    `;
    const params = [];

    if (startDate) {
      params.push(startDate);
      sql += ` AND e.entry_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      sql += ` AND e.entry_date <= $${params.length}`;
    }
    if (productId) {
      params.push(productId);
      sql += ` AND e.product_id = $${params.length}`;
    }
    // Note: If you have category table, join it. Currently products doesn't seem to have category_id in the controller view I had earlier, let me check product schema.
    
    sql += ` ORDER BY e.entry_date DESC`;

    const result = await query(sql, params);
    
    // Summary
    const summary = {
      totalDamaged: result.rows.reduce((s, r) => s + Number(r.quantity), 0),
      period: `${startDate || 'All time'} to ${endDate || 'Present'}`
    };

    res.json({ data: result.rows, summary });
  } catch (error) {
    console.error('getDamageReport Error:', error);
    res.status(500).json({ error: 'Failed to generate damage report' });
  }
};

// @desc    Get Stock In vs Stock Out Comparison
// @route   GET /api/reports/comparison
// @access  Private/Admin
const getStockComparison = async (req, res) => {
  const { startDate, endDate } = req.query;
  
  try {
    const params = [];
    let dateFilter = '';
    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND entry_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND entry_date <= $${params.length}`;
    }

    const sql = `
      SELECT p.name as product_name, 
             SUM(e.received) as total_in, 
             SUM(e.disbursed) as total_out,
             SUM(e.received) - SUM(e.disbursed) as net_movement
      FROM entries e
      JOIN products p ON e.product_id = p.id
      WHERE 1=1 ${dateFilter}
      GROUP BY p.id, p.name
      ORDER BY p.name ASC
    `;

    const result = await query(sql, params);
    
    const summary = {
      totalIn: result.rows.reduce((s, r) => s + Number(r.total_in), 0),
      totalOut: result.rows.reduce((s, r) => s + Number(r.total_out), 0),
      netMovement: result.rows.reduce((s, r) => s + Number(r.net_movement), 0)
    };

    res.json({ data: result.rows, summary });
  } catch (error) {
    console.error('getStockComparison Error:', error);
    res.status(500).json({ error: 'Failed to generate comparison report' });
  }
};

// @desc    Get Inventory Summary (Current Levels, Low Stock)
// @route   GET /api/reports/summary
// @access  Private/Admin
const getInventorySummary = async (req, res) => {
  try {
    const sql = `
      WITH LatestEntries AS (
          SELECT DISTINCT ON (product_id) *
          FROM entries
          ORDER BY product_id, entry_date DESC, entry_time DESC, created_at DESC
      ),
      HistoricalStats AS (
          SELECT product_id, MAX(closing) as max_stock
          FROM entries
          GROUP BY product_id
      )
      SELECT p.name, p.unit, COALESCE(le.closing, 0) as current_stock, hs.max_stock
      FROM products p
      LEFT JOIN LatestEntries le ON p.id = le.product_id
      LEFT JOIN HistoricalStats hs ON p.id = hs.product_id
      WHERE p.active = true
      ORDER BY p.name ASC
    `;

    const result = await query(sql);
    
    const data = result.rows.map(r => {
      const threshold = r.max_stock * 0.35;
      return {
        ...r,
        isLow: r.max_stock > 0 && r.current_stock <= threshold,
        isOverstock: r.max_stock > 0 && r.current_stock > r.max_stock * 0.9 // example overstock logic
      };
    });

    res.json({ data });
  } catch (error) {
    console.error('getInventorySummary Error:', error);
    res.status(500).json({ error: 'Failed to generate inventory summary' });
  }
};

// @desc    Get Movement Trends
// @route   GET /api/reports/trends
// @access  Private/Admin
const getMovementTrends = async (req, res) => {
    const { startDate, endDate } = req.query;
    try {
        const params = [];
        let dateFilter = '';
        if (startDate) {
            params.push(startDate);
            dateFilter += ` AND entry_date >= $${params.length}`;
        }
        if (endDate) {
            params.push(endDate);
            dateFilter += ` AND entry_date <= $${params.length}`;
        }

        const sql = `
            SELECT entry_date as date, 
                   SUM(received) as stock_in, 
                   SUM(disbursed) as stock_out
            FROM entries
            WHERE 1=1 ${dateFilter}
            GROUP BY entry_date
            ORDER BY entry_date ASC
        `;
        const result = await query(sql, params);
        res.json({ data: result.rows });
    } catch (error) {
        console.error('getMovementTrends Error:', error);
        res.status(500).json({ error: 'Failed to generate trends report' });
    }
};

// @desc    Get Loss & Adjustment Report
// @route   GET /api/reports/loss
// @access  Private/Admin
const getLossReport = async (req, res) => {
    const { startDate, endDate } = req.query;
    try {
        const params = [];
        let dateFilter = '';
        if (startDate) {
            params.push(startDate);
            dateFilter += ` AND entry_date >= $${params.length}`;
        }
        if (endDate) {
            params.push(endDate);
            dateFilter += ` AND entry_date <= $${params.length}`;
        }

        const sql = `
            SELECT p.name as product_name, 
                   SUM(e.damaged) as damages, 
                   ABS(SUM(CASE WHEN e.variance < 0 THEN e.variance ELSE 0 END)) as shrinkage
            FROM entries e
            JOIN products p ON e.product_id = p.id
            WHERE 1=1 ${dateFilter}
            GROUP BY p.id, p.name
            ORDER BY (SUM(e.damaged) + ABS(SUM(CASE WHEN e.variance < 0 THEN e.variance ELSE 0 END))) DESC
        `;
        const result = await query(sql, params);
        res.json({ data: result.rows });
    } catch (error) {
        console.error('getLossReport Error:', error);
        res.status(500).json({ error: 'Failed to generate loss report' });
    }
};

module.exports = {
  getDamageReport,
  getStockComparison,
  getInventorySummary,
  getMovementTrends,
  getLossReport
};
