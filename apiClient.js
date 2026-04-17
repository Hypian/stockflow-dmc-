/**
 * StockFlow API Client
 * Centralized fetch logic for the Node.js / PostgreSQL backend.
 */

const API_BASE_URL = 'http://localhost:5000/api';

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

  // ── INVENTORY ENTRIES ──────────────────────────────────────────
  getEntries: async () => {
    const data = await API.request('/inventory/entries', 'GET');
    return data.map(e => ({
      ...e,
      userId: e.user_id,
      productId: e.product_id,
      date: e.entry_date,
      time: e.entry_time,
      userName: e.user_name,
      productName: e.product_name,
      total: Number(e.opening) + Number(e.received) - Number(e.damaged) - Number(e.disbursed || 0)
    }));
  },

  createEntry: async (entryData) => {
    const res = await API.request('/inventory/entries', 'POST', entryData);
    return { 
      ...res, 
      userId: res.user_id,
      productId: res.product_id, 
      date: res.entry_date,
      time: res.entry_time 
    };
  },

  updateEntry: async (id, updateData) => {
    const res = await API.request(`/inventory/entries/${id}`, 'PUT', updateData);
    return { 
      ...res, 
      userId: res.user_id,
      productId: res.product_id, 
      date: res.entry_date,
      time: res.entry_time 
    };
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

