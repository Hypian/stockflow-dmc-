/* ════════════════════════════════════════════════════════════════════════════
  STOCKFLOW — FULL APPLICATION LOGIC
  ════════════════════════════════════════════════════════════════════════════ */

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const USERS = [
  { id: 1, username: 'rusine', password: 'rusine123', role: 'admin', name: 'Rusine Peggy', avatar: 'RP' },
  { id: 2, username: 'john', password: 'john123', role: 'user', name: 'John Rwamanywa', avatar: 'JR' },
  { id: 3, username: 'binama', password: 'binama123', role: 'user', name: 'Binama David', avatar: 'BD' },
];

const DEFAULT_PRODUCTS = [];

// ── STATE ────────────────────────────────────────────────────────────────────
let currentUser = null;
let sessionShift = null;  // Shift at login time - preserved across accidental logouts
let confirmCallback = null;
let editingEntryId = null;
// ── IN-MEMORY DB STATE (Loaded from API) ──────────────────────────────────
let db_products = [];
let db_entries = [];
let db_audit_logs = [];

// ── AUTO-POLLING ──────────────────────────────────────────────────────────
let currentPollingInterval = null;
const POLL_INTERVAL = 15000; // 15 seconds

function stopProductPolling() {
  if (currentPollingInterval) {
    clearInterval(currentPollingInterval);
    currentPollingInterval = null;
  }
}

function startProductPolling(page) {
  stopProductPolling();

  const pagesWithProducts = ['admin-products', 'user-dashboard', 'admin-stock'];
  if (!pagesWithProducts.includes(page)) return;

  currentPollingInterval = setInterval(async () => {
    try {
      const freshProducts = await API.getProducts();

      // Check if products changed (using length and simple id+active check for speed)
      let productsChanged = freshProducts.length !== db_products.length;
      if (!productsChanged) {
        for (let i = 0; i < freshProducts.length; i++) {
          if (freshProducts[i].id !== db_products[i].id || freshProducts[i].active !== db_products[i].active) {
            productsChanged = true;
            break;
          }
        }
      }

      if (productsChanged) {
        db_products = freshProducts;

        // Re-render the current page components if needed
        const currentPage = activePage;
        if (currentPage === 'admin-products') renderProductTable();
        if (currentPage === 'user-dashboard') {
          // Update form dropdown
          const productEl = document.getElementById('f-product');
          if (productEl) {
            const selected = productEl.value;
            productEl.innerHTML = `<option value="">Select a product</option>${db_products.filter(p => p.active).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}`;
            productEl.value = selected;
          }
        }
      }
    } catch (e) {
      console.warn("Product polling error:", e);
    }
  }, POLL_INTERVAL);
}

// ── LOCALSTORAGE HELPERS (Legacy/Config only) ────────────────────────────────
const LS = {
  get: (k, def = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  products: () => db_products,
  entries: () => db_entries,
  saveProducts: () => { }, // Handled directly via API calls now
  saveEntries: () => { }, // Handled directly via API calls now
};

// ── SHIFT SYSTEM ─────────────────────────────────────────────────────────────
function getCurrentShift(date = new Date()) {
  const h = date.getHours();
  // Morning: 10:00 (10am) to 19:00 (7pm). Night: 19:00 to 10:00.
  return (h >= 10 && h < 19) ? 'morning' : 'night';
}
function getShiftLabel(shift) {
  return shift === 'morning' ? '☀️ Morning Shift (10:00–19:00)' : '🌙 Night Shift (19:00–10:00)';
}
function getShiftBadgeHTML(shift) {
  const cls = shift === 'morning' ? 'badge-amber' : 'badge-purple';
  const icon = shift === 'morning' ? 'fa-sun' : 'fa-moon';
  const label = shift === 'morning' ? 'Morning Shift' : 'Night Shift';
  return `<span class="badge ${cls}"><i class="fa-solid ${icon}"></i> ${label}</span>`;
}

// ── CLOCK ────────────────────────────────────────────────────────────────────
let lastClockTime = '';
function startClock() {
  const clockEl = document.getElementById('clock-display');
  const shiftBadgeEl = document.getElementById('header-shift-badge');
  const sidebarShiftEl = document.getElementById('sidebar-shift');

  function tick() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
    const fullTime = `${date} · ${time}`;

    if (fullTime !== lastClockTime) {
      if (clockEl) clockEl.textContent = fullTime;
      lastClockTime = fullTime;

      const shift = getCurrentShift(now);
      if (shiftBadgeEl) shiftBadgeEl.innerHTML = getShiftBadgeHTML(shift);
      updateSidebarShift(shift, sidebarShiftEl);
    }
  }
  tick(); setInterval(tick, 1000);
}

function updateSidebarShift(shift, el) {
  if (!el) return;
  const dotCls = shift === 'morning' ? 'shift-morning' : 'shift-night';
  const label = shift === 'morning' ? 'Morning Shift' : 'Night Shift';
  const time = shift === 'morning' ? '10:00 – 19:00' : '19:00 – 10:00';
  el.innerHTML = `<div class="flex items-center gap-2">
    <span class="shift-dot ${dotCls}"></span>
    <div class="sidebar-logo-text"><div class="text-xs font-600 text-white">${label}</div>
    <div class="text-xs text-slate-500">${time}</div></div></div>`;
}

// ── DEBOUNCE UTILITY ─────────────────────────────────────────────────────────
function debounce(fn, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

// Global debounced search functions
const debouncedAdminStockTable = debounce(() => renderAdminStockTable(), 300);
const debouncedProductTable = debounce(() => renderProductTable(), 300);
const debouncedUserEntriesTable = debounce(() => renderUserEntriesTable(), 300);

// ── AUTH ─────────────────────────────────────────────────────────────────────
function togglePass() {
  const inp = document.getElementById('login-pass');
  const eye = document.getElementById('pass-eye');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  eye.className = inp.type === 'password' ? 'fa-solid fa-eye text-sm' : 'fa-solid fa-eye-slash text-sm';
}

async function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;

  if (!u || !p) {
    showToast('Please enter both username and password', 'error');
    shakeInput();
    return;
  }

  const btn = document.querySelector('#login-screen button.btn-primary');
  const orgHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
  btn.disabled = true;

  try {
    const data = await API.login(u, p);
    const now = new Date();
    const shift = getCurrentShift(now);

    currentUser = {
      id: data.id || null,
      name: data.name || 'User',
      username: data.username || '',
      role: data.role || 'user',
      token: data.token,
      loginTime: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      loginDate: getWorkingDate()
    };
    sessionShift = shift;  // Store shift at login

    LS.set('sf_current_session', currentUser);
    LS.set('sf_session_shift', shift);  // Persist shift for accidental logout recovery

    // Fetch data before letting them in
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading Data...';
    try {
      db_products = await API.request('/inventory/products', 'GET');
      db_entries = await API.getEntries();
    } catch (err) {
      console.error(err);
      // We continue even if empty, to not block login completely
    }

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    buildSidebar();
    startClock();
    navigateTo(currentUser.role === 'admin' ? 'admin-home' : 'user-dashboard');
    showToast(`Welcome back, ${currentUser.name.split(' ')[0]}! 👋`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
    shakeInput();
  } finally {
    btn.innerHTML = orgHtml;
    btn.disabled = false;
  }
}

function shakeInput() {
  const card = document.querySelector('#login-screen .glass');
  card.style.animation = 'none';
  setTimeout(() => { card.style.animation = ''; card.classList.add('animate-slide-in'); }, 10);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('login-screen').classList.contains('hidden')) doLogin();
});

// ── LOGOUT ────────────────────────────────────────────────────────────────────
function confirmLogout() {
  if (currentUser.role === 'admin') {
    showConfirm('Sign Out', 'Are you sure you want to sign out?', () => doLogout(), 'fa-arrow-right-from-bracket', 'rgba(245,158,11,0.1)', '#fbbf24');
  } else {
    showReportOptions('logout');
  }
}
function doLogout() {
  stopProductPolling();  // Stop polling before logging out
  setTimeout(() => {
    API.logout(); // Clear token over API wrapper
    localStorage.removeItem('sf_current_session'); // Clear session metadata
    localStorage.removeItem('sf_session_shift');  // Clear shift tracking
    currentUser = null;
    sessionShift = null;
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
  }, 300);
}

// ── PRINT REPORT ─────────────────────────────────────────────────────────────
function showReportOptions(context = 'normal') {
  const title = context === 'logout' ? 'End Shift & Logout' : 'Shift Report';
  const sub = context === 'logout' ? 'Select an option to generate your report before signing out.' : 'Generate your current shift report below.';

  document.getElementById('modal-content').innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-xl font-800 text-white">${title}</h3>
        <button onclick="closeModal()" class="btn btn-ghost btn-sm p-1.5 rounded-lg"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <p class="text-sm text-slate-400 mb-6">${sub}</p>
      
      <div class="grid grid-cols-1 gap-3">
        ${context === 'logout' ? `
        <button onclick="generateShiftReport('pdf_logout', '${context}')" class="btn justify-center py-4 text-base glow-red" style="background:#dc2626; border-color:#ef4444; color:white;">
          <i class="fa-solid fa-file-pdf text-lg"></i> <span>Download PDF & Logout</span>
        </button>` : `
        <button onclick="generateShiftReport('pdf', '${context}')" class="btn justify-center py-4 text-base glow-red" style="background:#dc2626; border-color:#ef4444; color:white;">
          <i class="fa-solid fa-file-pdf text-lg"></i> <span>Download PDF Report</span>
        </button>`}
        <button onclick="generateShiftReport('print', '${context}')" class="btn btn-primary justify-center py-4 text-base glow-amber">
          <i class="fa-solid fa-print text-lg"></i> <span>Generate & Print PDF</span>
        </button>
        <button onclick="generateShiftReport('csv', '${context}')" class="btn btn-secondary justify-center py-4 text-base">
          <i class="fa-solid fa-file-csv text-lg text-brand"></i> <span>Download CSV Report</span>
        </button>
      </div>
      
      <div class="mt-6 pt-6 border-t border-white/5 flex gap-3">
        <button onclick="closeModal()" class="btn btn-ghost flex-1 justify-center">Cancel</button>
        ${context === 'logout' ? `<button onclick="doLogout()" class="btn btn-danger flex-1 justify-center">Exit Without Report</button>` : ''}
      </div>
    </div>`;
  openModal();
}

function generateShiftReport(type, context = 'normal') {
  const entries = db_entries.filter(e => e.userId === currentUser.id && e.date === getWorkingDate());

  if (entries.length === 0) {
    showToast('No entries recorded for today yet.', 'warn');
    return;
  }

  if (type === 'print') {
    printShiftReport(entries);
  } else if (type === 'pdf') {
    downloadShiftPDF(entries, false);
  } else if (type === 'pdf_logout') {
    downloadShiftPDF(entries, true);
  } else {
    downloadShiftCSV(entries);
  }

  closeModal();

  if (context === 'logout' && type !== 'pdf_logout') {
    setTimeout(() => {
      showConfirm(
        'Shift Report Completed',
        'Your report has been generated. Would you like to sign out of the system now?',
        () => doLogout(),
        'fa-arrow-right-from-bracket', 'rgba(245,158,11,0.1)', '#fbbf24'
      );
    }, 1000);
  }
}

function downloadShiftPDF(today, autoLogout = false) {
  const now = new Date();
  const rows = today.map(e => `
    <tr>
      <td style="padding:10px;border:1px solid #ddd;font-weight:600;">${e.productName}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;">${e.opening}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;">${e.received}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;color:#b45309;">${e.disbursed || 0}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;color:#ef4444;">${e.damaged}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;">${e.closing}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;font-weight:700;">${e.total}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;">${e.variance !== 0 ? '⚠ ' + e.variance : '✓ 0'}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;font-size:8pt;color:#666;">${e.time}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;text-transform:capitalize;">${e.shift}</td>
    </tr>`).join('');

  const content = document.createElement('div');
  content.style.background = '#fff';
  content.style.padding = '20px';
  content.innerHTML = `
    <div class="print-section" style="font-family:'Sora',Arial,sans-serif; max-width:1000px; margin:0 auto; color:#111;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #111;padding-bottom:20px;margin-bottom:24px;">
        <div>
          <h1 style="margin:0;font-size:28pt;font-weight:900;letter-spacing:-1px;text-transform:uppercase;">StockFlow</h1>
          <p style="margin:0;font-size:10pt;color:#555;font-weight:500;">PREMIUM INVENTORY MANAGEMENT SYSTEM</p>
        </div>
        <div style="text-align:right;">
          <div style="font-size:16pt;font-weight:800;color:#000;">DAILY SHIFT REPORT</div>
          <div style="font-size:9pt;color:#444;margin-top:4px;">Generation Date: <strong>${now.toLocaleString('en-GB')}</strong></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:30px;background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
        <div><div style="font-size:8pt;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Responsible Staff</div><div style="font-size:12pt;font-weight:700;color:#0f172a;">${currentUser.name}</div></div>
        <div><div style="font-size:8pt;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Report Date</div><div style="font-size:12pt;font-weight:700;color:#0f172a;">${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>
        <div><div style="font-size:8pt;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Shift Period</div><div style="font-size:11pt;font-weight:700;color:#0f172a;">${getShiftLabel(sessionShift || getCurrentShift())}</div></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin-bottom:30px;">
        <thead>
          <tr style="background:#1e293b;color:#fff;">
            <th style="padding:12px 10px;text-align:left;border:1px solid #334155;">Product Description</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Opening</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Received</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Stock Out</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Damaged</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Closing</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Remaining</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Variance</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Time</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Shift</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:60px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:50px;">
        <div style="text-align:center;">
          <div style="height:50px;margin-bottom:10px;"></div>
          <div style="border-top:2px solid #111;padding-top:10px;font-weight:800;font-size:9pt;">STAFF: ${currentUser.name.toUpperCase()}</div>
        </div>
        <div style="text-align:center;">
          <div style="height:50px;margin-bottom:10px;"></div>
          <div style="border-top:2px solid #111;padding-top:10px;font-weight:800;font-size:9pt;">SUPERVISOR SIGNATURE</div>
        </div>
        <div style="text-align:center;">
          <div style="height:50px;margin-bottom:10px;display:flex;align-items:center;justify-content:center;font-size:24pt;opacity:0.1;"><i class="fa-solid fa-stamp"></i></div>
          <div style="border-top:2px solid #111;padding-top:10px;font-weight:800;font-size:9pt;">OFFICIAL STAMP & DATE</div>
        </div>
      </div>
      <div style="margin-top:80px;text-align:center;font-size:8pt;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:20px;">
        This is an official document generated by StockFlow Inventory System. Path: Reports/Shift/${getWorkingDate().replace(/-/g, '/')}/${currentUser.id}
      </div>
    </div>`;

  showToast('Generating PDF...', 'info', 3000);

  const opt = {
    margin: [10, 10, 10, 10],
    filename: `StockFlow_Shift_Report_${currentUser.name.replace(/\s+/g, '_')}_${getWorkingDate()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };

  html2pdf().set(opt).from(content).save().then(() => {
    showToast('PDF downloaded successfully!', 'success');
    if (autoLogout) {
      setTimeout(() => doLogout(), 1000);
    }
  }).catch(err => {
    console.error('PDF generation failed:', err);
    showToast('PDF generation failed. Fall back to Print Report.', 'error');
  });
}

