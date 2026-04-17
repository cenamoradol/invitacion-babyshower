/* =====================================================
   DASHBOARD JS - Baby Shower Christopher
   ===================================================== */

const API_URL      = '/api/rsvp';
const CAPACITY     = 100; // expected max guests
const REFRESH_SECS = 30;  // auto-refresh interval

let allGuests  = [];
let deleteId   = null;
let refreshTimer;

// ── Dom refs ─────────────────────────────────────────
const statFamilias  = document.getElementById('stat-familias');
const statPersonas  = document.getElementById('stat-personas');
const statPromedio  = document.getElementById('stat-promedio');
const capacityPct   = document.getElementById('capacity-pct');
const progressFill  = document.getElementById('progress-fill');
const capacitySub   = document.getElementById('capacity-sub');
const lastUpdate    = document.getElementById('last-update');
const loadingState  = document.getElementById('loading-state');
const emptyState    = document.getElementById('empty-state');
const tableWrap     = document.getElementById('table-wrap');
const tbody         = document.getElementById('guest-tbody');
const searchInput   = document.getElementById('search-input');
const refreshBtn    = document.getElementById('refresh-btn');
const exportBtn     = document.getElementById('export-btn');
const modalOverlay  = document.getElementById('modal-overlay');
const modalCancel   = document.getElementById('modal-cancel');
const modalConfirm  = document.getElementById('modal-confirm');
const toastEl       = document.getElementById('toast');
const loginOverlay  = document.getElementById('login-overlay');
const loginForm     = document.getElementById('login-form');
const loginInput    = document.getElementById('login-password');

// ── Auth Helper ────────────────────────────────────
function getAuthToken() {
  return sessionStorage.getItem('dashboard_token');
}

