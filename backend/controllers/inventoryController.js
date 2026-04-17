const { query } = require('../config/db');
const { logAudit } = require('../services/auditService');

// @desc    Get all inventory tracking entries
// @route   GET /api/inventory/entries
// @access  Private
const getEntries = async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      // Admins see everything
      result = await query(`
        SELECT entries.*, products.name as product_name, products.unit, users.name as user_name 
        FROM entries 
        JOIN products ON entries.product_id = products.id
        JOIN users ON entries.user_id = users.id
        ORDER BY entries.created_at DESC
      `);
    } else {
      // Users only see their own entries
      result = await query(`
        SELECT entries.*, products.name as product_name, products.unit, users.name as user_name 
        FROM entries 
        JOIN products ON entries.product_id = products.id
        JOIN users ON entries.user_id = users.id
        WHERE entries.user_id = $1 
        ORDER BY entries.created_at DESC
      `, [req.user.id]);
    }
    res.json(result.rows);
  } catch (error) {
    console.error('getEntries Error:', error);
    res.status(500).json({ error: 'Server error retrieving entries' });
  }
};

// @desc    Create a new stock entry
// @route   POST /api/inventory/entries
// @access  Private
const createEntry = async (req, res) => {
  const { product_id, opening, received, disbursed, damaged, closing, variance, shift, entry_date, entry_time } = req.body;

  if (!product_id || closing === undefined) {
    return res.status(400).json({ error: 'Missing required fields: product_id or closing' });
  }

  try {
    // Validate product exists first
    const prodCheck = await query('SELECT id FROM products WHERE id = $1', [product_id]);
    if (prodCheck.rows.length === 0) {
      return res.status(404).json({ error: `Product ID ${product_id} not found in database` });
    }

    // Check for duplicate entry: same product, same user, same date
    const dupCheck = await query(
      'SELECT id FROM entries WHERE product_id = $1 AND user_id = $2 AND entry_date = $3',
      [product_id, req.user.id, entry_date]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ 
        error: 'You already have an entry for this product today. Update your existing entry instead.',
        existingEntryId: dupCheck.rows[0].id
      });
    }

    const newEntry = await query(
      `INSERT INTO entries 
      (product_id, user_id, opening, received, disbursed, damaged, closing, variance, shift, entry_date, entry_time) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [product_id, req.user.id, opening, received, disbursed, damaged, closing, variance, shift, entry_date, entry_time]
    );

    const record = newEntry.rows[0];

    // Fetch associated data for the frontend return
    const detailed = await query(`
      SELECT e.*, p.name as product_name, p.unit, u.name as user_name 
      FROM entries e
      JOIN products p ON e.product_id = p.id
      JOIN users u ON e.user_id = u.id
      WHERE e.id = $1
    `, [record.id]);

    const recordToLog = detailed.rows[0];

    // AUDIT TRAIL: Log Creation
    await logAudit({
      userId: req.user.id,
      action: 'CREATE',
      tableName: 'entries',
      recordId: record.id,
      newValues: recordToLog,
      ipAddress: req.ip
    });

    res.status(201).json(recordToLog);
  } catch (error) {
    console.error('createEntry Error:', error);
    res.status(500).json({ error: 'Server error creating entry', detail: error.message });
  }
};

// @desc    Update an existing entry
// @route   PUT /api/inventory/entries/:id
// @access  Private
const updateEntry = async (req, res) => {
  const { id } = req.params;
  const updates = req.body; // e.g., { damaged: 5, closing: 95 }

  try {
    // 1. Get the existing record first for the audit trail
    const existingResult = await query('SELECT * FROM entries WHERE id = $1', [id]);
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    const oldValues = existingResult.rows[0];

    // Build the dynamic update query based on provided fields
    const keys = Object.keys(updates);
    if (keys.length === 0) return res.status(400).json({ error: 'No data to update' });

    const setString = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
    const values = keys.map(key => updates[key]);

    // 2. Perform the update
    const updatedResult = await query(
      `UPDATE entries SET ${setString} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );

    const newValues = updatedResult.rows[0];

    // 3. AUDIT TRAIL: Log the Update
    await logAudit({
      userId: req.user.id,
      action: 'UPDATE',
      tableName: 'entries',
      recordId: id,
      oldValues: oldValues,
      newValues: newValues,
      ipAddress: req.ip
    });

    res.json(newValues);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error updating entry' });
  }
};

// @desc    Delete a stock entry
// @route   DELETE /api/inventory/entries/:id
// @access  Private/Admin
const deleteEntry = async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Get existing for audit
    const existingResult = await query('SELECT * FROM entries WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const oldValues = existingResult.rows[0];

    // 2. Delete the record
    await query('DELETE FROM entries WHERE id = $1', [id]);

    // 3. AUDIT TRAIL: Log Deletion
    await logAudit({
      userId: req.user.id,
      action: 'DELETE',
      tableName: 'entries',
      recordId: id,
      oldValues: oldValues,
      ipAddress: req.ip
    });

    res.json({ message: 'Entry deleted successfully' });
  } catch (error) {
    console.error('deleteEntry Error:', error);
    res.status(500).json({ error: 'Server error deleting entry' });
  }
};

module.exports = {
  getEntries,
  createEntry,
  updateEntry,
  deleteEntry
};