function printShiftReport(today) {
  const area = document.getElementById('print-area');
  const now = new Date();

  const rows = today.map(e => `
    <tr>
      <td style="padding:10px;border:1px solid #ddd;font-weight:600;">${e.productName}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;">${e.opening}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;">${e.received}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;color:#b45309;">${e.disbursed || 0}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;color:#ef4444;">${e.damaged}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;">${e.closing}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;font-weight:700;">${e.total}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;">${e.variance !== 0 ? `⚠ ${e.variance}` : '✓ 0'}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;font-size:8pt;color:#666;">${e.time}</td>
      <td style="padding:10px;border:1px solid #ddd;text-align:center;text-transform:capitalize;">${e.shift}</td>
    </tr>`).join('');

  const totalDamaged = today.reduce((s, e) => s + Number(e.damaged), 0);
  const totalDisbursed = today.reduce((s, e) => s + Number(e.disbursed || 0), 0);
  const totalStock = today.reduce((s, e) => s + Number(e.total), 0);

  area.innerHTML = `
    <div class="print-section" style="font-family:'Sora',Arial,sans-serif; max-width:1000px; margin:0 auto; color:#111;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #111;padding-bottom:20px;margin-bottom:24px;">
        <div>
          <h1 style="margin:0;font-size:28pt;font-weight:900;letter-spacing:-1px;text-transform:uppercase;">StockFlow</h1>
          <p style="margin:0;font-size:10pt;color:#555;font-weight:500;">PREMIUM INVENTORY MANAGEMENT SYSTEM</p>
        </div>
        <div style="text-align:right;">
          <div style="font-size:16pt;font-weight:800;color:#000;">DAILY SHIFT REPORT</div>
          <div style="font-size:9pt;color:#444;margin-top:4px;">Generation Date: <strong>${now.toLocaleString('en-GB')}</strong></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:30px;background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
        <div><div style="font-size:8pt;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Responsible Staff</div><div style="font-size:12pt;font-weight:700;color:#0f172a;">${currentUser.name}</div></div>
        <div><div style="font-size:8pt;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Report Date</div><div style="font-size:12pt;font-weight:700;color:#0f172a;">${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>
        <div><div style="font-size:8pt;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Shift Period</div><div style="font-size:11pt;font-weight:700;color:#0f172a;">${getShiftLabel(sessionShift || getCurrentShift())}</div></div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin-bottom:30px;">
        <thead>
          <tr style="background:#1e293b;color:#fff;">
            <th style="padding:12px 10px;text-align:left;border:1px solid #334155;">Product Description</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Opening</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Received</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Stock Out</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Damaged</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Closing</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Remaining</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Variance</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Time</th>
            <th style="padding:12px 10px;text-align:center;border:1px solid #334155;">Shift</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div style="margin-top:60px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:50px;">
        <div style="text-align:center;">
          <div style="height:50px;margin-bottom:10px;"></div>
          <div style="border-top:2px solid #111;padding-top:10px;font-weight:800;font-size:9pt;">STAFF: ${currentUser.name.toUpperCase()}</div>
        </div>
        <div style="text-align:center;">
          <div style="height:50px;margin-bottom:10px;"></div>
          <div style="border-top:2px solid #111;padding-top:10px;font-weight:800;font-size:9pt;">SUPERVISOR SIGNATURE</div>
        </div>
        <div style="text-align:center;">
          <div style="height:50px;margin-bottom:10px;display:flex;align-items:center;justify-content:center;font-size:24pt;opacity:0.1;"><i class="fa-solid fa-stamp"></i></div>
          <div style="border-top:2px solid #111;padding-top:10px;font-weight:800;font-size:9pt;">OFFICIAL STAMP & DATE</div>
        </div>
      </div>
      
      <div style="margin-top:80px;text-align:center;font-size:8pt;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:20px;">
        This is an official document generated by StockFlow Inventory System. Path: Reports/Shift/${getWorkingDate().replace(/-/g, '/')}/${currentUser.id}
      </div>
    </div>`;
  window.print();
}

function downloadShiftCSV(today) {
  const headers = ['Product', 'Opening', 'Received', 'Stock Out', 'Damaged', 'Closing', 'Remaining', 'Variance', 'Time', 'Shift'];
  const rows = today.map(e => [
    e.productName, e.opening, e.received, e.disbursed || 0, e.damaged, e.closing, e.total, e.variance, e.time, e.shift
  ]);

  let csvContent = "data:text/csv;charset=utf-8,"
    + headers.join(",") + "\n"
    + rows.map(r => r.map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(",")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `StockFlow_Report_${currentUser.name.replace(/\s+/g, '_')}_${getWorkingDate()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('CSV Report Downloaded', 'success');
}

// ── DATE HELPER ───────────────────────────────────────────────────────────────
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function getWorkingDate(date = new Date()) {
  const d = new Date(date);
  const h = d.getHours();
  // Shifts: Morning (10-19), Night (19-10).
  // If it's before 10:00 AM, we are still on the "Night Shift" of the previous day.
  if (h < 10) {
    d.setDate(d.getDate() - 1);
  }
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── SIDEBAR BUILD ─────────────────────────────────────────────────────────────
function buildSidebar() {
  // User info
  document.getElementById('sidebar-user').innerHTML = `
    <div class="sidebar-logo-text min-w-0">
      <div class="text-sm font-600 text-white truncate">${currentUser.name}</div>
      <div class="text-xs text-slate-500 capitalize">${currentUser.role}</div>
    </div>`;

  const adminNav = [
    { id: 'admin-home', icon: 'fa-gauge-high', label: 'Dashboard' },
    { id: 'admin-stock', icon: 'fa-table-list', label: 'Stock Entries' },
    { id: 'admin-products', icon: 'fa-box-open', label: 'Products' },
    { id: 'admin-audit', icon: 'fa-magnifying-glass-chart', label: 'Audit & Reports' },
    { id: 'admin-analytics', icon: 'fa-chart-line', label: 'Analytics' },
  ];
  const userNav = [
    { id: 'user-dashboard', icon: 'fa-gauge-high', label: 'Dashboard' },
    { id: 'user-entries', icon: 'fa-clipboard-list', label: 'My Entries' },
  ];
  const nav = currentUser.role === 'admin' ? adminNav : userNav;
  document.getElementById('sidebar-nav').innerHTML = nav.map(item => `
    <div class="nav-item" id="nav-${item.id}" onclick="navigateTo('${item.id}')">
      <i class="nav-icon fa-solid ${item.icon} w-4 text-center text-sm"></i>
      <span class="nav-label">${item.label}</span>
    </div>`).join('');
}

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
  document.getElementById('main-content').style.marginLeft = sidebarCollapsed ? '72px' : '260px';
}
function openSidebar() {
  document.getElementById('sidebar').classList.add('mobile-open');
  document.getElementById('sidebar-overlay').classList.remove('hidden');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
// ── NAVIGATION ────────────────────────────────────────────────────────────────
let activePage = '';

async function navigateTo(page, force = false) {
  if (!force && activePage === page) return;
  activePage = page;

  // Stop any existing polling before navigating
  stopProductPolling();

  // Update active nav
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + page);
  if (navEl) navEl.classList.add('active');

  const titles = {
    'admin-home': ['Dashboard', 'Overview of your inventory system'],
    'admin-stock': ['Stock Entries', 'All recorded stock activity'],
    'admin-products': ['Product Management', 'Manage your product catalogue'],
    'admin-audit': ['Audit Logs', 'Secure audit trail of all system changes'],
    'admin-analytics': ['Analytics', 'Visual insights and trends'],
    'user-dashboard': ['Stock Entry', 'Record today\'s stock activity'],
    'user-entries': ['My Entries', 'Your recorded stock history'],
  };
  const [title, sub] = titles[page] || [page, ''];
  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-sub');
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;

  const container = document.getElementById('pages');
  
  // RENDER IMMEDIATELY with current in-memory data
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'animate-fade-in';
  div.innerHTML = renderPage(page);
  container.appendChild(div);
  initPage(page);
  startProductPolling(page);

  // BACKGROUND SYNC: Refresh data from API
  const needsRefresh = ['admin-home', 'admin-stock', 'admin-products', 'admin-audit', 'user-dashboard', 'user-entries'];
  if (needsRefresh.includes(page)) {
    try {
      const isInitialFetch = db_entries.length === 0 && db_products.length === 0;
      
      // Parallel fetch for speed
      const promises = [API.getEntries(), API.getProducts()];
      if (page === 'admin-audit') promises.push(API.getAuditLogs());
      
      const [entries, products, auditLogs] = await Promise.all(promises);
      
      // Check if data actually changed to avoid redundant re-renders
      const entriesChanged = JSON.stringify(entries) !== JSON.stringify(db_entries);
      const productsChanged = JSON.stringify(products) !== JSON.stringify(db_products);
      
      db_entries = entries;
      db_products = products;
      if (auditLogs) db_audit_logs = auditLogs;

      // Only re-render if we are still on the same page and data actually changed
      if (activePage === page && (entriesChanged || productsChanged || isInitialFetch)) {
        console.log(`Background sync complete for ${page}, refreshing view...`);
        const freshDiv = document.createElement('div');
        freshDiv.className = 'animate-fade-in';
        freshDiv.innerHTML = renderPage(page);
        container.innerHTML = '';
        container.appendChild(freshDiv);
        initPage(page);
      }
    } catch (e) {
      console.warn("Background sync failed:", e);
    }
  }

  closeSidebar();
}

// ── PAGE RENDERING ─────────────────────────────────────────────────────────────
function renderPage(page) {
  switch (page) {
    case 'admin-home': return renderAdminHome();
    case 'admin-stock': return renderAdminStock();
    case 'admin-products': return renderAdminProducts();
    case 'admin-audit': return renderAdminAudit();
    case 'admin-analytics': return renderAdminAnalytics();
    case 'user-dashboard': return renderUserDashboard();
    case 'user-entries': return renderUserEntries();
    default: return '<p class="text-slate-500">Page not found.</p>';
  }
}

function getLowStockHTML() {
  const entries = db_entries;
  const products = db_products.filter(p => p.active);
  const lowStock = [];

  // Index entries by productId for O(E) pre-processing
  const entriesByProduct = {};
  entries.forEach(e => {
    if (!entriesByProduct[e.productId]) entriesByProduct[e.productId] = [];
    entriesByProduct[e.productId].push(e);
  });

  products.forEach(p => {
    const pEntries = entriesByProduct[p.id];
    if (!pEntries || pEntries.length === 0) return;

    // Find latest entry (pEntries is mostly chronological from API)
    const latest = [...pEntries].sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      return dateCmp !== 0 ? dateCmp : b.time.localeCompare(a.time);
    })[0];

    const currentStock = latest ? Number(latest.closing) : 0;
    const maxHistorical = Math.max(...pEntries.map(e => Number(e.closing)));
    const threshold = maxHistorical * 0.35;

    if (maxHistorical > 0 && currentStock <= threshold && currentStock < maxHistorical) {
      lowStock.push({ name: p.name, stock: currentStock, unit: p.unit, pct: Math.round((currentStock / maxHistorical) * 100) });
    }
  });

  if (lowStock.length === 0) return '';

  lowStock.sort((a, b) => a.stock - b.stock);

  return `
    <div class="glass rounded-xl p-4 glow-red border border-red-500/30 animate-fade-in relative overflow-hidden">
      <div class="absolute right-0 top-0 w-32 h-32 bg-red-500/10 blur-3xl -z-10 rounded-full"></div>
      <div class="flex items-center gap-3 mb-3 relative z-10">
        <div class="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
          <i class="fa-solid fa-triangle-exclamation animate-pulse"></i>
        </div>
        <div>
          <div class="font-700 text-red-400 text-sm">Low Stock Alert (Threshold: 35%)</div>
          <div class="text-xs text-red-400/80">The following items are below 35% of their historical maximum stock level.</div>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 relative z-10">
        ${lowStock.map(p => `
          <span class="chip border-red-500/40 text-red-200 bg-red-500/10 shadow-sm" title="Historical Max: ${Math.round(p.stock / (p.pct / 100)) || '?'}">
            ${p.name}: <strong class="text-white ml-1">${p.stock}</strong> 
            <span class="text-[10px] ml-1 px-1.5 py-0.5 rounded-md bg-red-500/20 font-700">${p.pct}%</span>
          </span>`).join('')}
      </div>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN HOME
// ════════════════════════════════════════════════════════════════════════════
function renderAdminHome() {
  const entries = db_entries;
  const products = db_products;
  const today = entries.filter(e => e.date === getWorkingDate());
  const totalDmg = entries.reduce((s, e) => s + Number(e.damaged || 0), 0);
  const todayDmg = today.reduce((s, e) => s + Number(e.damaged || 0), 0);
  const users = USERS.filter(u => u.role === 'user');

  return `
  <div class="stagger space-y-6">
    ${getLowStockHTML()}
    <!-- Stats Row -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
      ${statCard('fa-boxes-stacked', 'Total Entries', entries.length, 'badge-blue', 'All time')}
      ${statCard('fa-calendar-day', 'Today\'s Entries', today.length, 'badge-green', 'Entries today')}
      ${statCard('fa-triangle-exclamation', 'Total Damaged', totalDmg, 'badge-red', 'All time')}
      ${statCard('fa-share-from-square', 'Total Disbursed', entries.reduce((s, e) => s + Number(e.disbursed || 0), 0), 'badge-brand', 'All time')}
      ${statCard('fa-box-open', 'Active Products', products.filter(p => p.active).length, 'badge-amber', 'In catalogue')}
    </div>

    <!-- Quick Overview Grid -->
    <div class="grid lg:grid-cols-3 gap-4">
      <!-- Recent Activity -->
      <div class="lg:col-span-2 glass rounded-xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div>
            <div class="section-title">Recent Activity</div>
            <div class="section-sub">Latest stock entries across all users</div>
          </div>
          <button onclick="navigateTo('admin-stock')" class="btn btn-ghost btn-sm">View All <i class="fa-solid fa-arrow-right text-xs"></i></button>
        </div>
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead><tr>
              <th>Product</th><th>User</th><th>Remaining</th><th>Damaged</th><th>Shift</th><th>Time</th>
            </tr></thead>
            <tbody>
              ${entries.slice(-8).reverse().map(e => `
              <tr>
                <td class="font-500 text-white">${e.productName}</td>
                <td>${e.userName}</td>
                <td class="mono">${e.total}</td>
                <td><span class="${Number(e.damaged) > 0 ? 'text-red-400' : 'text-slate-500'}">${e.damaged}</span></td>
                <td>${getShiftBadgeHTML(e.shift)}</td>
                <td class="text-slate-500 mono text-xs">${e.date} ${e.time}</td>
              </tr>`).join('') || '<tr><td colspan="6" class="text-center text-slate-500 py-8">No entries yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Users Status -->
      <div class="glass rounded-xl p-5">
        <div class="section-title mb-1">Staff Overview</div>
        <div class="section-sub mb-4">Activity by user today</div>
        <div class="space-y-3">
          ${users.map(u => {
    const userToday = today.filter(e => e.userId === u.id);
    return `
            <div class="glass-hover rounded-xl p-3 cursor-pointer" onclick="navigateTo('admin-stock')">
              <div class="flex items-center gap-3 mb-2">
                <div class="w-8 h-8 rounded-lg bg-brand-700/30 flex items-center justify-center text-xs font-700 text-brand">
                  <i class="fa-solid fa-user"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-600 text-white truncate">${u.name}</div>
                  <div class="text-xs text-slate-500">${userToday.length} entries today</div>
                </div>
                <span class="${userToday.length > 0 ? 'badge-green' : 'badge badge-red'} badge">${userToday.length > 0 ? 'Active' : 'Idle'}</span>
              </div>
              <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, (userToday.length / 10) * 100)}%"></div></div>
            </div>`;
  }).join('')}
        </div>

        <!-- Today's Damage Alert -->
        ${todayDmg > 0 ? `
        <div class="mt-4 glass rounded-xl p-3 glow-red border border-red-500/20">
          <div class="flex items-center gap-2 text-red-400">
            <i class="fa-solid fa-circle-exclamation"></i>
            <span class="text-xs font-600">${todayDmg} units damaged today</span>
          </div>
        </div>` : `
        <div class="mt-4 glass rounded-xl p-3 glow-green border border-green-500/20">
          <div class="flex items-center gap-2 text-green-400">
            <i class="fa-solid fa-circle-check"></i>
            <span class="text-xs font-600">No damage reported today</span>
          </div>
        </div>`}
      </div>
    </div>

    <!-- Shift Summary -->
    <div class="grid sm:grid-cols-2 gap-4">
      ${['morning', 'night'].map(shift => {
    const se = today.filter(e => e.shift === shift);
    const dmg = se.reduce((s, e) => s + Number(e.damaged || 0), 0);
    const cls = shift === 'morning' ? 'badge-amber' : 'badge-purple';
    const icon = shift === 'morning' ? 'fa-sun' : 'fa-moon';
    return `
        <div class="glass rounded-xl p-5">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-xl ${shift === 'morning' ? 'bg-amber-500/10' : 'bg-purple-500/10'} flex items-center justify-center">
              <i class="fa-solid ${icon} ${shift === 'morning' ? 'text-amber-400' : 'text-purple-400'}"></i>
            </div>
            <div>
              <div class="font-600 text-white capitalize">${shift} Shift</div>
              <div class="text-xs text-slate-500">${shift === 'morning' ? '10:00–19:00' : '19:00–10:00'}</div>
            </div>
            <span class="badge ${cls} ml-auto">${se.length} entries</span>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="glass rounded-lg p-3">
              <div class="text-xs text-slate-500">Total Recorded</div>
              <div class="mono text-xl font-700 text-white">${se.reduce((s, e) => s + Number(e.total || 0), 0)}</div>
            </div>
            <div class="glass rounded-lg p-3">
              <div class="text-xs text-slate-500">Damaged</div>
              <div class="mono text-xl font-700 ${dmg > 0 ? 'text-red-400' : 'text-green-400'}">${dmg}</div>
            </div>
          </div>
        </div>`;
  }).join('')}
    </div>
  </div>`;
}