// ── Fetch ─────────────────────────────────────────────
async function fetchGuests() {
  const token = getAuthToken();
  if (!token) {
    showLogin();
    return;
  }

  refreshBtn.classList.add('spinning');
  try {
    const res  = await fetch(API_URL, {
      headers: { 'x-auth-token': token }
    });
    
    if (res.status === 401) {
      showLogin();
      return;
    }
    
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    allGuests  = data.confirmations || [];
    renderStats(data);
    renderTable(allGuests);
    lastUpdate.textContent = `Última actualización: ${formatTime(new Date())}`;
  } catch (err) {
    showToast('Error al cargar los datos.', 'error');
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

function showLogin() {
  loginOverlay.style.display = 'flex';
  loginInput.focus();
}

// ── Render stats ──────────────────────────────────────
function renderStats(data) {
  const familias = data.totalInvitados || 0;
  const personas = data.totalPersonas  || 0;
  const prom     = familias > 0 ? (personas / familias).toFixed(1) : '0';
  const pct      = Math.min(Math.round((personas / CAPACITY) * 100), 100);

  animateNumber(statFamilias, familias);
  animateNumber(statPersonas, personas);
  statPromedio.textContent = prom;

  capacityPct.textContent  = `${pct}%`;
  progressFill.style.width = `${pct}%`;
  capacitySub.textContent  = `${personas} de ${CAPACITY} personas esperadas`;

  // Change color if near capacity
  if (pct >= 90) progressFill.style.background = 'linear-gradient(90deg,#ba1a1a,#d35e5e)';
  else if (pct >= 70) progressFill.style.background = 'linear-gradient(90deg,#735c00,#cba72f)';
}

function animateNumber(el, target) {
  const start    = parseInt(el.textContent) || 0;
  const duration = 600;
  const step     = (target - start) / (duration / 16);
  let   current  = start;
  const tick = () => {
    current += step;
    if ((step > 0 && current >= target) || (step < 0 && current <= target)) {
      el.textContent = target;
    } else {
      el.textContent = Math.round(current);
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

// ── Render table ──────────────────────────────────────
function renderTable(guests) {
  loadingState.style.display = 'none';

  if (!guests || guests.length === 0) {
    emptyState.style.display  = 'flex';
    tableWrap.style.display   = 'none';
    return;
  }

  emptyState.style.display = 'none';
  tableWrap.style.display  = 'block';

  const tipoBadge = (tipo) => tipo === 'familia'
    ? '<span class="badge badge--familia">Familia</span>'
    : '<span class="badge badge--individual">Individual</span>';

  tbody.innerHTML = guests.map((g, i) => `
    <tr data-id="${g.id}">
      <td class="guest-num">${i + 1}</td>
      <td class="guest-name">${escHtml(g.nombre)}</td>
      <td class="guest-pareja">${g.pareja ? escHtml(g.pareja) : '<span style="opacity:.4">—</span>'}</td>
      <td>
        <span class="guest-personas-badge">
          <span class="material-icons-round" style="font-size:0.9rem">person</span>
          ${g.personas}
        </span>
      </td>
      <td>${g.ninos || 0}</td>
      <td>${tipoBadge(g.tipo)}</td>
      <td class="guest-phone">${g.telefono ? escHtml(g.telefono) : '<span style="opacity:.4">—</span>'}</td>
      <td class="guest-msg" title="${escHtml(g.mensaje || '')}">
        ${g.mensaje ? escHtml(g.mensaje) : '<span style="opacity:.4">—</span>'}
      </td>
      <td class="guest-date">${formatDateTime(g.fecha)}</td>
      <td>
        <button class="guest-delete" onclick="askDelete('${g.id}')" title="Eliminar">
          <span class="material-icons-round">delete_outline</span>
        </button>
      </td>
    </tr>
  `).join('');
}

// ── Search ────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  const q       = searchInput.value.trim().toLowerCase();
  const filtered = q
    ? allGuests.filter(g => g.nombre.toLowerCase().includes(q))
    : allGuests;
  renderTable(filtered);
});

// ── Delete ────────────────────────────────────────────
window.askDelete = (id) => {
  deleteId = id;
  modalOverlay.style.display = 'flex';
};

modalCancel.addEventListener('click', () => {
  modalOverlay.style.display = 'none';
  deleteId = null;
});

modalConfirm.addEventListener('click', async () => {
  if (!deleteId) return;
  const token = getAuthToken();
  modalOverlay.style.display = 'none';
  try {
    const res = await fetch(`${API_URL}/${deleteId}`, { 
      method: 'DELETE',
      headers: { 'x-auth-token': token }
    });
    if (res.status === 401) {
      showLogin();
      return;
    }
    if (!res.ok) throw new Error();
    showToast('Confirmación eliminada', 'success');
    await fetchGuests();
  } catch {
    showToast('Error al eliminar. Intenta de nuevo.', 'error');
  }
  deleteId = null;
});

// ── Login Submit ─────────────────────────────────────
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pass = loginInput.value.trim();
  if (!pass) return;

  sessionStorage.setItem('dashboard_token', pass);
  loginInput.value = '';
  loginOverlay.style.display = 'none';
  fetchGuests();
});

// Close modal on overlay click
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) {
    modalOverlay.style.display = 'none';
    deleteId = null;
  }
});

// ── Refresh ───────────────────────────────────────────
refreshBtn.addEventListener('click', fetchGuests);

function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(fetchGuests, REFRESH_SECS * 1000);
}

// ── Export CSV ────────────────────────────────────────
exportBtn.addEventListener('click', () => {
  if (!allGuests.length) { showToast('No hay datos para exportar.', 'error'); return; }

  const header = ['#', 'Nombre', 'Pareja', 'Personas', 'Niños', 'Tipo', 'Teléfono', 'Mensaje', 'Fecha'];
  const rows   = allGuests.map((g, i) => [
    i + 1,
    `"${g.nombre}"`,
    `"${g.pareja || ''}"`,
    g.personas,
    g.ninos || 0,
    g.tipo || 'individual',
    `"${g.telefono || ''}"`,
    `"${(g.mensaje || '').replace(/"/g, '""')}"`,
    formatDateTime(g.fecha)
  ]);

  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `invitados-christopher-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exportado correctamente ✓', 'success');
});

// ── Toast ─────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'default') {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.className   = `toast toast--visible toast--${type}`;
  toastTimer = setTimeout(() => {
    toastEl.className = 'toast';
  }, 3500);
}

// ── Helpers ───────────────────────────────────────────
function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
}

function formatTime(d) {
  return d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────
fetchGuests();
startAutoRefresh();
