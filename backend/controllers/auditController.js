const { query } = require('../config/db');
const { logAudit } = require('../services/auditService');

// @desc    Get all audit logs
// @route   GET /api/audit
// @access  Private/Admin
const getAuditLogs = async (req, res) => {
  try {
    const result = await query(`
      SELECT a.*, u.name as user_name 
      FROM audit_logs a 
      LEFT JOIN users u ON a.user_id = u.id 
      ORDER BY a.timestamp DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error retrieving audit logs' });
  }
};

module.exports = {
  getAuditLogs
};
