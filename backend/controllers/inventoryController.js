const { query } = require('../config/db');
const { logAudit } = require('../services/auditService');

// @desc    Get all inventory tracking entries
// @route   GET /api/inventory/entries
// @access  Private
const getEntries = async (req, res) => {
  try {
    let result;
    // Both admins and users can now see all entries to support unified opening/closing stock
    result = await query(`
      SELECT entries.*, products.name as product_name, products.unit, users.name as user_name 
      FROM entries 
      JOIN products ON entries.product_id = products.id
      JOIN users ON entries.user_id = users.id
      ORDER BY entries.entry_date DESC, entries.entry_time DESC, entries.created_at DESC
    `);
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

    // ── MANDATORY HANDOVER LOGIC ──
    // Rule: Night shift opening MUST equal Morning shift closing for the same product and date.
    let finalOpening = opening;
    let finalVariance = variance;

    if (shift === 'night') {
      const morningRef = await query(
        'SELECT closing FROM entries WHERE product_id = $1 AND entry_date = $2 AND shift = $3 LIMIT 1',
        [product_id, entry_date, 'morning']
      );
      if (morningRef.rows.length > 0) {
        finalOpening = morningRef.rows[0].closing;
        // Re-calculate variance based on the forced opening stock
        const expected = Number(finalOpening || 0) + Number(received || 0) - Number(damaged || 0) - Number(disbursed || 0);
        finalVariance = Number(closing || 0) - expected;
      }
    }

    const newEntry = await query(
      `INSERT INTO entries 
      (product_id, user_id, opening, received, disbursed, damaged, closing, variance, shift, entry_date, entry_time) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [product_id, req.user.id, finalOpening, received, disbursed, damaged, closing, finalVariance, shift, entry_date, entry_time]
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
  const allowedFields = new Set([
    'opening',
    'received',
    'disbursed',
    'damaged',
    'closing',
    'variance',
    'shift',
    'entry_date',
    'entry_time'
  ]);

  try {
    // 1. Get the existing record first for the audit trail
    const existingResult = await query('SELECT * FROM entries WHERE id = $1', [id]);
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    const oldValues = existingResult.rows[0];

    // ── MANDATORY HANDOVER LOGIC (For Updates) ──
    const finalShift = updates.shift || oldValues.shift;
    const finalDate = updates.entry_date || oldValues.entry_date;
    const finalProductId = updates.product_id || oldValues.product_id;

    if (finalShift === 'night') {
      const morningRef = await query(
        'SELECT closing FROM entries WHERE product_id = $1 AND entry_date = $2 AND shift = $3 LIMIT 1',
        [finalProductId, finalDate, 'morning']
      );
      if (morningRef.rows.length > 0) {
        updates.opening = morningRef.rows[0].closing;
        // Recalculate variance if we are forcing the opening
        const r = updates.received !== undefined ? updates.received : oldValues.received;
        const d = updates.disbursed !== undefined ? updates.disbursed : oldValues.disbursed;
        const dmg = updates.damaged !== undefined ? updates.damaged : oldValues.damaged;
        const cl = updates.closing !== undefined ? updates.closing : oldValues.closing;
        const expected = Number(updates.opening || 0) + Number(r || 0) - Number(dmg || 0) - Number(d || 0);
        updates.variance = Number(cl || 0) - expected;
      }
    }

    // Build the dynamic update query based on provided fields
    const keys = Object.keys(updates).filter(key => allowedFields.has(key));
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