function statCard(icon, label, value, badgeCls, sub, onclick = '') {
  const clickAttr = onclick ? `onclick="${onclick}" style="cursor:pointer;"` : '';
  const hoverExtra = onclick ? 'ring-1 ring-white/10 hover:ring-brand/50 hover:shadow-brand/10 hover:shadow-lg' : '';
  return `
  <div class="glass rounded-xl p-5 glass-hover transition-all ${hoverExtra}" ${clickAttr}>
    <div class="flex items-start justify-between mb-3">
      <div class="text-xs font-600 text-slate-400 uppercase tracking-wide">${label}</div>
      <div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
        <i class="fa-solid ${icon} text-sm text-slate-400"></i>
      </div>
    </div>
    <div class="mono text-3xl font-700 text-white">${value.toLocaleString()}</div>
    <div class="flex items-center justify-between mt-1">
      <div class="text-xs text-slate-500">${sub}</div>
      ${onclick ? '<div class="text-xs text-brand/60 font-600">View Details →</div>' : ''}
    </div>
  </div>`;
}

// FIX 4: Drill-down modal for analytics cards
function showDrillDownModal(title, rows, type) {
  let tableHTML = '';
  if (type === 'damages') {
    // Group by product
    const byProduct = {};
    rows.forEach(e => {
      const key = e.productName;
      if (!byProduct[key]) byProduct[key] = { name: key, morning: 0, night: 0, total: 0, count: 0 };
      const dmg = Number(e.damaged || 0);
      if (e.shift === 'morning') byProduct[key].morning += dmg;
      else byProduct[key].night += dmg;
      byProduct[key].total += dmg;
      if (dmg > 0) byProduct[key].count++;
    });
    const sorted = Object.values(byProduct).filter(p => p.total > 0).sort((a, b) => b.total - a.total);
    tableHTML = `<table class="data-table w-full">
      <thead><tr><th>Product</th><th>Morning Shift</th><th>Night Shift</th><th>Total Damaged</th><th>Frequency</th></tr></thead>
      <tbody>${sorted.map(p => `<tr>
        <td class="font-500 text-white">${p.name}</td>
        <td class="mono text-amber-400">${p.morning}</td>
        <td class="mono text-purple-400">${p.night}</td>
        <td class="mono font-700 text-red-400">${p.total}</td>
        <td class="mono text-slate-400">${p.count} entries</td>
      </tr>`).join('') || '<tr><td colspan="5" class="text-center text-slate-500 py-6">No damaged stock recorded</td></tr>'}
      </tbody></table>`;
  } else if (type === 'disbursed') {
    const byProduct = {};
    rows.forEach(e => {
      const key = e.productName;
      if (!byProduct[key]) byProduct[key] = { name: key, morning: 0, night: 0, total: 0 };
      const dis = Number(e.disbursed || 0);
      if (e.shift === 'morning') byProduct[key].morning += dis;
      else byProduct[key].night += dis;
      byProduct[key].total += dis;
    });
    const sorted = Object.values(byProduct).filter(p => p.total > 0).sort((a, b) => b.total - a.total);
    tableHTML = `<table class="data-table w-full">
      <thead><tr><th>Product</th><th>Morning Shift</th><th>Night Shift</th><th>Total Disbursed</th></tr></thead>
      <tbody>${sorted.map(p => `<tr>
        <td class="font-500 text-white">${p.name}</td>
        <td class="mono text-amber-400">${p.morning}</td>
        <td class="mono text-purple-400">${p.night}</td>
        <td class="mono font-700 text-brand">${p.total}</td>
      </tr>`).join('') || '<tr><td colspan="4" class="text-center text-slate-500 py-6">No stock disbursed yet</td></tr>'}
      </tbody></table>`;
  } else if (type === 'entries') {
    const sorted = [...rows].reverse().slice(0, 30);
    tableHTML = `<div class="text-xs text-slate-500 mb-3">Showing last ${sorted.length} of ${rows.length} total entries</div>
      <table class="data-table w-full">
      <thead><tr><th>Date</th><th>Product</th><th>User</th><th>Shift</th><th>Closing</th><th>Remaining</th></tr></thead>
      <tbody>${sorted.map(e => `<tr>
        <td class="mono text-xs">${e.date}</td>
        <td class="font-500 text-white">${e.productName}</td>
        <td>${e.userName || '—'}</td>
        <td>${getShiftBadgeHTML(e.shift || '')}</td>
        <td class="mono">${e.closing}</td>
        <td class="mono font-600 text-white">${e.total}</td>
      </tr>`).join('')}
      </tbody></table>`;
  } else if (type === 'stock') {
    const byProduct = {};
    rows.forEach(e => {
      const key = e.productName;
      if (!byProduct[key]) byProduct[key] = { name: key, total: 0, count: 0 };
      byProduct[key].total += Number(e.total || 0);
      byProduct[key].count++;
    });
    const sorted = Object.values(byProduct).sort((a, b) => b.total - a.total);
    tableHTML = `<table class="data-table w-full">
      <thead><tr><th>Product</th><th>Total Remaining Stock Recorded</th><th>No. of Entries</th></tr></thead>
      <tbody>${sorted.map(p => `<tr>
        <td class="font-500 text-white">${p.name}</td>
        <td class="mono font-700 text-white">${p.total.toLocaleString()}</td>
        <td class="mono text-slate-400">${p.count}</td>
      </tr>`).join('')}
      </tbody></table>`;
  }

  document.getElementById('modal-content').innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-lg font-700 text-white">${title}</h3>
        <button onclick="closeModal()" class="btn btn-ghost btn-sm p-1.5 rounded-lg"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="overflow-x-auto max-h-[60vh] overflow-y-auto">${tableHTML}</div>
      <div class="flex gap-3 mt-4">
        <button onclick="closeModal()" class="btn btn-secondary flex-1 justify-center">Close</button>
        <button onclick="navigateTo('admin-audit')" class="btn btn-primary flex-1 justify-center"><i class="fa-solid fa-arrow-right"></i> Full Audit</button>
      </div>
    </div>`;
  openModal();
}

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN STOCK ENTRIES
// ════════════════════════════════════════════════════════════════════════════
function renderAdminStock() {
  return `
  <div class="space-y-4">
    <!-- Filters -->
    <div class="glass rounded-xl p-4">
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="search-wrap">
          <i class="fa-solid fa-magnifying-glass search-icon text-xs"></i>
          <input id="as-search" type="text" class="form-input" placeholder="Search product, user…" oninput="debouncedAdminStockTable()" />
        </div>
        <input id="as-date" type="date" class="form-input" onchange="renderAdminStockTable()" />
        <select id="as-user" class="form-input" onchange="renderAdminStockTable()">
          <option value="">All Users</option>
          ${USERS.filter(u => u.role === 'user').map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
        </select>
        <select id="as-shift" class="form-input" onchange="renderAdminStockTable()">
          <option value="">All Shifts</option>
          <option value="morning">Morning Shift</option>
          <option value="night">Night Shift</option>
        </select>
      </div>
    </div>

    <!-- Table -->
    <div class="glass rounded-xl overflow-hidden">
      <div class="flex items-center justify-between p-4 border-b border-white/5">
        <div class="section-title">All Stock Entries</div>
        <div id="as-count" class="text-xs text-slate-500"></div>
      </div>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead><tr>
            <th>Product</th><th>User</th><th>Opening</th><th>Received</th>
            <th>Stock Out</th><th>Damaged</th><th>Closing</th><th>Remaining</th><th>Variance</th>
            <th>Shift</th><th>Date</th><th>Time</th><th></th>
          </tr></thead>
          <tbody id="as-tbody"></tbody>
        </table>
      </div>
      <div id="as-pagination" class="flex items-center justify-between p-4 border-t border-white/5"></div>
    </div>
  </div>`;
}

let asPage = 1; const asPerPage = 10;
function renderAdminStockTable() {
  const search = (document.getElementById('as-search') || {}).value?.toLowerCase() || '';
  const date = (document.getElementById('as-date') || {}).value || '';
  const user = (document.getElementById('as-user') || {}).value || '';
  const shift = (document.getElementById('as-shift') || {}).value || '';

  let rows = db_entries.filter(e => {
    if (search && !`${e.productName} ${e.userName}`.toLowerCase().includes(search)) return false;
    if (date && e.date !== date) return false;
    if (user && e.userId !== Number(user)) return false;
    // Normalize shift value from DB (trim + lowercase) before comparing
    const filterShift = shift.trim().toLowerCase();
    if (filterShift && (e.shift || '').trim().toLowerCase() !== filterShift) return false;
    return true;
  }).reverse();

  const count = document.getElementById('as-count');
  if (count) count.textContent = `${rows.length} entries`;

  const totalPages = Math.ceil(rows.length / asPerPage) || 1;
  if (asPage > totalPages) asPage = 1;
  const paged = rows.slice((asPage - 1) * asPerPage, asPage * asPerPage);

  const tbody = document.getElementById('as-tbody');
  if (!tbody) return;
  tbody.innerHTML = paged.map(e => `
    <tr>
      <td class="font-500 text-white">${e.productName}</td>
      <td>${e.userName}</td>
      <td class="mono">${e.opening}</td>
      <td class="mono">${e.received}</td>
      <td class="mono ${Number(e.disbursed || 0) > 0 ? 'text-brand' : ''}">${e.disbursed || 0}</td>
      <td class="mono ${Number(e.damaged) > 0 ? 'text-red-400' : ''}">${e.damaged}</td>
      <td class="mono">${e.closing}</td>
      <td class="mono font-600 text-white">${e.total}</td>
      <td class="mono ${Number(e.variance) !== 0 ? 'text-amber-400' : ''}">${e.variance}</td>
      <td>${getShiftBadgeHTML(e.shift)}</td>
      <td class="mono text-xs">${e.date}</td>
      <td class="mono text-xs text-slate-500">${e.time}</td>
      <td>
        <div class="flex items-center gap-2">
          <button onclick="editEntry('${e.id}')" class="btn btn-ghost btn-sm text-brand p-1" title="Edit Entry"><i class="fa-solid fa-pen text-xs"></i></button>
          <button onclick="deleteEntry('${e.id}')" class="btn btn-ghost btn-sm text-red-400 hover:text-red-300 p-1" title="Delete Entry"><i class="fa-solid fa-trash text-xs"></i></button>
        </div>
      </td>
    </tr>`).join('') || '<tr><td colspan="13" class="text-center text-slate-500 py-10">No entries match your filters</td></tr>';
  const pg = document.getElementById('as-pagination');
  if (pg) pg.innerHTML = paginationHTML(asPage, totalPages, 'asPage', 'renderAdminStockTable');
}

function deleteEntry(id) {
  showConfirm('Delete Entry', 'This will permanently remove this stock entry.', async () => {
    try {
      await API.deleteEntry(id);
      // Refresh entries from backend to get latest data
      db_entries = await API.getEntries();
      renderAdminStockTable();
      showToast('Entry deleted', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN PRODUCTS
// ════════════════════════════════════════════════════════════════════════════
function renderAdminProducts() {
  return `
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <div class="section-title">Product Catalogue</div>
        <div class="section-sub">Manage all inventory products</div>
      </div>
      <button onclick="showProductModal()" class="btn btn-primary">
        <i class="fa-solid fa-plus"></i> Add Product
      </button>
    </div>

    <div class="glass rounded-xl overflow-hidden">
      <div class="p-4 border-b border-white/5">
        <div class="search-wrap">
          <i class="fa-solid fa-magnifying-glass search-icon text-xs"></i>
          <input id="prod-search" type="text" class="form-input" placeholder="Search products…" oninput="debouncedProductTable()" />
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead><tr><th>#</th><th>Product Name</th><th>Unit</th><th>Status</th><th>Entries</th><th>Actions</th></tr></thead>
          <tbody id="prod-tbody"></tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function renderProductTable() {
  const search = (document.getElementById('prod-search') || {}).value?.toLowerCase() || '';
  const products = db_products.filter(p => !search || p.name.toLowerCase().includes(search));
  const entries = db_entries;

  // Optim optimization: Pre-calculate counts to avoid O(P * E)
  const productCounts = {};
  entries.forEach(e => { productCounts[e.productId] = (productCounts[e.productId] || 0) + 1; });

  const tbody = document.getElementById('prod-tbody');
  if (!tbody) return;
  tbody.innerHTML = products.map((p, i) => {
    const cnt = productCounts[p.id] || 0;
    return `
    <tr>
      <td class="text-slate-500 mono text-xs">${i + 1}</td>
      <td class="font-600 text-white">${p.name}</td>
      <td><span class="chip">${p.unit}</span></td>
      <td>${p.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
      <td class="mono text-slate-400">${cnt}</td>
      <td class="flex gap-2">
        <button onclick="showProductModal('${p.id}')" class="btn btn-secondary btn-sm"><i class="fa-solid fa-pen text-xs"></i></button>
        <button onclick="toggleProductStatus('${p.id}')" class="btn btn-ghost btn-sm text-xs">${p.active ? 'Deactivate' : 'Activate'}</button>
        <button onclick="deleteProduct('${p.id}')" class="btn btn-danger btn-sm"><i class="fa-solid fa-trash text-xs"></i></button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="text-center text-slate-500 py-10">No products found</td></tr>';
}

function showProductModal(id = null) {
  if (currentUser.role !== 'admin') {
    showToast('Only administrators can manage products', 'error');
    return;
  }
  const products = db_products;
  const p = id ? products.find(x => String(x.id) === String(id)) : null;
  const units = ['pcs', 'cartons', 'kgs', 'ltrs', 'bags', 'boxes', 'bottles', 'rolls', 'qty', 'crate', 'unit', 'pack', 'tray', 'gallon'];

  document.getElementById('modal-content').innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-lg font-700 text-white">${p ? 'Edit Product' : 'Add New Product'}</h3>
        <button onclick="closeModal()" class="btn btn-ghost btn-sm p-1.5 rounded-lg"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-600 text-slate-400 mb-1.5 uppercase tracking-wide">Product Name *</label>
          <input id="pm-name" type="text" class="form-input" value="${p?.name || ''}" placeholder="e.g. Mineral Water 500ml" />
        </div>
        <div>
          <label class="block text-xs font-600 text-slate-400 mb-1.5 uppercase tracking-wide">Unit of Measure *</label>
          <select id="pm-unit" class="form-input">
            ${units.map(u => `<option value="${u}" ${p?.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </div>
        <div class="flex items-center gap-3 p-3 glass rounded-xl">
          <input id="pm-active" type="checkbox" class="w-4 h-4 accent-amber-500" ${p?.active !== false ? 'checked' : ''} />
          <label class="text-sm text-slate-300">Active (visible to staff)</label>
        </div>
      </div>
      <div class="flex gap-3 mt-6">
        <button onclick="closeModal()" class="btn btn-secondary flex-1 justify-center">Cancel</button>
        <button onclick="saveProduct('${id || ''}')" class="btn btn-primary flex-1 justify-center">
          <i class="fa-solid fa-check"></i> ${p ? 'Save Changes' : 'Add Product'}
        </button>
      </div>
    </div>`;
  openModal();
}

async function saveProduct(id) {
  if (currentUser.role !== 'admin') {
    showToast('Only administrators can save products', 'error');
    return;
  }
  const rawName = document.getElementById('pm-name').value.trim();
  if (!rawName) { showToast('Product name is required', 'error'); return; }
  const normalizedName = rawName.replace(/\s+/g, ' ').trim();
  const name = normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1).toLowerCase();
  const unit = document.getElementById('pm-unit').value;
  const active = document.getElementById('pm-active').checked;
  const existingProduct = db_products.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (!id && existingProduct) {
    showToast('A product with this name already exists and will be merged', 'info');
  }

  const btn = document.querySelector('.modal-box .btn-primary');
  const orgHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
  btn.disabled = true;

  try {
    const data = { name, unit, active };
    const savedProduct = await API.saveProduct(id, data);

    if (id) {
      db_products = db_products.map(p => String(p.id) === String(id) ? savedProduct : p);
      showToast('Product updated', 'success');
    } else {
      const existingIndex = db_products.findIndex(p => String(p.id) === String(savedProduct.id));
      if (existingIndex > -1) {
        db_products[existingIndex] = savedProduct;
        showToast('Duplicate product merged with existing record', 'info');
      } else {
        db_products.push(savedProduct);
        showToast('Product added', 'success');
      }
    }

    closeModal();
    navigateTo('admin-products', true);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    btn.innerHTML = orgHtml;
    btn.disabled = false;
  }
}

async function toggleProductStatus(id) {
  if (currentUser.role !== 'admin') {
    showToast('Only administrators can modify products', 'error');
    return;
  }
  const p = db_products.find(x => String(x.id) === String(id));
  if (!p) return;

  try {
    const updated = await API.saveProduct(id, { ...p, active: !p.active });
    db_products = db_products.map(x => String(x.id) === String(id) ? updated : x);
    navigateTo('admin-products', true);
    showToast('Product status updated', 'info');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteProduct(id) {
  if (currentUser.role !== 'admin') {
    showToast('Only administrators can delete products', 'error');
    return;
  }
  const productEntries = db_entries.filter(e => String(e.product_id) === String(id));

  showConfirm('Delete Product',
    productEntries.length ? `This product has ${productEntries.length} associated entries. Deleting it will remove those entries. Continue?` : 'This action cannot be undone.',
    async () => {
      try {
        await API.deleteProduct(id);
        db_products = await API.getProducts();
        navigateTo('admin-products', true);
        showToast('Product deleted', 'success');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
}

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN AUDIT
// ════════════════════════════════════════════════════════════════════════════
// ── ADMIN AUDIT
function renderAdminAudit() {
  const mode = LS.get('sf_audit_mode', 'entries'); // entries or logs

  return `
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <div class="section-title">Audit & Reports</div>
        <div class="section-sub">Investigate historical stock data and system changes</div>
      </div>
      <div class="flex gap-2">
        <button onclick="exportAuditCSV()" class="btn btn-secondary btn-sm"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
        <button onclick="downloadAuditPDF()" class="btn btn-secondary btn-sm"><i class="fa-solid fa-file-pdf"></i> Download PDF</button>
        <button onclick="printAuditReport()" class="btn btn-secondary btn-sm"><i class="fa-solid fa-print"></i> Print Report</button>
      </div>
    </div>

    <!-- Toggle -->
    <div class="flex p-1 bg-slate-800/50 rounded-lg w-fit border border-white/5">
      <button onclick="setAuditMode('entries')" class="px-4 py-1.5 rounded-md text-xs font-600 transition-all ${mode === 'entries' ? 'bg-brand text-white shadow-lg' : 'text-slate-400 hover:text-white'}">
        Stock Entry History
      </button>
      <button onclick="setAuditMode('logs')" class="px-4 py-1.5 rounded-md text-xs font-600 transition-all ${mode === 'logs' ? 'bg-brand text-white shadow-lg' : 'text-slate-400 hover:text-white'}">
        System Audit Trail (New)
      </button>
    </div>

    ${mode === 'entries' ? renderAuditEntriesView() : renderAuditLogsView()}
  </div>`;
}

function setAuditMode(mode) {
  LS.set('sf_audit_mode', mode);
  navigateTo('admin-audit', true);
}

function renderAuditEntriesView() {
  return `
    <!-- Filters -->
    <div class="glass rounded-xl p-4">
      <div class="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div>
          <label class="text-xs text-slate-500 mb-1 block">From Date</label>
          <input id="aud-date-from" type="date" class="form-input" onchange="renderAuditTable()" />
        </div>
        <div>
          <label class="text-xs text-slate-500 mb-1 block">To Date</label>
          <input id="aud-date-to" type="date" class="form-input" onchange="renderAuditTable()" />
        </div>
        <div>
          <label class="text-xs text-slate-500 mb-1 block">User</label>
          <select id="aud-user" class="form-input" onchange="renderAuditTable()">
            <option value="">All Users</option>
            ${USERS.filter(u => u.role === 'user').map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-xs text-slate-500 mb-1 block">Product</label>
          <select id="aud-prod" class="form-input" onchange="renderAuditTable()">
            <option value="">All Products</option>
            ${db_products.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-xs text-slate-500 mb-1 block">Shift</label>
          <select id="aud-shift" class="form-input" onchange="renderAuditTable()">
            <option value="">All Shifts</option>
            <option value="morning">Morning</option>
            <option value="night">Night</option>
          </select>
        </div>
        <div class="flex items-end">
          <button onclick="clearAuditFilters()" class="btn btn-secondary btn-sm w-full">Clear Filters</button>
        </div>
      </div>
    </div>

    <!-- Summary Cards -->
    <div id="aud-summary" class="grid grid-cols-2 lg:grid-cols-4 gap-4"></div>

    <!-- Table -->
    <div class="glass rounded-xl overflow-hidden">
      <div class="p-4 border-b border-white/5 flex items-center justify-between">
        <div class="section-title">Record History</div>
        <div id="aud-count" class="text-xs text-slate-500"></div>
      </div>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead><tr>
            <th>Date</th><th>Shift</th><th>User</th><th>Product</th>
            <th>Opening</th><th>Received</th><th>Stock Out</th><th>Damaged</th><th>Closing</th>
            <th>Remaining</th><th>Variance</th><th>Time</th><th class="w-10"></th>
          </tr></thead>
          <tbody id="aud-tbody"></tbody>
          <tfoot id="aud-tfoot"></tfoot>
        </table>
      </div>
    </div>`;
}

function renderAuditLogsView() {
  return `
    <div class="glass rounded-xl overflow-hidden">
      <div class="p-4 border-b border-white/5 flex items-center justify-between">
        <div>
          <div class="section-title">System Audit Trail</div>
          <div class="section-sub">Append-only log of every system modification</div>
        </div>
        <div class="text-xs text-slate-500 uppercase font-600">${db_audit_logs.length} Operations</div>
      </div>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead><tr>
            <th>Timestamp</th><th>Staff</th><th>Action</th><th>Target</th><th>Changes (Old → New)</th><th>IP</th>
          </tr></thead>
          <tbody>
            ${db_audit_logs.map(log => {
    const actionClass = log.action === 'CREATE' ? 'text-green-400' : log.action === 'UPDATE' ? 'text-amber-400' : 'text-red-400';
    const oldVal = log.old_values ? JSON.stringify(log.old_values) : '';
    const newVal = log.new_values ? JSON.stringify(log.new_values) : '';

    return `
                <tr>
                  <td class="mono text-xs text-slate-400">${new Date(log.timestamp).toLocaleString('en-GB')}</td>
                  <td class="font-600 text-white">${log.user_name || 'System'}</td>
                  <td><span class="px-2 py-0.5 rounded text-[10px] font-800 bg-white/5 ${actionClass}">${log.action}</span></td>
                  <td class="text-xs text-slate-400 capitalize">${log.table_name} #${log.record_id}</td>
                  <td>
                    <div class="max-w-xs overflow-hidden text-ellipsis whitespace-nowrap text-[10px] mono text-slate-500 cursor-help" title="Old: ${oldVal.replace(/"/g, '&quot;')}\n\nNew: ${newVal.replace(/"/g, '&quot;')}">
                      ${log.action === 'DELETE' ? `<span class="text-red-400/50 line-through">${oldVal}</span>` :
        log.action === 'CREATE' ? `<span class="text-green-400">${newVal}</span>` :
          `<span class="text-slate-600">${oldVal}</span> → <span class="text-amber-400">${newVal}</span>`}
                    </div>
                  </td>
                  <td class="mono text-[10px] text-slate-600">${log.ip_address || '—'}</td>
                </tr>`;
  }).join('') || '<tr><td colspan="6" class="text-center text-slate-500 py-12">No system logs available yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

let audPage = 1; const audPerPage = 15;
function getAuditFiltered() {
  const dateFrom = (document.getElementById('aud-date-from') || {}).value || '';
  const dateTo = (document.getElementById('aud-date-to') || {}).value || '';
  const user = (document.getElementById('aud-user') || {}).value || '';
  const prod = (document.getElementById('aud-prod') || {}).value || '';
  const shift = ((document.getElementById('aud-shift') || {}).value || '').trim().toLowerCase();

  return db_entries.filter(e => {
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo && e.date > dateTo) return false;
    if (user && String(e.userId) !== String(user)) return false;
    if (prod && String(e.productId) !== String(prod)) return false;
    // Normalize shift value from DB (trim + lowercase) before comparing
    if (shift && (e.shift || '').trim().toLowerCase() !== shift) return false;
    return true;
  });
}

function clearAuditFilters() {
  const ids = ['aud-date-from', 'aud-date-to', 'aud-user', 'aud-prod', 'aud-shift'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  audPage = 1;
  renderAuditTable();
}

function renderAuditTable() {
  const rows = getAuditFiltered();
  // Summary cards
  const sumEl = document.getElementById('aud-summary');
  if (sumEl) {
    const totalStock = rows.reduce((s, e) => s + Number(e.total || 0), 0);
    const totalDmg = rows.reduce((s, e) => s + Number(e.damaged || 0), 0);
    const totalVar = rows.reduce((s, e) => s + Number(e.variance || 0), 0);
    const products = [...new Set(rows.map(e => e.productId))].length;
    sumEl.innerHTML = `
        ${miniStat('fa-boxes-stacked', 'Total Stock', totalStock, 'text-blue-400')}
        ${miniStat('fa-triangle-exclamation', 'Total Damaged', totalDmg, 'text-red-400')}
        ${miniStat('fa-scale-unbalanced', 'Total Variance', totalVar, 'text-amber-400')}
        ${miniStat('fa-box-open', 'Distinct Products', products, 'text-green-400')}`;
  }

  const totalPages = Math.ceil(rows.length / audPerPage) || 1;
  if (audPage > totalPages) audPage = 1;
  const paged = rows.slice((audPage - 1) * audPerPage, audPage * audPerPage);

  const tbody = document.getElementById('aud-tbody');
  if (tbody) tbody.innerHTML = paged.map(e => `
      <tr>
        <td class="mono text-xs font-600">${e.date}</td>
        <td>${getShiftBadgeHTML(e.shift)}</td>
        <td>${e.userName}</td>
        <td class="font-500 text-white">${e.productName}</td>
        <td class="mono">${e.opening}</td>
        <td class="mono">${e.received}</td>
        <td class="mono ${Number(e.disbursed || 0) > 0 ? 'text-brand' : ''}">${e.disbursed || 0}</td>
        <td class="mono ${Number(e.damaged) > 0 ? 'text-red-400' : ''}">${e.damaged}</td>
        <td class="mono">${e.closing}</td>
        <td class="mono font-600 text-white">${e.total}</td>
        <td class="mono ${Number(e.variance) !== 0 ? 'text-amber-400' : ''}">${e.variance}</td>
        <td class="mono text-xs text-slate-500">${e.time}</td>
        <td>
          <button onclick="editEntry('${e.id}')" class="btn btn-ghost btn-sm text-brand p-1" title="Edit Entry"><i class="fa-solid fa-pen text-xs"></i></button>
        </td>
      </tr>`).join('') || '<tr><td colspan="13" class="text-center text-slate-500 py-10">No records match filters</td></tr>';
  // Footer totals
  const tfoot = document.getElementById('aud-tfoot');
  if (tfoot && rows.length) {
    tfoot.innerHTML = `<tr style="background:rgba(245,158,11,.06);font-weight:700;">
        <td colspan="4" class="px-4 py-3 text-amber-400 text-xs uppercase">Totals (${rows.length} records)</td>
        <td class="px-4 py-3 mono">${rows.reduce((s, e) => s + Number(e.opening || 0), 0)}</td>
        <td class="px-4 py-3 mono">${rows.reduce((s, e) => s + Number(e.received || 0), 0)}</td>
        <td class="px-4 py-3 mono text-brand">${rows.reduce((s, e) => s + Number(e.disbursed || 0), 0)}</td>
        <td class="px-4 py-3 mono text-red-400">${rows.reduce((s, e) => s + Number(e.damaged || 0), 0)}</td>
        <td class="px-4 py-3 mono">${rows.reduce((s, e) => s + Number(e.closing || 0), 0)}</td>
        <td class="px-4 py-3 mono text-white">${rows.reduce((s, e) => s + Number(e.total || 0), 0)}</td>
        <td class="px-4 py-3 mono text-amber-400">${rows.reduce((s, e) => s + Number(e.variance || 0), 0)}</td>
        <td></td>
      </tr>`;
  }

  const pg = document.getElementById('aud-pagination');
  if (pg) pg.innerHTML = paginationHTML(audPage, totalPages, 'audPage', 'renderAuditTable');
}


function miniStat(icon, label, val, cls) {
  return `<div class="glass rounded-xl p-4">
    <div class="flex items-center gap-3">
      <i class="fa-solid ${icon} ${cls}"></i>
      <div>
        <div class="text-xs text-slate-500">${label}</div>
        <div class="mono font-700 text-white">${val.toLocaleString()}</div>
      </div>
    </div>
  </div>`;
}

function setAuditRange(range) {
  const now = new Date();
  const today = getWorkingDate(now);
  const fromEl = document.getElementById('aud-date-from');
  const toEl = document.getElementById('aud-date-to');

  if (range === 'today') {
    if (fromEl) fromEl.value = today;
    if (toEl) toEl.value = today;
  } else if (range === 'week') {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekISO = lastWeek.toISOString().split('T')[0];
    if (fromEl) fromEl.value = lastWeekISO;
    if (toEl) toEl.value = today;
  } else if (range === 'month') {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthISO = lastMonth.toISOString().split('T')[0];
    if (fromEl) fromEl.value = lastMonthISO;
    if (toEl) toEl.value = today;
  }
  audPage = 1;
  renderAuditTable();
}

function getAuditFilename(ext) {
  const fDateFrom = (document.getElementById('aud-date-from') || {}).value;
  const fDateTo = (document.getElementById('aud-date-to') || {}).value;
  const fShift = (document.getElementById('aud-shift') || {}).value;
  
  let filename = 'stockflow-audit';
  
  if (fDateFrom || fDateTo) {
    if (fDateFrom === fDateTo) filename += `-${fDateFrom}`;
    else filename += `-${fDateFrom || 'start'}-to-${fDateTo || 'end'}`;
  } else {
    filename += `-${getWorkingDate()}`;
  }
  
  if (fShift) filename += `-${fShift}`;
  
  return `${filename}.${ext}`;
}

function exportAuditCSV() {
  const rows = getAuditFiltered();
  if (!rows.length) { showToast('No data to export', 'warn'); return; }
  const headers = ['Date', 'Shift', 'User', 'Product', 'Opening Stock', 'Received Stock', 'Stock Out', 'Damaged Stock', 'Closing Stock', 'Remaining Stock', 'Variance', 'Time'];
  const csv = [headers.join(','), ...rows.map(e =>
    [e.date, e.shift, `"${e.userName}"`, `"${e.productName}"`, e.opening, e.received, e.disbursed || 0, e.damaged, e.closing, e.total, e.variance, e.time].join(',')
  )].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = getAuditFilename('csv');
  a.click();
  showToast('CSV exported successfully', 'success');
}

function printAuditReport() {
  const rows = getAuditFiltered().sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) { showToast('No data to print', 'warn'); return; }
  const area = document.getElementById('print-area');
  area.innerHTML = `
    <div style="font-family:Arial,sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:16px;">
        <div><h1 style="margin:0;font-size:20pt;font-weight:900;">StockFlow</h1>
        <p style="margin:0;font-size:9pt;color:#666;">Inventory Management System</p></div>
        <div style="text-align:right;"><div style="font-size:14pt;font-weight:700;">AUDIT REPORT</div>
        <div style="font-size:9pt;color:#333;">Generated: ${new Date().toLocaleString()}</div>
        <div style="font-size:9pt;color:#333;">By: ${currentUser.name}</div></div>
      </div>
      <div style="background:#f9f9f9;padding:10px;border-radius:4px;margin-bottom:14px;font-size:9pt;">
        <strong>Records:</strong> ${rows.length} &nbsp;|&nbsp;
        <strong>Total Closing Stock:</strong> ${rows.reduce((s, e) => s + Number(e.total || 0), 0)} &nbsp;|&nbsp;
        <strong>Total Damaged Stock:</strong> ${rows.reduce((s, e) => s + Number(e.damaged || 0), 0)} &nbsp;|&nbsp;
        <strong>Total Disbursed (Stock Out):</strong> ${rows.reduce((s, e) => s + Number(e.disbursed || 0), 0)} &nbsp;|&nbsp;
        <strong>Total Variance:</strong> ${rows.reduce((s, e) => s + Number(e.variance || 0), 0)}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:8pt;">
        <thead><tr style="background:#111;color:#fff;">
          ${['Date', 'Shift', 'User', 'Product', 'Opening Stock', 'Received Stock', 'Damaged Stock', 'Stock Out', 'Closing Stock', 'Total Stock', 'Variance', 'Time']
      .map(h => `<th style="padding:6px;text-align:left;border:1px solid #ddd;">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.map((e, i) => `<tr style="${i % 2 ? 'background:#f9f9f9' : ''}">
            <td style="padding:5px;border:1px solid #ddd;">${e.date}</td>
            <td style="padding:5px;border:1px solid #ddd;">${e.shift}</td>
            <td style="padding:5px;border:1px solid #ddd;">${e.userName}</td>
            <td style="padding:5px;border:1px solid #ddd;">${e.productName}</td>
            <td style="padding:5px;border:1px solid #ddd;text-align:center;">${e.opening}</td>
            <td style="padding:5px;border:1px solid #ddd;text-align:center;">${e.received}</td>
            <td style="padding:5px;border:1px solid #ddd;text-align:center;">${e.damaged}</td>
            <td style="padding:5px;border:1px solid #ddd;text-align:center;">${e.disbursed || 0}</td>
            <td style="padding:5px;border:1px solid #ddd;text-align:center;">${e.closing}</td>
            <td style="padding:5px;border:1px solid #ddd;text-align:center;font-weight:700;">${e.total}</td>
            <td style="padding:5px;border:1px solid #ddd;text-align:center;">${e.variance}</td>
            <td style="padding:5px;border:1px solid #ddd;">${e.time}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr style="background:#eee;font-weight:700;font-size:9pt;">
          <td colspan="4" style="padding:6px;border:1px solid #ddd;">TOTALS</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.opening || 0), 0)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.received || 0), 0)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.damaged || 0), 0)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.disbursed || 0), 0)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.closing || 0), 0)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.total || 0), 0)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.variance || 0), 0)}</td>
          <td style="border:1px solid #ddd;"></td>
        </tr></tfoot>
      </table>
      <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;padding-top:12px;border-top:1px solid #ccc;">
        <div><div style="font-size:8pt;color:#666;margin-bottom:30px;">Staff Signature</div><div style="border-top:1px solid #000;padding-top:4px;font-size:8pt;">${currentUser.name}</div></div>
        <div><div style="font-size:8pt;color:#666;margin-bottom:30px;">Supervisor Signature</div><div style="border-top:1px solid #000;padding-top:4px;font-size:8pt;">___________________</div></div>
        <div><div style="font-size:8pt;color:#666;margin-bottom:30px;">Date & Stamp</div><div style="border-top:1px solid #000;padding-top:4px;font-size:8pt;">${new Date().toLocaleDateString('en-GB')}</div></div>
      </div>
    </div>`;
  window.print();
}

function downloadAuditPDF() {
  const rows = getAuditFiltered().sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) { showToast('No data to download', 'warn'); return; }

  // Show loading toast
  showToast('Generating PDF…', 'info', 5000);

  const content = document.createElement('div');
  content.style.fontFamily = 'Arial, sans-serif';
  content.style.padding = '20px';
  content.style.color = '#000';
  content.style.background = '#fff';
  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:16px;">
      <div><h1 style="margin:0;font-size:20pt;font-weight:900;">StockFlow</h1>
      <p style="margin:0;font-size:9pt;color:#666;">Inventory Management System</p></div>
      <div style="text-align:right;"><div style="font-size:14pt;font-weight:700;">AUDIT REPORT</div>
      <div style="font-size:9pt;color:#333;">Generated: ${new Date().toLocaleString()}</div>
      <div style="font-size:9pt;color:#333;">By: ${currentUser.name}</div></div>
    </div>
    <div style="background:#f9f9f9;padding:10px;border-radius:4px;margin-bottom:14px;font-size:9pt;">
      <strong>Records:</strong> ${rows.length} &nbsp;|&nbsp;
      <strong>Total Closing Stock:</strong> ${rows.reduce((s, e) => s + Number(e.total || 0), 0)} &nbsp;|&nbsp;
      <strong>Total Damaged Stock:</strong> ${rows.reduce((s, e) => s + Number(e.damaged || 0), 0)} &nbsp;|&nbsp;
      <strong>Total Disbursed:</strong> ${rows.reduce((s, e) => s + Number(e.disbursed || 0), 0)} &nbsp;|&nbsp;
      <strong>Total Variance:</strong> ${rows.reduce((s, e) => s + Number(e.variance || 0), 0)}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:8pt;">
      <thead><tr style="background:#111;color:#fff;">
        ${['Date', 'Shift', 'User', 'Product', 'Opening', 'Received', 'Damaged', 'Stock Out', 'Closing', 'Remaining', 'Variance', 'Time']
          .map(h => `<th style="padding:6px;text-align:left;border:1px solid #ddd;">${h}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${rows.map((e, i) => `<tr style="${i % 2 ? 'background:#f9f9f9' : ''}">
          <td style="padding:5px;border:1px solid #ddd;">${e.date}</td>
          <td style="padding:5px;border:1px solid #ddd;">${e.shift || '—'}</td>
          <td style="padding:5px;border:1px solid #ddd;">${e.userName}</td>
          <td style="padding:5px;border:1px solid #ddd;">${e.productName}</td>
          <td style="padding:5px;border:1px solid #ddd;text-align:center;">${e.opening}</td>
          <td style="padding:5px;border:1px solid #ddd;text-align:center;">${e.received}</td>
          <td style="padding:5px;border:1px solid #ddd;text-align:center;">${e.damaged}</td>
          <td style="padding:5px;border:1px solid #ddd;text-align:center;">${e.disbursed || 0}</td>
          <td style="padding:5px;border:1px solid #ddd;text-align:center;">${e.closing}</td>
          <td style="padding:5px;border:1px solid #ddd;text-align:center;font-weight:700;">${e.total}</td>
          <td style="padding:5px;border:1px solid #ddd;text-align:center;">${e.variance}</td>
          <td style="padding:5px;border:1px solid #ddd;">${e.time}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr style="background:#eee;font-weight:700;font-size:9pt;">
        <td colspan="4" style="padding:6px;border:1px solid #ddd;">TOTALS</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.opening || 0), 0)}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.received || 0), 0)}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.damaged || 0), 0)}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.disbursed || 0), 0)}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.closing || 0), 0)}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.total || 0), 0)}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:center;">${rows.reduce((s, e) => s + Number(e.variance || 0), 0)}</td>
        <td style="border:1px solid #ddd;"></td>
      </tr></tfoot>
    </table>
    <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;padding-top:12px;border-top:1px solid #ccc;">
      <div><div style="font-size:8pt;color:#666;margin-bottom:30px;">Staff Signature</div><div style="border-top:1px solid #000;padding-top:4px;font-size:8pt;">${currentUser.name}</div></div>
      <div><div style="font-size:8pt;color:#666;margin-bottom:30px;">Supervisor Signature</div><div style="border-top:1px solid #000;padding-top:4px;font-size:8pt;">___________________</div></div>
      <div><div style="font-size:8pt;color:#666;margin-bottom:30px;">Date & Stamp</div><div style="border-top:1px solid #000;padding-top:4px;font-size:8pt;">${new Date().toLocaleDateString('en-GB')}</div></div>
    </div>`;

  const opt = {
    margin: [10, 10, 10, 10],
    filename: getAuditFilename('pdf'),
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };

  html2pdf().set(opt).from(content).save().then(() => {
    showToast('PDF downloaded successfully!', 'success');
  }).catch(err => {
    console.error('PDF generation failed:', err);
    showToast('PDF generation failed. Try Print Report instead.', 'error');
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN ANALYTICS
// ════════════════════════════════════════════════════════════════════════════
function renderAdminAnalytics() {
  const entries = db_entries;
  const products = db_products;

  // Pre-process: Group entries by date and product for faster lookup
  const entriesByDate = {};
  const entriesByProduct = {};
  
  entries.forEach(e => {
    if (!entriesByDate[e.date]) entriesByDate[e.date] = [];
    entriesByDate[e.date].push(e);
    
    if (!entriesByProduct[e.productId]) entriesByProduct[e.productId] = [];
    entriesByProduct[e.productId].push(e);
  });

  // Group by date (last 7 days)
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    const dayEntries = entriesByDate[iso] || [];
    last7.push({
      date: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      total: dayEntries.reduce((s, e) => s + Number(e.total || 0), 0),
      damaged: dayEntries.reduce((s, e) => s + Number(e.damaged || 0), 0),
      count: dayEntries.length
    });
  }
  const maxTotal = Math.max(...last7.map(d => d.total)) || 1;

  // Top products by entries
  const prodStats = products.map(p => {
    const pEntries = entriesByProduct[p.id] || [];
    return {
      name: p.name, unit: p.unit,
      count: pEntries.length,
      damaged: pEntries.reduce((s, e) => s + Number(e.damaged || 0), 0)
    };
  }).sort((a, b) => b.count - a.count).slice(0, 5);

  return `
  <div class="stagger space-y-6">
    <!-- Top stats -->
    <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      ${statCard('fa-boxes-stacked', 'Total Stock Recorded', entries.reduce((s, e) => s + Number(e.total || 0), 0), 'badge-blue', 'All time', 'showDrillDownModal(\'Stock by Product\', db_entries, \'stock\')')}
      ${statCard('fa-triangle-exclamation', 'Total Damages', entries.reduce((s, e) => s + Number(e.damaged || 0), 0), 'badge-red', 'All time', 'showDrillDownModal(\'Damaged Stock Breakdown\', db_entries, \'damages\')')}
      ${statCard('fa-share-from-square', 'Total Disbursed', entries.reduce((s, e) => s + Number(e.disbursed || 0), 0), 'badge-brand', 'All time', 'showDrillDownModal(\'Stock Disbursement Breakdown\', db_entries, \'disbursed\')')}
      ${statCard('fa-clipboard-list', 'Total Entries', entries.length, 'badge-green', 'All time', 'showDrillDownModal(\'All Stock Entries\', db_entries, \'entries\')')}
      ${statCard('fa-percent', 'Damage Rate', entries.length ? Math.round((entries.filter(e => Number(e.damaged) > 0).length / entries.length) * 100) : 0, 'badge-amber', '% of entries w/ damage', 'showDrillDownModal(\'Entries With Damage\', db_entries.filter(e => Number(e.damaged) > 0), \'damages\')')}
      ${statCard('fa-box-open', 'Active Products', products.filter(p => p.active).length, 'badge-purple', 'Catalogue')}
    </div>

    <!-- Charts row -->
    <div class="grid lg:grid-cols-2 gap-4">
      <!-- 7-day bar chart -->
      <div class="glass rounded-xl p-5">
        <div class="section-title mb-1">Stock Volume — Last 7 Days</div>
        <div class="section-sub mb-5">Total stock recorded per day</div>
        <div class="flex items-end gap-2 h-40">
          ${last7.map(d => `
          <div class="flex-1 flex flex-col items-center gap-1.5" data-tip="${d.total} units">
            <div class="text-xs mono text-slate-500">${d.total || ''}</div>
            <div class="w-full rounded-t-md bg-amber-500/80 hover:bg-amber-400 transition-all cursor-pointer relative group"
                 style="height:${Math.max(4, (d.total / maxTotal) * 128)}px; min-height:4px;">
            </div>
            <div class="text-xs text-slate-500 text-center leading-tight">${d.date.split(' ')[0]}<br><span class="text-slate-600">${d.date.split(' ')[1]}</span></div>
          </div>`).join('')}
        </div>
      </div>

      <!-- Damage by day -->
      <div class="glass rounded-xl p-5">
        <div class="section-title mb-1">Daily Damage Report</div>
        <div class="section-sub mb-5">Damaged stock per day</div>
        <div class="space-y-2.5">
          ${last7.map(d => {
    const pct = d.damaged > 0 ? Math.min(100, (d.damaged / Math.max(...last7.map(x => x.damaged)) || 1) * 100) : 0;
    return `
            <div class="flex items-center gap-3">
              <div class="w-20 text-xs text-slate-500 text-right shrink-0">${d.date}</div>
              <div class="flex-1 progress-bar">
                <div class="progress-fill bg-red-500/70" style="width:${pct}%; background:#ef4444;"></div>
              </div>
              <div class="w-10 mono text-xs text-right ${d.damaged > 0 ? 'text-red-400' : 'text-slate-600'}">${d.damaged}</div>
            </div>`;
  }).join('')}
        </div>
      </div>
    </div>

    <!-- Top products + Shift split -->
    <div class="grid lg:grid-cols-2 gap-4">
      <!-- Top products -->
      <div class="glass rounded-xl p-5">
        <div class="section-title mb-1">Top Products by Activity</div>
        <div class="section-sub mb-4">Most recorded in entries</div>
        <div class="space-y-3">
          ${prodStats.length ? prodStats.map((p, i) => {
    const maxCnt = prodStats[0].count || 1;
    return `
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-white font-500 truncate">${p.name}</span>
                <span class="mono text-slate-400 ml-2 shrink-0">${p.count} entries</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width:${(p.count / maxCnt) * 100}%"></div>
              </div>
            </div>`;
  }).join('') : '<p class="text-slate-500 text-sm">No data yet</p>'}
        </div>
      </div>

      <!-- Shift split -->
      <div class="glass rounded-xl p-5">
        <div class="section-title mb-1">Entries by Shift</div>
        <div class="section-sub mb-4">Morning vs Night breakdown</div>
        ${(() => {
      const morning = entries.filter(e => e.shift === 'morning');
      const night = entries.filter(e => e.shift === 'night');
      const total = entries.length || 1;
      const mPct = Math.round((morning.length / total) * 100);
      const nPct = 100 - mPct;
      return `
          <div class="space-y-4">
            <div class="flex gap-4">
              <div class="flex-1 glass rounded-xl p-4 text-center">
                <i class="fa-solid fa-sun text-amber-400 text-2xl mb-2"></i>
                <div class="mono text-2xl font-700 text-white">${morning.length}</div>
                <div class="text-xs text-slate-500">Morning</div>
                <div class="text-sm font-600 text-amber-400">${mPct}%</div>
              </div>
              <div class="flex-1 glass rounded-xl p-4 text-center">
                <i class="fa-solid fa-moon text-purple-400 text-2xl mb-2"></i>
                <div class="mono text-2xl font-700 text-white">${night.length}</div>
                <div class="text-xs text-slate-500">Night</div>
                <div class="text-sm font-600 text-purple-400">${nPct}%</div>
              </div>
            </div>
            <div>
              <div class="text-xs text-slate-500 mb-1">Distribution</div>
              <div class="flex h-6 rounded-full overflow-hidden">
                <div class="bg-amber-500/70 transition-all" style="width:${mPct}%;"></div>
                <div class="bg-purple-500/70 flex-1"></div>
              </div>
              <div class="flex justify-between text-xs text-slate-500 mt-1">
                <span>Morning ${mPct}%</span><span>Night ${nPct}%</span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="glass rounded-lg p-3">
                <div class="text-xs text-slate-500">Morning Damage</div>
                <div class="mono font-700 text-red-400">${morning.reduce((s, e) => s + Number(e.damaged || 0), 0)}</div>
              </div>
              <div class="glass rounded-lg p-3">
                <div class="text-xs text-slate-500">Night Damage</div>
                <div class="mono font-700 text-red-400">${night.reduce((s, e) => s + Number(e.damaged || 0), 0)}</div>
              </div>
            </div>
          </div>`;
    })()}
      </div>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  USER DASHBOARD (Stock Entry Form)
