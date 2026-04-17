const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { logAudit } = require('../services/auditService');

// Helper to generate JWT
const generateToken = (id, role, username) => {
  return jwt.sign({ id, role, username }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public (or Admin only depending on your flow)
const registerUser = async (req, res) => {
  const { name, username, password, role } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Please add all fields' });
  }

  try {
    // Check if user exists
    const userExists = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await query(
      'INSERT INTO users (name, username, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, username, role',
      [name, username, hashedPassword, role || 'user']
    );

    const user = newUser.rows[0];

    // Audit Log (System action, or Admin action if done while logged in)
    // If this route is public, the user_id is the newly created user's ID.
    await logAudit({
      userId: user.id,
      action: 'CREATE',
      tableName: 'users',
      recordId: user.id,
      newValues: { name: user.name, username: user.username, role: user.role },
      ipAddress: req.ip
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      token: generateToken(user.id, user.role, user.username),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during registration' });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    // Find User
    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    // Check password
    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        token: generateToken(user.id, user.role, user.username),
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during login' });
  }
};

module.exports = {
  registerUser,
  loginUser,
};
