const { query } = require('../config/db');
const { logAudit } = require('../services/auditService');

const normalizeProductName = (name) => {
  if (!name) return '';
  const cleaned = name.trim().replace(/\s+/g, ' ');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
};

// @desc    Get all products
// @route   GET /api/inventory/products
// @access  Private
const getProducts = async (req, res) => {
  try {
    const result = await query('SELECT * FROM products ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error retrieving products' });
  }
};

// @desc    Create a product
// @route   POST /api/inventory/products
const createProduct = async (req, res) => {
  let { name, unit, active, unitPrice } = req.body;
  try {
    name = normalizeProductName(name);
    if (!name) {
      return res.status(400).json({ error: 'Product name is required' });
    }
    
    unitPrice = Number(unitPrice) || 0;

    // Prevent duplicate product names by merging with existing product
    const duplicate = await query('SELECT * FROM products WHERE lower(name) = lower($1)', [name]);
    if (duplicate.rows.length > 0) {
      const existingProduct = duplicate.rows[0];
      return res.status(200).json(existingProduct);
    }

    const result = await query(
      'INSERT INTO products (name, unit, unit_price, active) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, unit, unitPrice, active !== undefined ? active : true]
    );
    const product = result.rows[0];

    await logAudit({
      userId: req.user.id,
      action: 'CREATE',
      tableName: 'products',
      recordId: product.id,
      newValues: product,
      ipAddress: req.ip
    });

    res.status(201).json(product);
  } catch (error) {
    console.error('createProduct Error:', error);
    res.status(500).json({ error: 'Server error creating product' });
  }
};

// @desc    Update a product
// @route   PUT /api/inventory/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  const { id } = req.params;
  let { name, unit, active, unitPrice } = req.body;

  try {
    name = normalizeProductName(name);
    unitPrice = Number(unitPrice) || 0;
    
    const existing = await query('SELECT * FROM products WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Product not found' });

    const duplicate = await query(
      'SELECT * FROM products WHERE lower(name) = lower($1) AND id <> $2',
      [name, id]
    );
    if (duplicate.rows.length > 0) {
      return res.status(400).json({ error: 'A product with this name already exists' });
    }

    const result = await query(
      'UPDATE products SET name = $1, unit = $2, unit_price = $3, active = $4 WHERE id = $5 RETURNING *',
      [name, unit, unitPrice, active, id]
    );
    const product = result.rows[0];

    await logAudit({
      userId: req.user.id,
      action: 'UPDATE',
      tableName: 'products',
      recordId: id,
      oldValues: existing.rows[0],
      newValues: product,
      ipAddress: req.ip
    });

    res.json(product);
  } catch (error) {
    console.error('updateProduct Error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'A product with this name already exists' });
    }
    res.status(500).json({ error: 'Server error updating product' });
  }
};

// @desc    Delete a product
// @route   DELETE /api/inventory/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await query('SELECT * FROM products WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Product not found' });

    await query('DELETE FROM products WHERE id = $1', [id]);

    await logAudit({
      userId: req.user.id,
      action: 'DELETE',
      tableName: 'products',
      recordId: id,
      oldValues: existing.rows[0],
      ipAddress: req.ip
    });

    res.json({ message: 'Product deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error deleting product' });
  }
};

module.exports = {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct
};