// ════════════════════════════════════════════════════════════════════════════
function renderUserDashboard() {
  const products = db_products.filter(p => p.active);
  const shift = getCurrentShift();
  const entries = db_entries;
  const today = entries.filter(e => String(e.userId) === String(currentUser.id) && e.date === getWorkingDate());


  return `
  <div class="stagger space-y-6">
    ${getLowStockHTML()}
    <!-- Welcome + Shift -->
    <div class="glass rounded-xl p-5 flex flex-col lg:flex-row lg:items-center gap-6">
      <div class="flex-1">
        <div class="text-slate-400 text-sm">Welcome back,</div>
        <div class="text-xl font-700 text-white mt-0.5">${currentUser.name}</div>
        <div class="text-sm text-slate-500 mt-1">${new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
      
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex flex-col items-start lg:items-end gap-1 px-4 border-l lg:border-l-0 lg:border-r border-white/10">
          ${getShiftBadgeHTML(shift)}
          <div class="text-xs text-slate-500">${shift === 'morning' ? '10:00 – 19:00' : '19:00 – 10:00'}</div>
        </div>
        
        <button onclick="showReportOptions()" class="btn btn-primary h-12 px-6 glow-amber group">
          <i class="fa-solid fa-clock-rotate-left mr-1 group-hover:rotate-[-45deg] transition-transform"></i>
          <span>End Shift & Generate Report</span>
        </button>
      </div>
    </div>

    <!-- Quick stats row -->
    <div class="grid grid-cols-3 gap-4">
      <div class="glass rounded-xl p-4 text-center">
        <div class="mono text-2xl font-700 text-white">${today.length}</div>
        <div class="text-xs text-slate-500 mt-1">Entries Today</div>
      </div>
      <div class="glass rounded-xl p-4 text-center">
        <div class="mono text-2xl font-700 ${today.filter(e => Number(e.damaged) > 0).length ? 'text-red-400' : 'text-green-400'}">${today.reduce((s, e) => s + Number(e.damaged || 0), 0)}</div>
        <div class="text-xs text-slate-500 mt-1">Units Damaged</div>
      </div>
      <div class="glass rounded-xl p-4 text-center">
        <div class="mono text-2xl font-700 text-white">${today.reduce((s, e) => s + Number(e.total || 0), 0)}</div>
        <div class="text-xs text-slate-500 mt-1">Remaining Stock</div>
      </div>
    </div>

    <!-- Entry Form -->
    <div class="glass rounded-xl p-6">
      <div class="flex items-center justify-between mb-5">
        <div>
          <div class="section-title">Record Stock Entry</div>
          <div class="section-sub">All fields marked * are required</div>
        </div>
        <div class="flex items-center gap-2 text-xs text-slate-500">
          <i class="fa-solid fa-circle-info"></i>
          <span>Auto-tagged with current shift</span>
        </div>
      </div>

      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- Product -->
        <div class="sm:col-span-2 lg:col-span-1">
          <label class="block text-xs font-600 text-slate-400 mb-1.5 uppercase tracking-wide">Product *</label>
          <select id="f-product" class="form-input" onchange="updateUnit()">
            <option value="">— Select Product —</option>
            ${products.map(p => `<option value="${p.id}" data-unit="${p.unit}">${p.name}</option>`).join('')}
          </select>
          <div id="f-unit-hint" class="text-xs text-slate-600 mt-1"></div>
        </div>

        <!-- Opening Stock -->
        <div>
          <label class="block text-xs font-600 text-slate-400 mb-1.5 uppercase tracking-wide">Opening Stock *</label>
          <input id="f-opening" type="text" inputmode="numeric" class="form-input" placeholder="0" oninput="calcStock()" onkeypress="return event.charCode >= 48 && event.charCode <= 57" />
        </div>

        <!-- Received -->
        <div>
          <label class="block text-xs font-600 text-slate-400 mb-1.5 uppercase tracking-wide">Stock Received</label>
          <input id="f-received" type="text" inputmode="numeric" class="form-input" placeholder="0" oninput="calcStock()" onkeypress="return event.charCode >= 48 && event.charCode <= 57" />
        </div>

        <!-- Stock Out -->
        <div>
          <label class="block text-xs font-600 text-slate-400 mb-1.5 uppercase tracking-wide">Stock Out / Disbursed</label>
          <input id="f-disbursed" type="text" inputmode="numeric" class="form-input border-brand/20 shadow-inner" placeholder="0" oninput="calcStock()" onkeypress="return event.charCode >= 48 && event.charCode <= 57" />
        </div>

        <!-- Damaged -->
        <div>
          <label class="block text-xs font-600 text-slate-400 mb-1.5 uppercase tracking-wide">Damaged Stock</label>
          <input id="f-damaged" type="text" inputmode="numeric" class="form-input" placeholder="0" oninput="calcStock()" onkeypress="return event.charCode >= 48 && event.charCode <= 57" />
        </div>

        <!-- Closing -->
        <div>
          <label class="block text-xs font-600 text-slate-400 mb-1.5 uppercase tracking-wide">Closing Stock *</label>
          <input id="f-closing" type="text" inputmode="numeric" class="form-input lg:col-span-1" placeholder="0" oninput="calcStock('closing')" onkeypress="return event.charCode >= 48 && event.charCode <= 57" />
        </div>

        <!-- Auto calc display -->
        <div class="glass rounded-xl p-4 flex flex-col justify-center">
          <div class="text-xs text-slate-500 uppercase tracking-wide mb-2 font-600">Auto Calculated</div>
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs text-slate-400">Remaining Stock:</span>
            <span id="calc-total" class="mono font-700 text-white">—</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-xs text-slate-400">Variance:</span>
            <span id="calc-variance" class="mono font-700 text-slate-400">—</span>
          </div>
        </div>
      </div>

      <!-- Shift / Date tags -->
      <div class="mt-4 flex flex-wrap gap-2 items-center p-3 glass rounded-xl">
        <span class="text-xs text-slate-500">Will be tagged:</span>
        ${getShiftBadgeHTML(shift)}
        <span class="chip"><i class="fa-regular fa-calendar text-xs"></i> ${getWorkingDate()}</span>
        <span class="chip"><i class="fa-regular fa-clock text-xs"></i> <span id="form-time-tag">${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></span>
        <span class="chip"><i class="fa-solid fa-user text-xs"></i> ${currentUser.name}</span>
      </div>

      <div class="flex gap-3 mt-5">
        <button onclick="clearForm()" class="btn btn-secondary"><i class="fa-solid fa-rotate-left"></i> Reset</button>
        <button id="save-btn" onclick="saveEntry()" class="btn btn-primary flex-1 justify-center">
          <i class="fa-solid ${editingEntryId ? 'fa-pen-to-square' : 'fa-floppy-disk'}"></i> 
          <span>${editingEntryId ? 'Update Entry' : 'Save Entry'}</span>
        </button>
      </div>
    </div>

    <!-- Today's entries quick view -->
    <div class="glass rounded-xl overflow-hidden">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-white/5 gap-3">
        <div class="flex items-center justify-between w-full sm:w-auto">
          <div class="section-title shrink-0">Today's Entries</div>
          <button onclick="navigateTo('user-entries')" class="btn btn-ghost btn-sm sm:hidden">View All <i class="fa-solid fa-arrow-right text-xs ml-1"></i></button>
        </div>
        <div class="search-wrap flex-1 w-full max-w-sm mx-auto sm:mx-0">
          <i class="fa-solid fa-magnifying-glass search-icon text-xs"></i>
          <input id="ud-today-search" type="text" class="form-input" placeholder="Search products…" oninput="filterTodayEntries()" />
        </div>
        <button onclick="navigateTo('user-entries')" class="btn btn-ghost btn-sm hidden sm:flex shrink-0">View All <i class="fa-solid fa-arrow-right text-xs ml-1"></i></button>
      </div>
      <div class="overflow-x-auto">
        <table class="data-table" id="ud-today-table">
          <thead><tr><th>Product</th><th>Opening</th><th>Received</th><th>Stock Out</th><th>Damaged</th><th>Closing</th><th>Remaining</th><th>Variance</th><th>Time</th><th></th></tr></thead>
          <tbody>
            ${today.slice().reverse().map(e => `
            <tr>
              <td class="font-500 text-white">${e.productName}</td>
              <td class="mono">${e.opening}</td>
              <td class="mono">${e.received}</td>
              <td class="mono ${Number(e.disbursed || 0) > 0 ? 'text-brand' : ''}">${e.disbursed || 0}</td>
              <td class="mono ${Number(e.damaged) > 0 ? 'text-red-400' : ''}">${e.damaged}</td>
              <td class="mono">${e.closing}</td>
              <td class="mono font-600 text-white">${e.total}</td>
              <td class="mono ${Number(e.variance) !== 0 ? 'text-amber-400' : ''}">${e.variance}</td>
              <td class="mono text-xs text-slate-500">${e.time}</td>
              <td>
                <button onclick="editEntry('${e.id}')" class="btn btn-ghost btn-sm text-brand p-1" title="Edit Entry">
                  <i class="fa-solid fa-pen text-xs"></i>
                </button>
              </td>
            </tr>`).join('') || '<tr><td colspan="9" class="text-center text-slate-500 py-8">No entries yet today</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function filterTodayEntries() {
  const term = (document.getElementById('ud-today-search')?.value || '').toLowerCase();
  const rows = document.querySelectorAll('#ud-today-table tbody tr');
  rows.forEach(row => {
    if (row.cells.length === 1) return; // Skip "No entries yet today" row
    const prodName = row.cells[0].textContent.toLowerCase();
    row.style.display = prodName.includes(term) ? '' : 'none';
  });
}

function editEntry(id) {
  const entries = db_entries;
  const e = entries.find(x => String(x.id) === String(id));
  if (!e) return;

  // Find previous entry's closing stock
  const lastEntry = entries
    .filter(entry => entry.productId === e.productId && entry.id !== id)
    .sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      return dateCmp !== 0 ? dateCmp : b.time.localeCompare(a.time);
    })[0];

  const openingStock = lastEntry ? lastEntry.closing : e.opening;

  document.getElementById('modal-content').innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-lg font-700 text-white">Edit Stock Entry</h3>
        <button onclick="closeModal()" class="btn btn-ghost btn-sm p-1.5 rounded-lg"><i class="fa-solid fa-xmark"></i></button>
      </div>
      
      <div class="space-y-4">
        <!-- Product & Opening (Read-only) -->
        <div class="glass rounded-xl p-4 bg-slate-800/50">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-xs text-slate-500 mb-1 font-600">Product</div>
              <div class="text-white font-600">${e.productName}</div>
            </div>
            <div>
              <div class="text-xs text-slate-500 mb-1 font-600">Opening Stock (from previous)</div>
              <div class="mono text-xl font-700 text-amber-400">${openingStock}</div>
            </div>
          </div>
        </div>

        <!-- Input Fields -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-600 text-slate-400 mb-1.5 uppercase tracking-wide">Received</label>
            <input id="em-received" type="text" inputmode="numeric" class="form-input" value="${e.received}" oninput="calcEditStock()" placeholder="0" />
          </div>
          <div>
            <label class="block text-xs font-600 text-slate-400 mb-1.5 uppercase tracking-wide">Stock Out</label>
            <input id="em-disbursed" type="text" inputmode="numeric" class="form-input" value="${e.disbursed || 0}" oninput="calcEditStock()" placeholder="0" />
          </div>
          <div>
            <label class="block text-xs font-600 text-slate-400 mb-1.5 uppercase tracking-wide">Damaged</label>
            <input id="em-damaged" type="text" inputmode="numeric" class="form-input" value="${e.damaged}" oninput="calcEditStock()" placeholder="0" />
          </div>
        </div>

        <!-- Auto-calculated Results -->
        <div class="glass rounded-xl p-4 border border-brand/30 bg-brand/10">
          <div class="grid grid-cols-3 gap-4">
            <div>
              <div class="text-xs text-slate-400 mb-1">Remaining Stock</div>
              <div id="em-total" class="mono text-2xl font-700 text-white">—</div>
            </div>
            <div>
              <div class="text-xs text-slate-400 mb-1">Closing</div>
              <div id="em-closing" class="mono text-2xl font-700 text-brand">—</div>
            </div>
            <div>
              <div class="text-xs text-slate-400 mb-1">Variance</div>
              <div id="em-variance" class="mono text-2xl font-700 text-slate-400">—</div>
            </div>
          </div>
        </div>
      </div>

      <div class="flex gap-3 mt-6">
        <button onclick="closeModal()" class="btn btn-secondary flex-1 justify-center">Cancel</button>
        <button onclick="saveEditEntry('${id}', ${openingStock})" class="btn btn-primary flex-1 justify-center">
          <i class="fa-solid fa-check"></i> Save Changes
        </button>
      </div>
    </div>`;

  openModal();
  calcEditStock();
}

