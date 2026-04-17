const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'rsvp.json');

// --- ADMIN PROTECTION ---
const ADMIN_PASSWORD = process.env.DASHBOARD_PASSWORD || 'Christopher2025';

function checkAdminAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (token === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'No autorizado. Se requiere contraseña.' });
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Ensure data dir and file exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ 
    confirmations: [], 
    settings: { deadline: "2026-06-01" } 
  }, null, 2));
}

function readDB() {
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  const data = JSON.parse(raw);
  // Migration for old data files
  if (!data.settings) data.settings = { deadline: "2026-06-01" };
  return data;
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// POST /api/rsvp - confirm attendance
app.post('/api/rsvp', (req, res) => {
  const { nombre, personas, pareja, ninos, telefono, mensaje, tipo } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre es requerido.' });
  }

  const db = readDB();

  // --- Date Validation ---
  const today = new Date();
  const deadlineDate = new Date(db.settings.deadline);
  // We set the deadline to the END of the day (23:59:59)
  deadlineDate.setHours(23, 59, 59, 999);

  if (today > deadlineDate) {
    return res.status(403).json({ error: 'El período de confirmación ha finalizado.' });
  }

  // Prevent duplicate entries by name (case-insensitive)
  const exists = db.confirmations.find(
    c => c.nombre.toLowerCase() === nombre.toLowerCase()
  );
  if (exists) {
    return res.status(409).json({ error: 'Ya existe una confirmación con ese nombre.' });
  }

  const entry = {
    id: Date.now().toString(),
    nombre: nombre.trim(),
    pareja: pareja ? pareja.trim() : '',
    ninos: parseInt(ninos) || 0,
    personas: parseInt(personas) || 1,
    tipo: tipo || 'individual',
    telefono: telefono ? telefono.trim() : '',
    mensaje: mensaje ? mensaje.trim() : '',
    fecha: new Date().toISOString()
  };

  db.confirmations.push(entry);
  writeDB(db);

  res.json({ success: true, data: entry });
});

// GET /api/rsvp - get all confirmations
app.get('/api/rsvp', checkAdminAuth, (req, res) => {
  const db = readDB();
  const totalPersonas = db.confirmations.reduce((sum, c) => sum + c.personas, 0);
  res.json({
    confirmations: db.confirmations,
    totalInvitados: db.confirmations.length,
    totalPersonas
  });
});

// DELETE /api/rsvp/:id - delete a confirmation
app.delete('/api/rsvp/:id', checkAdminAuth, (req, res) => {
  const db = readDB();
  const index = db.confirmations.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Confirmación no encontrada.' });
  }
  db.confirmations.splice(index, 1);
  writeDB(db);
  res.json({ success: true });
});

// GET /api/settings - get public settings
app.get('/api/settings', (req, res) => {
  const db = readDB();
  res.json(db.settings);
});

// POST /api/settings - update settings
app.post('/api/settings', checkAdminAuth, (req, res) => {
  const { deadline } = req.body;
  if (!deadline) return res.status(400).json({ error: 'Fecha requerida.' });
  
  const db = readDB();
  db.settings.deadline = deadline;
  writeDB(db);
  res.json({ success: true, settings: db.settings });
});

app.listen(PORT, () => {
  console.log(`\n🦁 Servidor Baby Shower corriendo en http://localhost:${PORT}`);
  console.log(`📊 Dashboard disponible en http://localhost:${PORT}/dashboard.html\n`);
});
