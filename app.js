/* ════════════════════════════════════════════════════════════════════════════
  STOCKFLOW — FULL APPLICATION LOGIC
  ════════════════════════════════════════════════════════════════════════════ */

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const USERS = [
  { id: 'admin', username: 'rusine', password: 'rusine123', role: 'admin', name: 'Rusine Pegy', avatar: 'RP' },
  { id: 'john', username: 'john', password: 'john123', role: 'user', name: 'John Rwamanywa', avatar: 'JR' },
  { id: 'binama', username: 'binama', password: 'binama123', role: 'user', name: 'Binama David', avatar: 'BD' },
];

const DEFAULT_PRODUCTS = [];

// ── STATE ────────────────────────────────────────────────────────────────────
let currentUser = null;
let sidebarCollapsed = false;
let confirmCallback = null;

// ── LOCALSTORAGE HELPERS ─────────────────────────────────────────────────────
const LS = {
  get: (k, def = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  products: () => LS.get('sf_products_final', DEFAULT_PRODUCTS),
  entries: () => LS.get('sf_entries_final', []),
  saveProducts: p => LS.set('sf_products_final', p),
  saveEntries: e => LS.set('sf_entries_final', e),
};

// ── SHIFT SYSTEM ─────────────────────────────────────────────────────────────
function getCurrentShift(date = new Date()) {
  const h = date.getHours();
  return (h >= 8 && h < 18) ? 'morning' : 'night';
}
function getShiftLabel(shift) {
  return shift === 'morning' ? '☀️ Morning Shift (08:00–18:00)' : '🌙 Night Shift (18:00–08:00)';
}
function getShiftBadgeHTML(shift) {
  const cls = shift === 'morning' ? 'badge-amber' : 'badge-purple';
  const icon = shift === 'morning' ? 'fa-sun' : 'fa-moon';
  const label = shift === 'morning' ? 'Morning Shift' : 'Night Shift';
  return `<span class="badge ${cls}"><i class="fa-solid ${icon}"></i> ${label}</span>`;
}

// ── CLOCK ────────────────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
    const el = document.getElementById('clock-display');
    if (el) el.textContent = `${date} · ${time}`;
    const shift = getCurrentShift(now);
    const hdr = document.getElementById('header-shift-badge');
    if (hdr) hdr.innerHTML = getShiftBadgeHTML(shift);
    updateSidebarShift(shift);
  }
  tick(); setInterval(tick, 1000);
}
function updateSidebarShift(shift) {
  const el = document.getElementById('sidebar-shift');
  if (!el) return;
  const dotCls = shift === 'morning' ? 'shift-morning' : 'shift-night';
  const label = shift === 'morning' ? 'Morning Shift' : 'Night Shift';
  const time = shift === 'morning' ? '08:00 – 18:00' : '18:00 – 08:00';
  el.innerHTML = `<div class="flex items-center gap-2">
    <span class="shift-dot ${dotCls}"></span>
    <div class="sidebar-logo-text"><div class="text-xs font-600 text-white">${label}</div>
    <div class="text-xs text-slate-500">${time}</div></div></div>`;
}

// ── AUTH ─────────────────────────────────────────────────────────────────────
function togglePass() {
  const inp = document.getElementById('login-pass');
  const eye = document.getElementById('pass-eye');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  eye.className = inp.type === 'password' ? 'fa-solid fa-eye text-sm' : 'fa-solid fa-eye-slash text-sm';
}

function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const user = USERS.find(x => x.username === u && x.password === p);
  if (!user) { showToast('Invalid username or password', 'error'); shakeInput(); return; }
  const today = todayISO();
  const sessionKey = `sf_login_${user.id}_${today}`;
  let loginTime = LS.get(sessionKey);

  if (!loginTime) {
    loginTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    LS.set(sessionKey, loginTime);
  }

  currentUser = { ...user, loginTime };
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  buildSidebar();
  startClock();
  navigateTo(user.role === 'admin' ? 'admin-home' : 'user-dashboard');
  showToast(`Welcome back, ${user.name.split(' ')[0]}! 👋`, 'success');
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
    showConfirm(
      'Close Shift',
      'This will generate your shift report. You can then choose to sign out. Continue?',
      () => {
        printUserReport();
        setTimeout(() => {
          showConfirm('Finalize Sign Out', 'Shift report generated. Do you want to sign out now?', () => doLogout(), 'fa-arrow-right-from-bracket', 'rgba(245,158,11,0.1)', '#fbbf24');
        }, 600);
      },
      'fa-print', 'rgba(245,158,11,0.1)', '#fbbf24'
    );
  }
}
function doLogout() {
  setTimeout(() => {
    currentUser = null;
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
  }, 300);
}

