/**
 * StockFlow API Client
 * Centralized fetch logic for the Node.js / PostgreSQL backend.
 */

const API_BASE_URL = (() => {
  const configured = (window.STOCKFLOW_API_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');

  const isLocalhost = [
    'localhost', 
    '127.0.0.1', 
    '::1', 
    '', // file protocol
    '0.0.0.0'
  ].includes(window.location.hostname) || 
  window.location.hostname.startsWith('192.168.') ||
  window.location.hostname.startsWith('10.') ||
  window.location.hostname.startsWith('172.');

  return isLocalhost ? 'http://localhost:5000/api' : 'https://stockflow-dmc.onrender.com/api';
})();
const API_TIMEOUT_MS = 12000;

const API = {
  // Get token helper
  getToken: () => localStorage.getItem('sf_token'),

  // Generic request handler with error checking
  request: async (endpoint, method = 'GET', body = null) => {
    const headers = { 'Content-Type': 'application/json' };
    const token = API.getToken();
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const config = { method, headers, signal: controller.signal };
    if (body) {
      config.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      
      if (response.status === 401) {
        // Token expired or invalid - clear session and reload
        API.logout();
        localStorage.removeItem('sf_current_session');
        window.location.reload(); 
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'API Request Failed');
      }
      
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${Math.floor(API_TIMEOUT_MS / 1000)}s. Please verify backend connectivity.`);
      }
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  // ── AUTHENTICATION ──────────────────────────────────────────────
  login: async (username, password) => {
    const data = await API.request('/auth/login', 'POST', { username, password });
    localStorage.setItem('sf_token', data.token);
    return data;
  },
  
  register: async (name, username, password, role = 'user') => {
    const data = await API.request('/auth/register', 'POST', { name, username, password, role });
    localStorage.setItem('sf_token', data.token);
    return data;
  },

  logout: () => {
    localStorage.removeItem('sf_token');
  },

  // Helper to map DB record to frontend entry object with correct types
  mapEntry: (e) => {
    const opening = e.opening === null ? null : Number(e.opening);
    const received = e.received === null ? 0 : Number(e.received);
    const disbursed = e.disbursed === null ? 0 : Number(e.disbursed);
    const damaged = e.damaged === null ? 0 : Number(e.damaged);
    const closing = e.closing === null ? null : Number(e.closing);
    const variance = e.variance === null ? null : Number(e.variance);

    return {
      ...e,
      opening, received, disbursed, damaged, closing, variance,
      userId: e.user_id,
      productId: e.product_id,
      date: e.entry_date,
      time: e.entry_time,
      userName: e.user_name,
      productName: e.product_name,
      shift: (e.shift || '').trim().toLowerCase(),
      expected: opening + received - damaged - disbursed,
      total: closing
    };
  },

  getEntries: async () => {
    const data = await API.request('/inventory/entries', 'GET');
    return data.map(API.mapEntry);
  },

  createEntry: async (entryData) => {
    const res = await API.request('/inventory/entries', 'POST', entryData);
    return API.mapEntry(res);
  },

  updateEntry: async (id, updateData) => {
    const res = await API.request(`/inventory/entries/${id}`, 'PUT', updateData);
    return API.mapEntry(res);
  },

  deleteEntry: async (id) => {
    return await API.request(`/inventory/entries/${id}`, 'DELETE');
  },

  // ── PRODUCTS ───────────────────────────────────────────────────
  getProducts: async () => {
    return await API.request('/inventory/products', 'GET');
  },

  saveProduct: async (id, productData) => {
    if (id) {
      return await API.request(`/inventory/products/${id}`, 'PUT', productData);
    } else {
      return await API.request('/inventory/products', 'POST', productData);
    }
  },

  deleteProduct: async (id) => {
    return await API.request(`/inventory/products/${id}`, 'DELETE');
  },

  // ── AUDIT LOGS ─────────────────────────────────────────────────
  getAuditLogs: async () => {
    return await API.request('/audit', 'GET');
  },

  // ── REPORTS ────────────────────────────────────────────────────
  getReport: async (type, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return await API.request(`/reports/${type}${qs ? '?' + qs : ''}`, 'GET');
  }
};
