/* =====================================================
   DASHBOARD JS - Baby Shower Christopher
   ===================================================== */

const API_URL      = '/api/rsvp';
const CAPACITY     = 100; // expected max guests
const REFRESH_SECS = 30;  // auto-refresh interval

let allGuests  = [];
let deleteId   = null;
let bulkDeleteIds = []; // Track IDs for bulk deletion
let refreshTimer;
let selectedIds = new Set(); // Track selected row IDs

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
const importBtn     = document.getElementById('import-btn');
const importInput   = document.getElementById('import-input');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
const selectedCount = document.getElementById('selected-count');
const selectAllCheckbox = document.getElementById('select-all-guests');
const modalOverlay  = document.getElementById('modal-overlay');
const modalCancel   = document.getElementById('modal-cancel');
const modalConfirm  = document.getElementById('modal-confirm');
const toastEl       = document.getElementById('toast');
const loginOverlay  = document.getElementById('login-overlay');
const loginForm     = document.getElementById('login-form');
const loginInput    = document.getElementById('login-password');
const deadlineInput = document.getElementById('deadline-input');
const saveSettingsBtn = document.getElementById('save-settings');

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
    
    // Clear selection if guests are no longer present
    const currentIds = new Set(allGuests.map(g => g.id));
    selectedIds.forEach(id => {
      if (!currentIds.has(id)) selectedIds.delete(id);
    });
    updateBulkActionsUI();

    renderStats(data);
    renderTable(allGuests);
    lastUpdate.textContent = `Última actualización: ${formatTime(new Date())}`;
    
    // Also fetch settings when successful
    fetchSettings();
  } catch (err) {
    showToast('Error al cargar los datos.', 'error');
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error();
    const settings = await res.json();
    if (deadlineInput) deadlineInput.value = settings.deadline;
  } catch (err) {
    console.error('Error fetching settings');
  }
}

async function updateSettings() {
  const token = getAuthToken();
  const deadline = deadlineInput.value;
  if (!deadline) return;

  saveSettingsBtn.disabled = true;
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-auth-token': token
      },
      body: JSON.stringify({ deadline })
    });

    if (res.status === 401) {
      showLogin();
      return;
    }

    if (!res.ok) throw new Error();
    showToast('Fecha límite actualizada', 'success');
  } catch (err) {
    showToast('Error al guardar ajustes', 'error');
  } finally {
    saveSettingsBtn.disabled = false;
  }
}

if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener('click', updateSettings);
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
    <tr data-id="${g.id}" class="${selectedIds.has(g.id) ? 'row-selected' : ''}">
      <td>
        <input type="checkbox" class="guest-checkbox row-checkbox" 
               data-id="${g.id}" ${selectedIds.has(g.id) ? 'checked' : ''} />
      </td>
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

  // Update "Select All" state
  const allOnPageChecked = guests.every(g => selectedIds.has(g.id));
  selectAllCheckbox.checked = guests.length > 0 && allOnPageChecked;
  selectAllCheckbox.indeterminate = !allOnPageChecked && guests.some(g => selectedIds.has(g.id));

  // Add event listeners to checkboxes
  document.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      
      updateBulkActionsUI();
      renderTable(getFilteredGuests()); // Refresh to update row classes and select-all state
    });
  });
}

function getFilteredGuests() {
  const q = searchInput.value.trim().toLowerCase();
  return q ? allGuests.filter(g => g.nombre.toLowerCase().includes(q)) : allGuests;
}

// ── Selection Logic ───────────────────────────────────
selectAllCheckbox.addEventListener('change', (e) => {
  const visibleGuests = getFilteredGuests();
  if (e.target.checked) {
    visibleGuests.forEach(g => selectedIds.add(g.id));
  } else {
    visibleGuests.forEach(g => selectedIds.delete(g.id));
  }
  updateBulkActionsUI();
  renderTable(visibleGuests);
});

