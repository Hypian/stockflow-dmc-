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
    
    // Cast results to numbers for safer aggregation
    const data = result.rows.map(r => ({
      ...r,
      quantity: Number(r.quantity || 0)
    }));

    // Summary
    const summary = {
      totalDamaged: data.reduce((s, r) => s + r.quantity, 0),
      period: `${startDate || 'All time'} to ${endDate || 'Present'}`
    };

    res.json({ data, summary });
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
      dateFilter += ` AND e.entry_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND e.entry_date <= $${params.length}`;
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
    
    const data = result.rows.map(r => ({
      ...r,
      total_in: Number(r.total_in || 0),
      total_out: Number(r.total_out || 0),
      net_movement: Number(r.net_movement || 0)
    }));

    const summary = {
      totalIn: data.reduce((s, r) => s + r.total_in, 0),
      totalOut: data.reduce((s, r) => s + r.total_out, 0),
      netMovement: data.reduce((s, r) => s + r.net_movement, 0)
    };

    res.json({ data, summary });
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
          ORDER BY 
            product_id, 
            entry_date DESC,
            CASE WHEN LOWER(TRIM(shift)) = 'night' THEN 2 ELSE 1 END DESC,
            CASE WHEN LOWER(TRIM(shift)) = 'night' AND CAST(SPLIT_PART(entry_time, ':', 1) AS INTEGER) < 10 THEN 1 ELSE 0 END DESC,
            entry_time DESC,
            created_at DESC
      ),
      HistoricalStats AS (
          SELECT product_id, MAX(closing) as max_stock
          FROM entries
          GROUP BY product_id
      )
      SELECT p.name, p.unit, COALESCE(le.closing, 0)::FLOAT as current_stock, hs.max_stock::FLOAT
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
            dateFilter += ` AND e.entry_date >= $${params.length}`;
        }
        if (endDate) {
            params.push(endDate);
            dateFilter += ` AND e.entry_date <= $${params.length}`;
        }

        const sql = `
            SELECT e.entry_date as date, 
                   SUM(e.received) as stock_in, 
                   SUM(e.disbursed) as stock_out
            FROM entries e
            WHERE 1=1 ${dateFilter}
            GROUP BY e.entry_date
            ORDER BY e.entry_date ASC
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
            dateFilter += ` AND e.entry_date >= $${params.length}`;
        }
        if (endDate) {
            params.push(endDate);
            dateFilter += ` AND e.entry_date <= $${params.length}`;
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
        
        const data = result.rows.map(r => ({
          ...r,
          damages: Number(r.damages || 0),
          shrinkage: Number(r.shrinkage || 0)
        }));

        res.json({ data });
    } catch (error) {
        console.error('getLossReport Error:', error);
        res.status(500).json({ error: 'Failed to generate loss report' });
    }
};

// @desc    Get Financial Value Report
// @route   GET /api/reports/financial
// @access  Private/Admin
const getFinancialReport = async (req, res) => {
    const { startDate, endDate } = req.query;
    try {
        const params = [];
        let periodFilter = '';
        let endCutoffFilter = '';
        let startPriorFilter = '';

        if (startDate) {
            params.push(startDate);
            periodFilter += ` AND entry_date >= $${params.length}`;
            startPriorFilter += ` AND entry_date < $${params.length}`;
        }
        if (endDate) {
            params.push(endDate);
            periodFilter += ` AND entry_date <= $${params.length}`;
            endCutoffFilter += ` AND entry_date <= $${params.length}`;
        }

        const sql = `
            WITH latest_in_period AS (
                SELECT DISTINCT ON (product_id)
                    product_id, closing as period_closing
                FROM entries
                WHERE 1=1 ${endCutoffFilter}
                ORDER BY 
                    product_id, 
                    entry_date DESC,
                    CASE WHEN LOWER(TRIM(shift)) = 'night' THEN 2 ELSE 1 END DESC,
                    CASE WHEN LOWER(TRIM(shift)) = 'night' AND CAST(SPLIT_PART(entry_time, ':', 1) AS INTEGER) < 10 THEN 1 ELSE 0 END DESC,
                    entry_time DESC,
                    created_at DESC
            ),
            agg AS (
                SELECT 
                    product_id,
                    COALESCE(SUM(disbursed), 0) as total_out,
                    COALESCE(SUM(received), 0) as total_in,
                    COALESCE(SUM(damaged), 0) as total_damaged
                FROM entries
                WHERE 1=1 ${periodFilter}
                GROUP BY product_id
            ),
            prior_closing AS (
                SELECT DISTINCT ON (product_id)
                    product_id, closing as prior_closing
                FROM entries
                WHERE ${startDate ? `1=1 ${startPriorFilter}` : '1=0'}
                ORDER BY 
                    product_id, 
                    entry_date DESC,
                    CASE WHEN LOWER(TRIM(shift)) = 'night' THEN 2 ELSE 1 END DESC,
                    CASE WHEN LOWER(TRIM(shift)) = 'night' AND CAST(SPLIT_PART(entry_time, ':', 1) AS INTEGER) < 10 THEN 1 ELSE 0 END DESC,
                    entry_time DESC,
                    created_at DESC
            ),
            earliest_in_period AS (
                SELECT DISTINCT ON (product_id)
                    product_id, opening as period_opening
                FROM entries
                WHERE 1=1 ${periodFilter}
                ORDER BY 
                    product_id, 
                    entry_date ASC,
                    CASE WHEN LOWER(TRIM(shift)) = 'morning' THEN 1 ELSE 2 END ASC,
                    entry_time ASC,
                    created_at ASC
            ),
            latest_overall AS (
                SELECT DISTINCT ON (product_id)
                    product_id, closing as current_stock
                FROM entries
                ORDER BY 
                    product_id, 
                    entry_date DESC,
                    CASE WHEN LOWER(TRIM(shift)) = 'night' THEN 2 ELSE 1 END DESC,
                    CASE WHEN LOWER(TRIM(shift)) = 'night' AND CAST(SPLIT_PART(entry_time, ':', 1) AS INTEGER) < 10 THEN 1 ELSE 0 END DESC,
                    entry_time DESC,
                    created_at DESC
            )
            SELECT 
                p.name as product_name,
                COALESCE(p.unit_price, 0) as unit_price,
                COALESCE(lip.period_closing, 0) as period_stock,
                COALESCE(lip.period_closing, 0) * COALESCE(p.unit_price, 0) as period_value,
                COALESCE(lo.current_stock, 0) as current_stock,
                COALESCE(lo.current_stock, 0) * COALESCE(p.unit_price, 0) as current_value,
                COALESCE(a.total_out, 0) as total_out,
                COALESCE(a.total_in, 0) as total_in,
                COALESCE(a.total_damaged, 0) as total_damaged,
                COALESCE(a.total_out, 0) * COALESCE(p.unit_price, 0) as stock_out_value,
                COALESCE(a.total_in, 0) * COALESCE(p.unit_price, 0) as received_value,
                COALESCE(a.total_damaged, 0) * COALESCE(p.unit_price, 0) as damaged_value,
                COALESCE(pc.prior_closing, eip.period_opening, GREATEST(COALESCE(lip.period_closing, 0) - COALESCE(a.total_in, 0) + COALESCE(a.total_out, 0) + COALESCE(a.total_damaged, 0), 0)) as opening_stock,
                COALESCE(pc.prior_closing, eip.period_opening, GREATEST(COALESCE(lip.period_closing, 0) - COALESCE(a.total_in, 0) + COALESCE(a.total_out, 0) + COALESCE(a.total_damaged, 0), 0)) * COALESCE(p.unit_price, 0) as opening_value
            FROM products p
            LEFT JOIN latest_in_period lip ON lip.product_id = p.id
            LEFT JOIN agg a ON a.product_id = p.id
            LEFT JOIN prior_closing pc ON pc.product_id = p.id
            LEFT JOIN earliest_in_period eip ON eip.product_id = p.id
            LEFT JOIN latest_overall lo ON lo.product_id = p.id
            WHERE p.active = true
            ORDER BY p.name ASC
        `;

        const result = await query(sql, params);

        const data = result.rows.map(r => ({
          product_name: r.product_name,
          unit_price: Number(r.unit_price || 0),
          opening_stock: Number(r.opening_stock || 0),
          opening_value: Number(r.opening_value || 0),
          period_stock: Number(r.period_stock || 0),
          period_value: Number(r.period_value || 0),
          current_stock: Number(r.current_stock || 0),
          current_value: Number(r.current_value || 0),
          total_out: Number(r.total_out || 0),
          total_in: Number(r.total_in || 0),
          total_damaged: Number(r.total_damaged || 0),
          stock_out_value: Number(r.stock_out_value || 0),
          received_value: Number(r.received_value || 0),
          damaged_value: Number(r.damaged_value || 0)
        }));

        const summary = {
          totalOpeningValue: data.reduce((s, r) => s + r.opening_value, 0),
          totalPeriodValue: data.reduce((s, r) => s + r.period_value, 0),
          totalCurrentValue: data.reduce((s, r) => s + r.current_value, 0),
          totalStockOutValue: data.reduce((s, r) => s + r.stock_out_value, 0),
          totalReceivedValue: data.reduce((s, r) => s + r.received_value, 0),
          totalDamagedValue: data.reduce((s, r) => s + r.damaged_value, 0)
        };

        res.json({ data, summary });
    } catch (error) {
        console.error('getFinancialReport Error:', error);
        res.status(500).json({ error: 'Failed to generate financial report', details: error.message });
    }
};

module.exports = {
  getDamageReport,
  getStockComparison,
  getInventorySummary,
  getMovementTrends,
  getLossReport,
  getFinancialReport
};
