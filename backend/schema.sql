-- Core User Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user', -- 'admin', 'user'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Products Catalogue
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    unit_price NUMERIC DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_unique ON products (lower(name));

-- Stock Entries (Main Data)
CREATE TABLE IF NOT EXISTS entries (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    opening NUMERIC DEFAULT 0,
    received NUMERIC DEFAULT 0,
    disbursed NUMERIC DEFAULT 0,
    damaged NUMERIC DEFAULT 0,
    closing NUMERIC NOT NULL,
    variance NUMERIC DEFAULT 0,
    shift VARCHAR(20) NOT NULL, -- 'morning', 'night'
    entry_date DATE NOT NULL,
    entry_time TIME NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Append-Only Audit Log
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(20) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER NOT NULL,
    old_values JSONB, -- Previous state
    new_values JSONB, -- New state
    ip_address VARCHAR(45),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create an index on audit logs for faster searching
CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_logs(table_name, record_id);

-- Performance Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_entries_product_id ON entries (product_id);
CREATE INDEX IF NOT EXISTS idx_entries_entry_date ON entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_entries_product_date ON entries (product_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_entries_sorting ON entries (product_id, entry_date DESC, entry_time DESC, created_at DESC);
