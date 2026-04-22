/**
 * StockFlow API Client
 * Centralized fetch logic for the Node.js / PostgreSQL backend.
 */

const API_BASE_URL = (() => {
  const configured = (window.STOCKFLOW_API_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');

  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return isLocalhost ? 'http://localhost:5000/api' : 'https://stockflow-dmc.onrender.com/api';
})();

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

    const config = { method, headers };
    if (body) {
      config.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      const data = await response.json();
      
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
      console.error(`API Error (${endpoint}):`, error);
      throw error;
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
    const opening = Number(e.opening) || 0;
    const received = Number(e.received) || 0;
    const disbursed = Number(e.disbursed) || 0;
    const damaged = Number(e.damaged) || 0;
    const closing = Number(e.closing) || 0;
    const variance = Number(e.variance) || 0;

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
  }
};
