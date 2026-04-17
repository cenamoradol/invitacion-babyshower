/* =====================================================
   INVITACIÓN BABY SHOWER - CHRISTOPHER
   Frontend Logic — RSVP form with soltero/family modes
   ===================================================== */

const API_URL = '/api/rsvp';

// ─── Detect invitation mode from URL ───────────────────
// By default it is Individual. Only shows Family/Couple if ?soltero=false
const params  = new URLSearchParams(window.location.search);
const isSolo  = params.get('soltero') !== 'false';

// ─── DOM Elements ──────────────────────────────────────
const form         = document.getElementById('rsvp-form');
const successDiv   = document.getElementById('rsvp-success');
const errorDiv     = document.getElementById('form-error');
const errorText    = document.getElementById('form-error-text');
const submitBtn    = document.getElementById('submit-btn');
const submitLabel  = document.getElementById('submit-text');
const familyFields = document.getElementById('family-fields');
const soloBadge    = document.getElementById('solo-badge');

// ─── Apply mode on page load ───────────────────────────
if (isSolo) {
  // Solo mode: hide family fields, show badge
  if (familyFields) familyFields.style.display = 'none';
  if (soloBadge)    soloBadge.style.display = 'flex';
} else {
  // Family mode: show family fields, hide badge
  if (familyFields) familyFields.style.display = '';
  if (soloBadge)    soloBadge.style.display = 'none';
}

// ─── RSVP Form Submit ──────────────────────────────────
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const nombre = document.getElementById('nombre').value.trim();
    if (!nombre) { showError('Por favor ingresa tu nombre.'); return; }

    let personas = 1;
    let pareja   = '';
    let ninos    = 0;

    if (!isSolo) {
      // Family mode — count people
      const parejaVal = document.getElementById('pareja')?.value; 
      pareja = parejaVal === 'si' ? 'Sí' : 'No';
      const ninosVal = document.getElementById('ninos')?.value;
      ninos = ninosVal === 'si' ? 1 : 0;

      personas = 1; // the invitee
      if (pareja === 'Sí') personas += 1; // partner
      personas += ninos; // children
    }

    const telefono = document.getElementById('telefono')?.value.trim() || '';
    const mensaje  = document.getElementById('mensaje')?.value.trim() || '';
    const tipo     = isSolo ? 'individual' : 'familia';

    setLoading(true);

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, pareja, ninos, personas, telefono, mensaje, tipo })
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Ocurrió un error. Intenta de nuevo.');
        setLoading(false);
        return;
      }

      // Success! Update UI with people count
      const countSpan = document.getElementById('success-personas-count');
      if (countSpan) countSpan.textContent = personas;

      form.style.display = 'none';
      if (soloBadge) soloBadge.style.display = 'none';
      successDiv.style.display = 'block';
      successDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
      launchConfetti();

    } catch (err) {
      showError('No se pudo conectar. Verifica tu conexión e intenta de nuevo.');
      setLoading(false);
    }
  });
}

// ─── Helpers ───────────────────────────────────────────
function showError(msg) {
  errorDiv.style.display = 'flex';
  errorText.textContent  = msg;
  errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideError() {
  errorDiv.style.display = 'none';
}
function setLoading(loading) {
  submitBtn.disabled = loading;
  submitLabel.textContent = loading ? 'ENVIANDO...' : 'CONFIRMAR';
  submitBtn.style.opacity = loading ? '0.7' : '1';
}

// ─── Confetti 🎉 ──────────────────────────────────────
function launchConfetti() {
  const colors = ['#e2f2e4', '#abd0af', '#ffeaba', '#f0d685', '#a67c52', '#4a7c59', '#ffe8d6'];
  const count  = 80;

  if (!document.getElementById('confetti-style')) {
    const st = document.createElement('style');
    st.id = 'confetti-style';
    st.textContent = `
      @keyframes confettiFall {
        0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
        100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
      }
    `;
    document.head.appendChild(st);
  }

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed;
      top: -10px;
      left: ${Math.random() * 100}vw;
      width: ${Math.random() * 8 + 6}px;
      height: ${Math.random() * 8 + 6}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      pointer-events: none;
      z-index: 9999;
      animation: confettiFall ${Math.random() * 2 + 1.5}s ease-in forwards;
      animation-delay: ${Math.random() * 0.8}s;
    `;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// ─── Smooth scroll for nav ────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});