// ── PRINT REPORT ─────────────────────────────────────────────────────────────
function printUserReport() {
  const entries = LS.entries().filter(e => e.userId === currentUser.id);
  const today = entries.filter(e => e.date === todayISO());
  const area = document.getElementById('print-area');
  const shift = getCurrentShift();
  const now = new Date();

  const rows = today.map(e => `
    <tr>
      <td>${e.productName}</td>
      <td>${e.opening}</td>
      <td>${e.received}</td>
      <td>${e.damaged}</td>
      <td>${e.closing}</td>
      <td>${e.total}</td>
      <td>${e.variance !== 0 ? `⚠ ${e.variance}` : '✓ 0'}</td>
      <td>${e.time}</td>
      <td>${e.shift}</td>
    </tr>`).join('');

  const totalDamaged = today.reduce((s, e) => s + Number(e.damaged), 0);
  const totalStock = today.reduce((s, e) => s + Number(e.total), 0);

  area.innerHTML = `
    <div class="print-section" style="font-family:Arial,sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:16px;">
        <div>
          <h1 style="margin:0;font-size:22pt;font-weight:900;letter-spacing:-0.5px;">StockFlow</h1>
          <p style="margin:0;font-size:9pt;color:#666;">Inventory Management System</p>
        </div>
        <div style="text-align:right;">
          <div style="font-size:14pt;font-weight:700;">SESSION STOCK REPORT</div>
          <div style="font-size:9pt;color:#333;">Printed: ${now.toLocaleString()}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;background:#f9f9f9;padding:12px;border-radius:6px;">
        <div><div style="font-size:8pt;color:#666;font-weight:700;text-transform:uppercase;">Staff Member</div><div style="font-size:11pt;font-weight:600;">${currentUser.name}</div></div>
        <div><div style="font-size:8pt;color:#666;font-weight:700;text-transform:uppercase;">Date</div><div style="font-size:11pt;font-weight:600;">${now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
        <div><div style="font-size:8pt;color:#666;font-weight:700;text-transform:uppercase;">Shift Timing</div><div style="font-size:11pt;font-weight:600;">Login: ${currentUser.loginTime} — Closed: ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9pt;">
        <thead>
          <tr style="background:#111;color:#fff;">
            <th style="padding:8px;text-align:left;border:1px solid #ddd;">Product</th>
            <th style="padding:8px;text-align:center;border:1px solid #ddd;">Opening</th>
            <th style="padding:8px;text-align:center;border:1px solid #ddd;">Received</th>
            <th style="padding:8px;text-align:center;border:1px solid #ddd;">Damaged</th>
            <th style="padding:8px;text-align:center;border:1px solid #ddd;">Closing</th>
            <th style="padding:8px;text-align:center;border:1px solid #ddd;">Total</th>
            <th style="padding:8px;text-align:center;border:1px solid #ddd;">Variance</th>
            <th style="padding:8px;text-align:center;border:1px solid #ddd;">Time</th>
            <th style="padding:8px;text-align:center;border:1px solid #ddd;">Shift</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="9" style="text-align:center;padding:12px;color:#666;">No entries for this session</td></tr>'}
        </tbody>
        <tfoot>
          <tr style="background:#f5f5f5;font-weight:700;">
            <td style="padding:8px;border:1px solid #ddd;">TOTALS</td>
            <td colspan="2" style="border:1px solid #ddd;"></td>
            <td style="padding:8px;text-align:center;border:1px solid #ddd;">${totalDamaged}</td>
            <td style="border:1px solid #ddd;"></td>
            <td style="padding:8px;text-align:center;border:1px solid #ddd;">${totalStock}</td>
            <td colspan="3" style="border:1px solid #ddd;"></td>
          </tr>
        </tfoot>
      </table>
      <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;padding-top:12px;border-top:1px solid #ccc;">
        <div><div style="font-size:8pt;color:#666;margin-bottom:30px;">Staff Signature</div><div style="border-top:1px solid #000;padding-top:4px;font-size:8pt;">${currentUser.name}</div></div>
        <div><div style="font-size:8pt;color:#666;margin-bottom:30px;">Supervisor Signature</div><div style="border-top:1px solid #000;padding-top:4px;font-size:8pt;">___________________</div></div>
        <div><div style="font-size:8pt;color:#666;margin-bottom:30px;">Date & Stamp</div><div style="border-top:1px solid #000;padding-top:4px;font-size:8pt;">${now.toLocaleDateString('en-GB')}</div></div>
      </div>
    </div>`;
  window.print();
}

