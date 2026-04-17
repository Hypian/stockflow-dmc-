const { query } = require('../config/db');

/**
 * Creates an append-only audit log entry.
 * 
 * @param {Object} params
 * @param {number} params.userId - ID of the user performing the action
 * @param {string} params.action - 'CREATE', 'UPDATE', or 'DELETE'
 * @param {string} params.tableName - Name of the affected table
 * @param {number} params.recordId - ID of the affected record
 * @param {Object} [params.oldValues] - State before the action (null for CREATE)
 * @param {Object} [params.newValues] - State after the action (null for DELETE)
 * @param {string} [params.ipAddress] - IP address of the requester
 */
const logAudit = async ({ userId, action, tableName, recordId, oldValues = null, newValues = null, ipAddress = null }) => {
  try {
    const sql = `
      INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    await query(sql, [
      userId,
      action,
      tableName,
      recordId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      ipAddress
    ]);
  } catch (error) {
    console.error('Failed to write audit log:', error);
    // Depending on strictness, you might want to throw the error to rollback the main transaction
    // throw new Error('Audit logging failed'); 
  }
};

module.exports = { logAudit };
