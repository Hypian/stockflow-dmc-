const express = require('express');
const router = express.Router();
const { 
  getDamageReport, 
  getStockComparison, 
  getInventorySummary, 
  getMovementTrends, 
  getLossReport 
} = require('../controllers/reportController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// All report routes are protected and admin only
router.use(protect);
router.use(adminOnly);

router.get('/damages', getDamageReport);
router.get('/comparison', getStockComparison);
router.get('/summary', getInventorySummary);
router.get('/trends', getMovementTrends);
router.get('/loss', getLossReport);

module.exports = router;