function calcEditStock() {
  const received = Number(document.getElementById('em-received')?.value || 0);
  const disbursed = Number(document.getElementById('em-disbursed')?.value || 0);
  const damaged = Number(document.getElementById('em-damaged')?.value || 0);
  const openingEl = document.querySelector('[value*=""]');

  // Get opening from the modal display
  const openingText = document.querySelector('.mono.text-xl.font-700.text-amber-400')?.textContent;
  const opening = Number(openingText || 0);

  const expected = opening + received - damaged - disbursed;
  const closing = expected >= 0 ? expected : 0;
  const variance = closing - expected;

  const totalEl = document.getElementById('em-total');
  const closingEl = document.getElementById('em-closing');
  const varEl = document.getElementById('em-variance');

  if (totalEl) totalEl.textContent = expected >= 0 ? expected : '0';
  if (closingEl) closingEl.textContent = closing;
  if (varEl) {
    if (variance === 0) {
      varEl.textContent = '✓ 0';
      varEl.className = 'mono text-2xl font-700 text-green-400';
    } else {
      varEl.textContent = variance > 0 ? `+${variance}` : variance;
      varEl.className = 'mono text-2xl font-700 text-amber-400';
    }
  }
}

async function saveEditEntry(id, opening) {
  const received = Number(document.getElementById('em-received')?.value || 0);
  const disbursed = Number(document.getElementById('em-disbursed')?.value || 0);
  const damaged = Number(document.getElementById('em-damaged')?.value || 0);
  const closing = Number(document.getElementById('em-closing')?.textContent || 0);
  const variance = closing - (opening + received - damaged - disbursed);

  if (received < 0 || disbursed < 0 || damaged < 0) {
    showToast('No negative values allowed', 'error');
    return;
  }

  const btn = document.querySelector('.modal-box button.btn-primary');
  const orgHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
  btn.disabled = true;

  try {
    const entryData = {
      date: getWorkingDate(),
      opening,
      received,
      damaged,
      disbursed,
      closing,
      variance
    };

    const entry = db_entries.find(e => String(e.id) === String(id));
    const result = await API.updateEntry(id, entryData);

    db_entries = db_entries.map(e => String(e.id) === String(id) ? {
      ...result,
      productName: entry.productName,
      unit: entry.unit
    } : e);

    closeModal();
    navigateTo(activePage, true);
    showToast('Entry updated successfully', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    btn.innerHTML = orgHtml;
    btn.disabled = false;
  }
}

function updateUnit() {
  const sel = document.getElementById('f-product');
  const opt = sel.options[sel.selectedIndex];
  const unit = opt?.dataset?.unit;
  const hint = document.getElementById('f-unit-hint');
  if (hint) hint.textContent = unit ? `Unit: ${unit}` : '';

  const productId = sel?.value;
  const openingInput = document.getElementById('f-opening');
  if (openingInput && productId) {
    const entries = db_entries;
    const lastEntry = entries.filter(e => e.productId === productId).sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      return dateCmp !== 0 ? dateCmp : b.time.localeCompare(a.time);
    })[0];

    if (lastEntry) {
      if (!openingInput.value) {
        openingInput.value = lastEntry.closing;
      }
    } else {
      openingInput.value = '';
    }
    calcStock();
  }
}