function updateBulkActionsUI() {
  const count = selectedIds.size;
  selectedCount.textContent = count;
  bulkDeleteBtn.style.display = count > 0 ? 'inline-flex' : 'none';
}

// ── Search ────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  renderTable(getFilteredGuests());
});

// ── Delete ────────────────────────────────────────────
window.askDelete = (id) => {
  deleteId = id;
  bulkDeleteIds = [];
  modalOverlay.style.display = 'flex';
  document.querySelector('.modal__title').textContent = 'Eliminar confirmación';
  document.querySelector('.modal__text').textContent = '¿Seguro que deseas eliminar esta confirmación?';
};

bulkDeleteBtn.addEventListener('click', () => {
  if (selectedIds.size === 0) return;
  bulkDeleteIds = Array.from(selectedIds);
  deleteId = null;
  modalOverlay.style.display = 'flex';
  document.querySelector('.modal__title').textContent = 'Eliminar seleccionados';
  document.querySelector('.modal__text').textContent = `¿Seguro que deseas eliminar los ${selectedIds.size} invitados seleccionados?`;
});

modalCancel.addEventListener('click', () => {
  modalOverlay.style.display = 'none';
  deleteId = null;
  bulkDeleteIds = [];
});

modalConfirm.addEventListener('click', async () => {
  const token = getAuthToken();
  modalOverlay.style.display = 'none';
  
  try {
    if (deleteId) {
      // Single delete
      const res = await fetch(`${API_URL}/${deleteId}`, { 
        method: 'DELETE',
        headers: { 'x-auth-token': token }
      });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok) throw new Error();
      showToast('Confirmación eliminada', 'success');
    } else if (bulkDeleteIds.length > 0) {
      // Bulk delete
      const res = await fetch(`${API_URL}/bulk-delete`, { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-auth-token': token 
        },
        body: JSON.stringify({ ids: bulkDeleteIds })
      });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok) throw new Error();
      showToast(`${bulkDeleteIds.length} confirmaciones eliminadas`, 'success');
      selectedIds.clear();
      updateBulkActionsUI();
    }
    
    await fetchGuests();
  } catch {
    showToast('Error al eliminar. Intenta de nuevo.', 'error');
  }
  
  deleteId = null;
  bulkDeleteIds = [];
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
    bulkDeleteIds = [];
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

// ── Import CSV ────────────────────────────────────────
importBtn.addEventListener('click', () => importInput.click());

importInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const text = event.target.result;
      const guests = parseCSV(text);
      if (guests.length === 0) throw new Error('No se encontraron datos válidos.');

      const token = getAuthToken();
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify({ guests })
      });

      if (res.status === 401) { showLogin(); return; }
      if (!res.ok) throw new Error();

      const result = await res.json();
      showToast(`Importación exitosa: ${result.count} invitados`, 'success');
      fetchGuests();
    } catch (err) {
      showToast(err.message || 'Error al importar CSV.', 'error');
    } finally {
      importInput.value = ''; // Reset input
    }
  };
  reader.readAsText(file);
});

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  // Expected headers: #, Nombre, Pareja, Personas, Niños, Tipo, Teléfono, Mensaje, Fecha
  
  return lines.slice(1).map(line => {
    // Basic CSV splitting (doesn't handle commas inside quotes perfectly but works for simple cases)
    // For a more robust solution, use regex to split by comma outside quotes
    const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
    const cleanValues = values.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"'));

    return {
      nombre: cleanValues[1],
      pareja: cleanValues[2],
      personas: parseInt(cleanValues[3]) || 1,
      ninos: parseInt(cleanValues[4]) || 0,
      tipo: cleanValues[5]?.toLowerCase() || 'individual',
      telefono: cleanValues[6],
      mensaje: cleanValues[7],
      fecha: cleanValues[8] ? new Date(cleanValues[8]).toISOString() : new Date().toISOString()
    };
  }).filter(g => g.nombre);
}


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