// ── DATE HELPER ───────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().split('T')[0]; }
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── SIDEBAR BUILD ─────────────────────────────────────────────────────────────
function buildSidebar() {
  // User info
  document.getElementById('sidebar-user').innerHTML = `
    <div class="flex-shrink-0 w-9 h-9 rounded-xl bg-brand-700 flex items-center justify-center text-sm font-800 text-white">${currentUser.avatar}</div>
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
function navigateTo(page) {
  // Update active nav
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + page);
  if (navEl) navEl.classList.add('active');

  const titles = {
    'admin-home': ['Dashboard', 'Overview of your inventory system'],
    'admin-stock': ['Stock Entries', 'All recorded stock activity'],
    'admin-products': ['Product Management', 'Manage your product catalogue'],
    'admin-audit': ['Audit & Reports', 'Investigate historical stock data'],
    'admin-analytics': ['Analytics', 'Visual insights and trends'],
    'user-dashboard': ['Stock Entry', 'Record today\'s stock activity'],
    'user-entries': ['My Entries', 'Your recorded stock history'],
  };
  const [title, sub] = titles[page] || [page, ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-sub').textContent = sub;

  const container = document.getElementById('pages');
  container.innerHTML = '<div class="flex items-center justify-center py-16"><div class="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin"></div></div>';

  setTimeout(() => {
    container.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'animate-fade-in';
    div.innerHTML = renderPage(page);
    container.appendChild(div);
    initPage(page);
  }, 120);

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

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN HOME
// ════════════════════════════════════════════════════════════════════════════
function renderAdminHome() {
  const entries = LS.entries();
  const products = LS.products();
  const today = entries.filter(e => e.date === todayISO());
  const totalDmg = entries.reduce((s, e) => s + Number(e.damaged || 0), 0);
  const todayDmg = today.reduce((s, e) => s + Number(e.damaged || 0), 0);
  const users = USERS.filter(u => u.role === 'user');

  return `
  <div class="stagger space-y-6">
    <!-- Stats Row -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      ${statCard('fa-boxes-stacked', 'Total Entries', entries.length, 'badge-blue', 'All time')}
      ${statCard('fa-calendar-day', 'Today\'s Entries', today.length, 'badge-green', 'Entries today')}
      ${statCard('fa-triangle-exclamation', 'Total Damaged', totalDmg, 'badge-red', 'All time')}
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
              <th>Product</th><th>User</th><th>Total</th><th>Damaged</th><th>Shift</th><th>Time</th>
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
                <div class="w-8 h-8 rounded-lg bg-brand-700/30 flex items-center justify-center text-xs font-700 text-brand">${u.avatar}</div>
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
              <div class="text-xs text-slate-500">${shift === 'morning' ? '08:00–18:00' : '18:00–08:00'}</div>
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

function statCard(icon, label, value, badgeCls, sub) {
  return `
  <div class="glass rounded-xl p-5 glass-hover">
    <div class="flex items-start justify-between mb-3">
      <div class="text-xs font-600 text-slate-400 uppercase tracking-wide">${label}</div>
      <div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
        <i class="fa-solid ${icon} text-sm text-slate-400"></i>
      </div>
    </div>
    <div class="mono text-3xl font-700 text-white">${value.toLocaleString()}</div>
    <div class="text-xs text-slate-500 mt-1">${sub}</div>
  </div>`;
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
          <input id="as-search" type="text" class="form-input" placeholder="Search product, user…" oninput="renderAdminStockTable()" />
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
            <th>Damaged</th><th>Closing</th><th>Total</th><th>Variance</th>
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

  let rows = LS.entries().filter(e => {
    if (search && !`${e.productName} ${e.userName}`.toLowerCase().includes(search)) return false;
    if (date && e.date !== date) return false;
    if (user && e.userId !== user) return false;
    if (shift && e.shift !== shift) return false;
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
      <td class="mono ${Number(e.damaged) > 0 ? 'text-red-400' : ''}">${e.damaged}</td>
      <td class="mono">${e.closing}</td>
      <td class="mono font-600 text-white">${e.total}</td>
      <td class="mono ${Number(e.variance) !== 0 ? 'text-amber-400' : ''}">${e.variance}</td>
      <td>${getShiftBadgeHTML(e.shift)}</td>
      <td class="mono text-xs">${e.date}</td>
      <td class="mono text-xs text-slate-500">${e.time}</td>
      <td><button onclick="deleteEntry('${e.id}')" class="btn btn-ghost btn-sm text-red-400 hover:text-red-300 p-1"><i class="fa-solid fa-trash text-xs"></i></button></td>
    </tr>`).join('') || '<tr><td colspan="12" class="text-center text-slate-500 py-10">No entries match your filters</td></tr>';

  const pg = document.getElementById('as-pagination');
  if (pg) pg.innerHTML = paginationHTML(asPage, totalPages, 'asPage', 'renderAdminStockTable');
}

function deleteEntry(id) {
  showConfirm('Delete Entry', 'This will permanently remove this stock entry.', () => {
    const entries = LS.entries().filter(e => e.id !== id);
    LS.saveEntries(entries);
    renderAdminStockTable();
    showToast('Entry deleted', 'success');
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
          <input id="prod-search" type="text" class="form-input" placeholder="Search products…" oninput="renderProductTable()" />
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
  const products = LS.products().filter(p => !search || p.name.toLowerCase().includes(search));
  const entries = LS.entries();

  const tbody = document.getElementById('prod-tbody');
  if (!tbody) return;
  tbody.innerHTML = products.map((p, i) => {
    const cnt = entries.filter(e => e.productId === p.id).length;
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
  const products = LS.products();
  const p = id ? products.find(x => x.id === id) : null;
  const units = ['pcs', 'cartons', 'kg', 'liters', 'bags', 'boxes', 'bottles', 'rolls', 'qty'];

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

function saveProduct(id) {
  const rawName = document.getElementById('pm-name').value.trim();
  if (!rawName) { showToast('Product name is required', 'error'); return; }
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
  const unit = document.getElementById('pm-unit').value;
  const active = document.getElementById('pm-active').checked;

  let products = LS.products();
  if (id) {
    products = products.map(p => p.id === id ? { ...p, name, unit, active } : p);
    showToast('Product updated', 'success');
  } else {
    products.push({ id: `p${Date.now()}`, name, unit, active });
    showToast('Product added', 'success');
  }
  LS.saveProducts(products);
  closeModal();
  renderProductTable();
}

function toggleProductStatus(id) {
  const products = LS.products().map(p => p.id === id ? { ...p, active: !p.active } : p);
  LS.saveProducts(products);
  renderProductTable();
  showToast('Product status updated', 'info');
}

function deleteProduct(id) {
  const entries = LS.entries().filter(e => e.productId === id);
  showConfirm('Delete Product',
    entries.length ? `This product has ${entries.length} entries. Delete anyway?` : 'This action cannot be undone.',
    () => {
      LS.saveProducts(LS.products().filter(p => p.id !== id));
      renderProductTable();
      showToast('Product deleted', 'success');
    });
}

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN AUDIT
// ════════════════════════════════════════════════════════════════════════════
function renderAdminAudit() {
  return `
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <div class="section-title">Audit & Reports</div>
        <div class="section-sub">Investigate historical stock data</div>
      </div>
      <div class="flex gap-2">
        <button onclick="exportAuditCSV()" class="btn btn-secondary btn-sm"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
        <button onclick="printAuditReport()" class="btn btn-secondary btn-sm"><i class="fa-solid fa-print"></i> Print Report</button>
      </div>
    </div>

    <!-- Filters -->
    <div class="glass rounded-xl p-4">
      <div class="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label class="text-xs text-slate-500 mb-1 block">Select Date</label>
          <input id="aud-date" type="date" class="form-input" onchange="renderAuditTable()" />
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
            ${LS.products().map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
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
      </div>
      <div class="mt-3 flex gap-2">
        <button onclick="setAuditRange('today')" class="btn btn-ghost btn-sm">Today</button>
        <button onclick="setAuditRange('week')" class="btn btn-ghost btn-sm">This Week</button>
        <button onclick="setAuditRange('month')" class="btn btn-ghost btn-sm">This Month</button>
        <button onclick="clearAuditFilters()" class="btn btn-ghost btn-sm text-red-400">Clear</button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div id="aud-summary" class="grid grid-cols-2 lg:grid-cols-4 gap-4"></div>

    <!-- Table -->
    <div class="glass rounded-xl overflow-hidden">
      <div class="p-4 border-b border-white/5 flex items-center justify-between">
        <div class="section-title">Audit Results</div>
        <div id="aud-count" class="text-xs text-slate-500"></div>
      </div>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead><tr>
            <th>Date</th><th>Shift</th><th>User</th><th>Product</th>
            <th>Opening</th><th>Received</th><th>Damaged</th><th>Closing</th>
            <th>Total</th><th>Variance</th><th>Time</th>
          </tr></thead>
          <tbody id="aud-tbody"></tbody>
          <tfoot id="aud-tfoot"></tfoot>
        </table>
      </div>
      <div id="aud-pagination" class="flex items-center justify-between p-4 border-t border-white/5"></div>
    </div>
  </div>`;
}

let audPage = 1; const audPerPage = 15;
function getAuditFiltered() {
  const date = (document.getElementById('aud-date') || {}).value || '';
  const user = (document.getElementById('aud-user') || {}).value || '';
  const prod = (document.getElementById('aud-prod') || {}).value || '';
  const shift = (document.getElementById('aud-shift') || {}).value || '';

  return LS.entries().filter(e => {
    if (date && e.date !== date) return false;
    if (user && e.userId !== user) return false;
    if (prod && e.productId !== prod) return false;
    if (shift && e.shift !== shift) return false;
    return true;
  });
}

function renderAuditTable() {
  const rows = getAuditFiltered().sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const count = document.getElementById('aud-count');
  if (count) count.textContent = `${rows.length} records`;

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
      <td class="mono ${Number(e.damaged) > 0 ? 'text-red-400' : ''}">${e.damaged}</td>
      <td class="mono">${e.closing}</td>
      <td class="mono font-600 text-white">${e.total}</td>
      <td class="mono ${Number(e.variance) !== 0 ? 'text-amber-400' : ''}">${e.variance}</td>
      <td class="mono text-xs text-slate-500">${e.time}</td>
    </tr>`).join('') || '<tr><td colspan="11" class="text-center text-slate-500 py-10">No records match filters</td></tr>';

  // Footer totals
  const tfoot = document.getElementById('aud-tfoot');
  if (tfoot && rows.length) {
    tfoot.innerHTML = `<tr style="background:rgba(245,158,11,.06);font-weight:700;">
      <td colspan="4" class="px-4 py-3 text-amber-400 text-xs uppercase">Totals (${rows.length} records)</td>
      <td class="px-4 py-3 mono">${rows.reduce((s, e) => s + Number(e.opening || 0), 0)}</td>
      <td class="px-4 py-3 mono">${rows.reduce((s, e) => s + Number(e.received || 0), 0)}</td>
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
  const now = new Date(); const today = todayISO();
  if (range === 'today') {
    document.getElementById('aud-date').value = today;
  } else if (range === 'week') {
    // For single date selection, we'll just set it to the start of the week or today 
    // depending on preference. Usually "Select Date" implies a specific day.
    // Given the request "only to choose a date", we'll just set it to today for these presets.
    document.getElementById('aud-date').value = today;
  } else if (range === 'month') {
    document.getElementById('aud-date').value = today;
  }
  audPage = 1; renderAuditTable();
}

function clearAuditFilters() {
  const dateInput = document.getElementById('aud-date');
  if (dateInput) dateInput.value = '';
  ['aud-user', 'aud-prod', 'aud-shift'].forEach(id => document.getElementById(id).value = '');
  audPage = 1; renderAuditTable();
}

function exportAuditCSV() {
  const rows = getAuditFiltered();
  if (!rows.length) { showToast('No data to export', 'warn'); return; }
  const headers = ['Date', 'Shift', 'User', 'Product', 'Opening', 'Received', 'Damaged', 'Closing', 'Total', 'Variance', 'Time'];
  const csv = [headers.join(','), ...rows.map(e =>
    [e.date, e.shift, `"${e.userName}"`, `"${e.productName}"`, e.opening, e.received, e.damaged, e.closing, e.total, e.variance, e.time].join(',')
  )].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `stockflow-audit-${todayISO()}.csv`;
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
        <strong>Total Stock:</strong> ${rows.reduce((s, e) => s + Number(e.total || 0), 0)} &nbsp;|&nbsp;
        <strong>Total Damaged:</strong> ${rows.reduce((s, e) => s + Number(e.damaged || 0), 0)} &nbsp;|&nbsp;
        <strong>Total Variance:</strong> ${rows.reduce((s, e) => s + Number(e.variance || 0), 0)}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:8pt;">
        <thead><tr style="background:#111;color:#fff;">
          ${['Date', 'Shift', 'User', 'Product', 'Opening', 'Received', 'Damaged', 'Closing', 'Total', 'Variance', 'Time']
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

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN ANALYTICS
// ════════════════════════════════════════════════════════════════════════════
function renderAdminAnalytics() {
  const entries = LS.entries();
  const products = LS.products();

  // Group by date (last 7 days)
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    const dayEntries = entries.filter(e => e.date === iso);
    last7.push({
      date: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      total: dayEntries.reduce((s, e) => s + Number(e.total || 0), 0),
      damaged: dayEntries.reduce((s, e) => s + Number(e.damaged || 0), 0),
      count: dayEntries.length
    });
  }
  const maxTotal = Math.max(...last7.map(d => d.total)) || 1;

  // Top products by entries
  const prodStats = products.map(p => ({
    name: p.name, unit: p.unit,
    count: entries.filter(e => e.productId === p.id).length,
    damaged: entries.filter(e => e.productId === p.id).reduce((s, e) => s + Number(e.damaged || 0), 0)
  })).sort((a, b) => b.count - a.count).slice(0, 5);

  return `
  <div class="stagger space-y-6">
    <!-- Top stats -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      ${statCard('fa-boxes-stacked', 'Total Stock Recorded', entries.reduce((s, e) => s + Number(e.total || 0), 0), 'badge-blue', 'All time')}
      ${statCard('fa-triangle-exclamation', 'Total Damages', entries.reduce((s, e) => s + Number(e.damaged || 0), 0), 'badge-red', 'All time')}
      ${statCard('fa-clipboard-list', 'Total Entries', entries.length, 'badge-green', 'All time')}
      ${statCard('fa-percent', 'Damage Rate', entries.length ? Math.round((entries.filter(e => Number(e.damaged) > 0).length / entries.length) * 100) : 0, 'badge-amber', '% of entries w/ damage')}
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
  const products = LS.products().filter(p => p.active);
  const shift = getCurrentShift();
  const today = LS.entries().filter(e => e.userId === currentUser.id && e.date === todayISO());

  return `
  <div class="stagger space-y-6">
    <!-- Welcome + Shift -->
    <div class="glass rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <div class="flex-1">
        <div class="text-slate-400 text-sm">Welcome back,</div>
        <div class="text-xl font-700 text-white mt-0.5">${currentUser.name}</div>
        <div class="text-sm text-slate-500 mt-1">${new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
      <div class="flex flex-col items-start sm:items-end gap-2">
        ${getShiftBadgeHTML(shift)}
        <div class="text-xs text-slate-500">${shift === 'morning' ? '08:00 – 18:00' : '18:00 – 08:00'}</div>
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
        <div class="text-xs text-slate-500 mt-1">Total Stock</div>
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

        <!-- Damaged -->
        <div>
          <label class="block text-xs font-600 text-slate-400 mb-1.5 uppercase tracking-wide">Damaged Stock</label>
          <input id="f-damaged" type="text" inputmode="numeric" class="form-input" placeholder="0" oninput="calcStock()" onkeypress="return event.charCode >= 48 && event.charCode <= 57" />
        </div>

        <!-- Closing -->
        <div>
          <label class="block text-xs font-600 text-slate-400 mb-1.5 uppercase tracking-wide">Closing Stock (Auto) *</label>
          <input id="f-closing" type="text" class="form-input opacity-75" placeholder="0" readonly />
        </div>

        <!-- Auto calc display -->
        <div class="glass rounded-xl p-4 flex flex-col justify-center">
          <div class="text-xs text-slate-500 uppercase tracking-wide mb-2 font-600">Auto Calculated</div>
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs text-slate-400">Total Stock:</span>
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
        <span class="chip"><i class="fa-regular fa-calendar text-xs"></i> ${todayISO()}</span>
        <span class="chip"><i class="fa-regular fa-clock text-xs"></i> <span id="form-time-tag">${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></span>
        <span class="chip"><i class="fa-solid fa-user text-xs"></i> ${currentUser.name}</span>
      </div>

      <div class="flex gap-3 mt-5">
        <button onclick="clearForm()" class="btn btn-secondary"><i class="fa-solid fa-rotate-left"></i> Reset</button>
        <button onclick="saveEntry()" class="btn btn-primary flex-1 justify-center"><i class="fa-solid fa-floppy-disk"></i> Save Entry</button>
      </div>
    </div>

    <!-- Today's entries quick view -->
    <div class="glass rounded-xl overflow-hidden">
      <div class="flex items-center justify-between p-4 border-b border-white/5">
        <div class="section-title">Today's Entries</div>
        <button onclick="navigateTo('user-entries')" class="btn btn-ghost btn-sm">View All <i class="fa-solid fa-arrow-right text-xs ml-1"></i></button>
      </div>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead><tr><th>Product</th><th>Opening</th><th>Received</th><th>Damaged</th><th>Closing</th><th>Total</th><th>Variance</th><th>Time</th></tr></thead>
          <tbody>
            ${today.slice(-5).reverse().map(e => `
            <tr>
              <td class="font-500 text-white">${e.productName}</td>
              <td class="mono">${e.opening}</td>
              <td class="mono">${e.received}</td>
              <td class="mono ${Number(e.damaged) > 0 ? 'text-red-400' : ''}">${e.damaged}</td>
              <td class="mono">${e.closing}</td>
              <td class="mono font-600 text-white">${e.total}</td>
              <td class="mono ${Number(e.variance) !== 0 ? 'text-amber-400' : ''}">${e.variance}</td>
              <td class="mono text-xs text-slate-500">${e.time}</td>
            </tr>`).join('') || '<tr><td colspan="8" class="text-center text-slate-500 py-8">No entries yet today</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
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
    const entries = LS.entries();
    // Find the absolute last entry for this product across all users/dates
    const lastEntry = entries.filter(e => e.productId === productId).sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      return dateCmp !== 0 ? dateCmp : b.time.localeCompare(a.time);
    })[0];

    if (lastEntry) {
      openingInput.value = lastEntry.closing;
    } else {
      openingInput.value = '';
    }
    calcStock();
  }
}

function calcStock() {
  const opening = Number(document.getElementById('f-opening').value) || 0;
  const received = Number(document.getElementById('f-received').value) || 0;
  const damaged = Number(document.getElementById('f-damaged').value) || 0;

  // Total = opening + received − damaged
  const total = opening + received - damaged;

  const closingEl = document.getElementById('f-closing');
  if (closingEl) closingEl.value = total >= 0 ? total : 0;

  const closing = total >= 0 ? total : 0;
  const variance = 0;

  const totEl = document.getElementById('calc-total');
  const varEl = document.getElementById('calc-variance');
  if (totEl) { totEl.textContent = total >= 0 ? total : '—'; }
  if (varEl) {
    if (closing >= 0 && (opening > 0 || received > 0)) {
      varEl.textContent = '✓ 0';
      varEl.className = 'mono font-700 text-green-400';
    } else { varEl.textContent = '—'; varEl.className = 'mono font-700 text-slate-400'; }
  }
}

function clearForm() {
  ['f-product', 'f-opening', 'f-received', 'f-damaged', 'f-closing'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.tagName === 'SELECT' ? el.selectedIndex = 0 : el.value = ''; }
  });
  calcStock();
  updateUnit();
}

function saveEntry() {
  const productEl = document.getElementById('f-product');
  const productId = productEl?.value;
  const opening = Number(document.getElementById('f-opening').value);
  const received = Number(document.getElementById('f-received').value) || 0;
  const damaged = Number(document.getElementById('f-damaged').value) || 0;
  const closing = Number(document.getElementById('f-closing').value);

  // Validation
  if (!productId) { showToast('Please select a product', 'error'); productEl.focus(); return; }
  if (document.getElementById('f-opening').value === '') { showToast('Opening stock is required', 'error'); return; }

  const products = LS.products();
  const product = products.find(p => p.id === productId);
  const now = new Date();
  const shift = getCurrentShift(now);
  const today = now.toISOString().split('T')[0];
  const entries = LS.entries();

  // Duplicate Check
  const isDuplicate = entries.some(e => e.userId === currentUser.id && e.productId === productId && e.date === today && e.shift === shift);
  if (isDuplicate) {
    showToast(`You have already recorded an entry for ${product.name} in this shift.`, 'warn');
    return;
  }

  // Value Validation
  if (opening < 0 || received < 0 || damaged < 0 || closing < 0) { showToast('No negative values allowed', 'error'); return; }
  if (damaged > opening + received) { showToast('Damaged stock cannot exceed total available stock', 'error'); return; }

  const total = opening + received - damaged;
  const variance = 0;

  const entry = {
    id: `e${Date.now()}`,
    userId: currentUser.id,
    userName: currentUser.name,
    productId,
    productName: product.name,
    unit: product.unit,
    opening, received, damaged, closing, total, variance,
    shift,
    date: today,
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };

  entries.push(entry);
  LS.saveEntries(entries);

  showToast(`Entry saved for ${product.name}!`, 'success');
  clearForm();

  // Refresh today's table
  const tbody = document.querySelector('#pages tbody');
  if (tbody) navigateTo('user-dashboard');
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
          <input id="ue-search" type="text" class="form-input" placeholder="Search products…" oninput="renderUserEntriesTable()" />
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
            <th>Damaged</th><th>Closing</th><th>Total</th><th>Variance</th><th>Shift</th><th>Time</th>
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

  let rows = LS.entries().filter(e => {
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
      <td class="mono ${Number(e.damaged) > 0 ? 'text-red-400' : ''}">${e.damaged}</td>
      <td class="mono">${e.closing}</td>
      <td class="mono font-600 text-white">${e.total}</td>
      <td class="mono ${Number(e.variance) !== 0 ? 'text-amber-400 font-600' : ''}">${e.variance}</td>
      <td>${getShiftBadgeHTML(e.shift)}</td>
      <td class="mono text-xs text-slate-500">${e.time}</td>
    </tr>`).join('') || '<tr><td colspan="10" class="text-center text-slate-500 py-10">No entries found</td></tr>';

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
      <button onclick="window['${varName}']=${current}-1;${fn}()" ${current <= 1 ? 'disabled' : ''} class="btn btn-secondary btn-sm"><i class="fa-solid fa-chevron-left text-xs"></i></button>
      ${pages.map(p => p === '…' ? `<span class="btn btn-ghost btn-sm">…</span>` :
    `<button onclick="window['${varName}']=${p};${fn}()" class="btn ${p === current ? 'btn-primary' : 'btn-ghost'} btn-sm">${p}</button>`).join('')}
      <button onclick="window['${varName}']=${current}+1;${fn}()" ${current >= total ? 'disabled' : ''} class="btn btn-secondary btn-sm"><i class="fa-solid fa-chevron-right text-xs"></i></button>
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