function calcStock(source = 'auto') {
  const opVal = document.getElementById('f-opening').value;
  const reVal = document.getElementById('f-received').value;
  const daVal = document.getElementById('f-damaged').value;
  const diVal = document.getElementById('f-disbursed').value;
  const clEl = document.getElementById('f-closing');

  const opening = Number(opVal) || 0;
  const received = Number(reVal) || 0;
  const damaged = Number(daVal) || 0;
  const disbursed = Number(diVal) || 0;

  const expected = opening + received - damaged - disbursed;

  if (source !== 'closing') {
    clEl.value = expected >= 0 ? expected : 0;
  }

  const closing = Number(clEl.value) || 0;
  const variance = closing - expected;

  const totEl = document.getElementById('calc-total');
  const varEl = document.getElementById('calc-variance');

  if (totEl) { totEl.textContent = expected >= 0 ? expected : '0'; }
  if (varEl) {
    if (variance === 0) {
      varEl.textContent = '✓ 0';
      varEl.className = 'mono font-700 text-green-400';
    } else {
      varEl.textContent = variance > 0 ? `+${variance}` : variance;
      varEl.className = 'mono font-700 text-amber-400';
    }
  }
}

function clearForm() {
  ['f-product', 'f-opening', 'f-received', 'f-damaged', 'f-disbursed', 'f-closing'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.tagName === 'SELECT' ? el.selectedIndex = 0 : el.value = ''; }
  });
  editingEntryId = null;
  const btn = document.getElementById('save-btn');
  if (btn) {
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Entry`;
  }
  calcStock();
  updateUnit();
}

async function saveEntry() {
  const productEl = document.getElementById('f-product');
  const productId = productEl?.value;
  const opening = Number(document.getElementById('f-opening').value);
  const received = Number(document.getElementById('f-received').value) || 0;
  const damaged = Number(document.getElementById('f-damaged').value) || 0;
  const disbursed = Number(document.getElementById('f-disbursed').value) || 0;
  const closing = Number(document.getElementById('f-closing').value);

  if (!productId) { showToast('Please select a product', 'error'); productEl.focus(); return; }
  if (document.getElementById('f-opening').value === '') { showToast('Opening stock is required', 'error'); return; }
  if (document.getElementById('f-closing').value === '') { showToast('Closing stock is required', 'error'); return; }

  const products = db_products;
  const product = products.find(p => String(p.id) === String(productId));

  if (!product) {
    showToast('Selected product not found in database', 'error');
    return;
  }

  const now = new Date();
  const shift = getCurrentShift(now);
  const today = getWorkingDate(now);

  if (opening < 0 || received < 0 || damaged < 0 || disbursed < 0 || closing < 0) {
    showToast('No negative values allowed', 'error');
    return;
  }

  // Check for duplicate entry on same product today (unless editing)
  if (!editingEntryId) {
    const existingEntry = db_entries.find(e =>
      String(e.userId) === String(currentUser.id) &&
      String(e.productId) === String(productId) &&
      e.date === today
    );
    if (existingEntry) {
      showConfirm('Duplicate Entry Alert',
        `You already have an entry for ${product.name} today. Do you want to update it instead?`,
        () => {
          editingEntryId = existingEntry.id;
          saveEntry();
        },
        'fa-exclamation-circle',
        'rgba(245,158,11,0.1)',
        '#fbbf24'
      );
      return;
    }
  }

  const btn = document.getElementById('save-btn');
  const orgHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
  btn.disabled = true;

  try {
    const entryData = {
      product_id: productId,
      opening, received, damaged, disbursed, closing,
      variance: closing - (opening + received - damaged - disbursed),
      shift,
      entry_date: today,
      entry_time: now.toLocaleTimeString('en-GB')
    };

    let result;
    if (editingEntryId) {
      result = await API.updateEntry(editingEntryId, entryData);
      db_entries = db_entries.map(e => String(e.id) === String(editingEntryId) ? { ...result, productName: product.name, unit: product.unit } : e);
      showToast(`Entry updated for ${product.name}!`, 'success');
    } else {
      result = await API.createEntry(entryData);
      db_entries.push({ ...result, productName: product.name, unit: product.unit });
      showToast(`Entry saved for ${product.name}!`, 'success');
    }

    clearForm();

    // Refresh data and re-render current page
    try {
      db_entries = await API.getEntries();
      db_products = await API.getProducts();

      // IMPORTANT: Re-render the current view to show the new entry immediately
      const currentPage = activePage;
      if (currentPage === 'user-dashboard' || currentPage === 'admin-home') {
        navigateTo(currentPage, true);
      }
    } catch (e) {
      console.warn("Could not refresh UI data:", e);
      navigateTo(activePage, true);
    }
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    btn.innerHTML = orgHtml;
    btn.disabled = false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  USER ENTRIES (History)
// ════════════════════════════════════════════════════════════════════════════
function renderUserEntries() {
  return `
  <div class="space-y-4">
    <!-- Filters -->
    <div class="glass rounded-xl p-4">
      <div class="grid sm:grid-cols-3 gap-3">
        <div class="search-wrap">
          <i class="fa-solid fa-magnifying-glass search-icon text-xs"></i>
          <input id="ue-search" type="text" class="form-input" placeholder="Search products…" oninput="debouncedUserEntriesTable()" />
        </div>
        <input id="ue-date" type="date" class="form-input" onchange="renderUserEntriesTable()" />
        <select id="ue-shift" class="form-input" onchange="renderUserEntriesTable()">
          <option value="">All Shifts</option>
          <option value="morning">Morning Shift</option>
          <option value="night">Night Shift</option>
        </select>
      </div>
    </div>

    <div class="glass rounded-xl overflow-hidden">
      <div class="flex items-center justify-between p-4 border-b border-white/5">
        <div>
          <div class="section-title">My Stock History</div>
          <div class="section-sub">All your recorded entries</div>
        </div>
        <div id="ue-count" class="text-xs text-slate-500"></div>
      </div>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead><tr>
            <th>Date</th><th>Product</th><th>Opening</th><th>Received</th>
            <th>Stock Out</th><th>Damaged</th><th>Closing</th><th>Remaining</th><th>Variance</th><th>Shift</th><th>Time</th>
          </tr></thead>
          <tbody id="ue-tbody"></tbody>
        </table>
      </div>
      <div id="ue-pagination" class="flex items-center justify-between p-4 border-t border-white/5"></div>
    </div>
  </div>`;
}

let uePage = 1; const uePerPage = 10;
function renderUserEntriesTable() {
  const search = (document.getElementById('ue-search') || {}).value?.toLowerCase() || '';
  const date = (document.getElementById('ue-date') || {}).value || '';
  const shift = (document.getElementById('ue-shift') || {}).value || '';

  let rows = db_entries.filter(e => {
    if (e.userId !== currentUser.id) return false;
    if (search && !e.productName.toLowerCase().includes(search)) return false;
    if (date && e.date !== date) return false;
    if (shift && e.shift !== shift) return false;
    return true;
  }).reverse();

  const count = document.getElementById('ue-count');
  if (count) count.textContent = `${rows.length} entries`;

  const totalPages = Math.ceil(rows.length / uePerPage) || 1;
  if (uePage > totalPages) uePage = 1;
  const paged = rows.slice((uePage - 1) * uePerPage, uePage * uePerPage);

  const tbody = document.getElementById('ue-tbody');
  if (tbody) tbody.innerHTML = paged.map(e => `
    <tr>
      <td class="mono text-xs font-600">${e.date}</td>
      <td class="font-500 text-white">${e.productName}</td>
      <td class="mono">${e.opening}</td>
      <td class="mono">${e.received}</td>
      <td class="mono ${Number(e.disbursed || 0) > 0 ? 'text-brand' : ''}">${e.disbursed || 0}</td>
      <td class="mono ${Number(e.damaged) > 0 ? 'text-red-400' : ''}">${e.damaged}</td>
      <td class="mono">${e.closing}</td>
      <td class="mono font-600 text-white">${e.total}</td>
      <td class="mono ${Number(e.variance) !== 0 ? 'text-amber-400 font-600' : ''}">${e.variance}</td>
      <td>${getShiftBadgeHTML(e.shift)}</td>
      <td class="mono text-xs text-slate-500">${e.time}</td>
    </tr>`).join('') || '<tr><td colspan="11" class="text-center text-slate-500 py-10">No entries found</td></tr>';

  const pg = document.getElementById('ue-pagination');
  if (pg) pg.innerHTML = paginationHTML(uePage, totalPages, 'uePage', 'renderUserEntriesTable');
}

// ── PAGE INIT (called after render) ──────────────────────────────────────────
function initPage(page) {
  if (page === 'admin-stock') { asPage = 1; renderAdminStockTable(); }
  if (page === 'admin-products') { renderProductTable(); }
  if (page === 'admin-audit') { renderAuditTable(); }
  if (page === 'user-entries') { uePage = 1; renderUserEntriesTable(); }
  // Update form time tag every minute
  if (page === 'user-dashboard') {
    setInterval(() => {
      const el = document.getElementById('form-time-tag');
      if (el) el.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }, 30000);
  }
}

// ── PAGINATION ────────────────────────────────────────────────────────────────
function paginationHTML(current, total, varName, fn) {
  if (total <= 1) return '';
  const pages = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - current) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  return `
  <div class="flex items-center gap-2 text-sm">
    <span class="text-slate-500">Page ${current} of ${total}</span>
    <div class="flex gap-1 ml-auto">
      <button onclick="${varName}=${current}-1;${fn}()" ${current <= 1 ? 'disabled' : ''} class="btn btn-secondary btn-sm"><i class="fa-solid fa-chevron-left text-xs"></i></button>
      ${pages.map(p => p === '…' ? `<span class="btn btn-ghost btn-sm">…</span>` :
    `<button onclick="${varName}=${p};${fn}()" class="btn ${p === current ? 'btn-primary' : 'btn-ghost'} btn-sm">${p}</button>`).join('')}
      <button onclick="${varName}=${current}+1;${fn}()" ${current >= total ? 'disabled' : ''} class="btn btn-secondary btn-sm"><i class="fa-solid fa-chevron-right text-xs"></i></button>
    </div>
  </div>`;
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
function openModal() { document.getElementById('modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal').classList.add('hidden'); }
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) closeModal();
});

// ── CONFIRM DIALOG ───────────────────────────────────────────────────────────
function showConfirm(title, msg, cb, icon = 'fa-triangle-exclamation', iconBg = 'rgba(239,68,68,.1)', iconColor = '#f87171') {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-icon').innerHTML = `<i class="fa-solid ${icon} text-2xl" style="color:${iconColor}"></i>`;
  document.getElementById('confirm-icon').style.background = iconBg;
  document.getElementById('confirm-ok').onclick = () => { closeConfirm(); cb(); };
  document.getElementById('confirm-dialog').classList.remove('hidden');
}
function closeConfirm() { document.getElementById('confirm-dialog').classList.add('hidden'); }
document.getElementById('confirm-dialog').addEventListener('click', e => {
  if (e.target === document.getElementById('confirm-dialog')) closeConfirm();
});

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 3500) {
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warn: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type} animate-toast-in`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span class="flex-1">${msg}</span>
    <button onclick="this.parentElement.remove()" class="opacity-50 hover:opacity-100 transition-opacity ml-1"><i class="fa-solid fa-xmark text-xs"></i></button>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('animate-toast-out'); setTimeout(() => toast.remove(), 300); }, duration);
}

