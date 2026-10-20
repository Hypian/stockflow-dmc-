const express = require('express');
const router = express.Router();
const { getEntries, createEntry, updateEntry, deleteEntry } = require('../controllers/inventoryController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { importLegacyData } = require('../controllers/legacyImportController');

// All inventory routes are protected
router.use(protect);

router.route('/entries')
  .get(getEntries)
  .post(createEntry);

router.route('/entries/:id')
  .put(updateEntry)
  .delete(adminOnly, deleteEntry);

router.post('/legacy-import', importLegacyData);

// Product Routes
const { getProducts, createProduct, updateProduct, deleteProduct } = require('../controllers/productController');

router.route('/products')
  .get(getProducts)
  .post(adminOnly, createProduct);

router.route('/products/:id')
  .put(adminOnly, updateProduct)
  .delete(adminOnly, deleteProduct);

module.exports = router;
