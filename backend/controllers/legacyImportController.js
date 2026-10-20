const { pool } = require('../config/db');

const isUuid = value =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const inputError = message => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const normalizeProductName = name => String(name).trim().replace(/\s+/g, ' ');

const nullableNumber = (value, field) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw inputError(`Invalid numeric value for ${field}`);
  return number;
};

const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const validTime = value => {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)) return false;
  const [hours, minutes, seconds = '0'] = value.split(':').map(Number);
  return hours < 24 && minutes < 60 && seconds < 60;
};

const writeAuditLog = async (client, { userId, action, tableName, recordId, values, ipAddress }) => {
  await client.query(
    `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, action, tableName, recordId, JSON.stringify(values), ipAddress]
  );
};

const importLegacyData = async (req, res) => {
  const { importId, products, entries } = req.body || {};
  if (!isUuid(importId)) return res.status(400).json({ error: 'A valid import ID is required' });
  if (!Array.isArray(products) || !Array.isArray(entries)) {
    return res.status(400).json({ error: 'Products and entries must both be arrays' });
  }
  if (products.length > 5000 || entries.length > 5000) {
    return res.status(400).json({ error: 'Legacy import is limited to 5,000 products and entries per request' });
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS legacy_imports (
        import_id UUID PRIMARY KEY,
        imported_by INTEGER NOT NULL REFERENCES users(id),
        products_imported INTEGER NOT NULL DEFAULT 0,
        entries_imported INTEGER NOT NULL DEFAULT 0,
        imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const marker = await client.query(
      `INSERT INTO legacy_imports (import_id, imported_by)
       VALUES ($1, $2)
       ON CONFLICT (import_id) DO NOTHING
       RETURNING import_id`,
      [importId, req.user.id]
    );

    if (marker.rows.length === 0) {
      const previous = await client.query(
        'SELECT products_imported, entries_imported FROM legacy_imports WHERE import_id = $1',
        [importId]
      );
      await client.query('COMMIT');
      transactionStarted = false;
      return res.json({
        alreadyImported: true,
        productsImported: previous.rows[0]?.products_imported || 0,
        entriesImported: previous.rows[0]?.entries_imported || 0
      });
    }

    const productIds = new Map();
    let productsImported = 0;
    for (const product of products) {
      if (!product || product.id === undefined || product.id === null) {
        throw inputError('Every legacy product must have an ID');
      }
      const name = normalizeProductName(product.name || '');
      const unit = typeof product.unit === 'string' ? product.unit.trim() : '';
      if (!name || !unit) throw inputError('Every legacy product must have a name and unit');

      const unitPrice = nullableNumber(product.unitPrice ?? product.unit_price ?? 0, 'unit price') ?? 0;
      const existing = await client.query(
        'SELECT * FROM products WHERE lower(name) = lower($1) LIMIT 1',
        [name]
      );
      let savedProduct = existing.rows[0];
      if (!savedProduct) {
        if (req.user.role !== 'admin') {
          throw inputError(`Product "${name}" is not in the shared catalog yet. Ask an admin to import the product catalog first; your local data has been kept.`);
        }
        const inserted = await client.query(
          `INSERT INTO products (name, unit, unit_price, active)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [name, unit, unitPrice, product.active !== false]
        );
        savedProduct = inserted.rows[0];
        productsImported += 1;
        await writeAuditLog(client, {
          userId: req.user.id,
          action: 'CREATE',
          tableName: 'products',
          recordId: savedProduct.id,
          values: savedProduct,
          ipAddress: req.ip
        });
      }
      productIds.set(String(product.id), savedProduct.id);
    }

    const users = new Map();
    let entriesImported = 0;
    for (const entry of entries) {
      const username = req.user.role === 'admin'
        ? (typeof entry?.legacyUsername === 'string' ? entry.legacyUsername.trim() : '')
        : req.user.username;
      if (!username) throw inputError('A legacy entry is missing its original username');

      let user = users.get(username.toLowerCase());
      if (!user) {
        const result = await client.query(
          'SELECT id, username FROM users WHERE lower(username) = lower($1) LIMIT 1',
          [username]
        );
        user = result.rows[0];
        if (!user) throw inputError(`Legacy user "${username}" does not exist in the new database`);
        users.set(username.toLowerCase(), user);
      }

      const legacyProductId = entry.productId ?? entry.product_id;
      let productId = legacyProductId === undefined || legacyProductId === null
        ? null
        : productIds.get(String(legacyProductId));
      if (!productId) {
        const productName = entry.productName || entry.product_name;
        if (typeof productName === 'string' && productName.trim()) {
          const productResult = await client.query(
            'SELECT id FROM products WHERE lower(name) = lower($1) LIMIT 1',
            [normalizeProductName(productName)]
          );
          productId = productResult.rows[0]?.id;
        }
      }
      if (!productId) throw inputError(`Could not match a product for a legacy entry belonging to "${username}"`);

      const entryDate = entry.date || entry.entry_date;
      const entryTime = entry.time || entry.entry_time;
      const shift = typeof entry.shift === 'string' ? entry.shift.trim().toLowerCase() : '';
      if (!validDate(entryDate) || !validTime(entryTime) || !['morning', 'night'].includes(shift)) {
        throw inputError(`A legacy entry for "${username}" has an invalid date, time, or shift`);
      }

      const opening = nullableNumber(entry.opening, 'opening');
      const received = nullableNumber(entry.received, 'received') ?? 0;
      const disbursed = nullableNumber(entry.disbursed, 'disbursed') ?? 0;
      const damaged = nullableNumber(entry.damaged, 'damaged') ?? 0;
      const closing = nullableNumber(entry.closing, 'closing');
      const variance = nullableNumber(entry.variance, 'variance') ?? 0;
      if (closing === null) throw inputError(`A legacy entry for "${username}" is missing its closing quantity`);

      const values = [productId, user.id, opening, received, disbursed, damaged, closing, variance, shift, entryDate, entryTime];
      const duplicate = await client.query(
        `SELECT id FROM entries
         WHERE product_id = $1 AND user_id = $2 AND entry_date = $10
         LIMIT 1`,
        values
      );
      if (duplicate.rows.length > 0) continue;

      const inserted = await client.query(
        `INSERT INTO entries
          (product_id, user_id, opening, received, disbursed, damaged, closing, variance, shift, entry_date, entry_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        values
      );
      const savedEntry = inserted.rows[0];
      entriesImported += 1;
      await writeAuditLog(client, {
        userId: req.user.id,
        action: 'CREATE',
        tableName: 'entries',
        recordId: savedEntry.id,
        values: { ...savedEntry, user_name: user.username },
        ipAddress: req.ip
      });
    }

    await client.query(
      `UPDATE legacy_imports
       SET products_imported = $1, entries_imported = $2
       WHERE import_id = $3`,
      [productsImported, entriesImported, importId]
    );
    await client.query('COMMIT');
    transactionStarted = false;
    res.json({ alreadyImported: false, productsImported, entriesImported });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Failed to roll back legacy data import:', rollbackError);
      }
    }
    console.error('Legacy data import failed:', error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Legacy data import failed'
    });
  } finally {
    client.release();
  }
};

module.exports = { importLegacyData };