// ── INITIALIZATION ──────────────────────────────────────────────────────────
async function initApp() {
  const session = LS.get('sf_current_session');
  const token = API.getToken();
  const savedShift = LS.get('sf_session_shift');

  // Hide loading splash
  const splash = document.getElementById('loading-splash');
  if (splash) splash.classList.add('hidden');

  if (session && session.id && token) {
    currentUser = session;
    sessionShift = savedShift;  // Restore shift from previous session

    // Show app immediately with any cached data
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    buildSidebar();
    startClock();
    navigateTo(currentUser.role === 'admin' ? 'admin-home' : 'user-dashboard');

    // FIX 1: Always force a fresh data sync in the background after session restore
    // This ensures data from a new session appears without requiring re-login.
    try {
      const [freshProducts, freshEntries] = await Promise.all([
        API.request('/inventory/products', 'GET'),
        API.getEntries()
      ]);
      const dataChanged = JSON.stringify(freshEntries) !== JSON.stringify(db_entries) ||
                          JSON.stringify(freshProducts) !== JSON.stringify(db_products);
      db_products = freshProducts;
      db_entries = freshEntries;
      if (dataChanged) {
        // Re-render current page silently to show fresh data
        navigateTo(activePage, true);
      }
    } catch (e) {
      console.warn('Background session sync failed:', e.message);
    }
  } else {
    // Show login screen if no session
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
  }
}

// Start app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

