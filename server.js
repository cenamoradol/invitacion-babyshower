require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'rsvp.json');

// --- DATABASE CONNECTION ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

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
app.use(express.json({ limit: '10mb' })); // Higher limit for imports
app.use(express.static(__dirname));

// --- SQL HELPERS & INIT ---
async function initDB() {
  try {
    // Create confirmations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS confirmations (
        id VARCHAR(50) PRIMARY KEY,
        nombre TEXT NOT NULL,
        pareja TEXT,
        ninos INTEGER DEFAULT 0,
        personas INTEGER DEFAULT 1,
        tipo TEXT,
        telefono TEXT,
        mensaje TEXT,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT
      )
    `);

    // Set default deadline if not exists
    await pool.query(`
      INSERT INTO settings (key, value)
      VALUES ('deadline', '2026-06-01')
      ON CONFLICT (key) DO NOTHING
    `);

    console.log('✅ Database initialized');

    // --- MIGRATION FROM JSON ---
    if (fs.existsSync(DB_FILE)) {
      console.log('📦 Found rsvp.json, migrating data...');
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const data = JSON.parse(raw);
        
        // Migrate confirmations
        if (data.confirmations && data.confirmations.length > 0) {
          for (const c of data.confirmations) {
            await pool.query(`
              INSERT INTO confirmations (id, nombre, pareja, ninos, personas, tipo, telefono, mensaje, fecha)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT (id) DO NOTHING
            `, [c.id, c.nombre, c.pareja, c.ninos, c.personas, c.tipo, c.telefono, c.mensaje, c.fecha]);
          }
        }

        // Migrate settings
        if (data.settings && data.settings.deadline) {
          await pool.query(`
            UPDATE settings SET value = $1 WHERE key = 'deadline'
          `, [data.settings.deadline]);
        }

        // Backup and remove old DB file
        fs.renameSync(DB_FILE, DB_FILE + '.bak');
        console.log('✅ Migration complete. Old file renamed to rsvp.json.bak');
      } catch (err) {
        console.error('❌ Error during migration:', err);
      }
    }
  } catch (err) {
    console.error('❌ Error initializing database:', err);
  }
}

// Helper to get settings
async function getDeadline() {
  const res = await pool.query("SELECT value FROM settings WHERE key = 'deadline'");
  return res.rows[0]?.value || '2026-06-01';
}

// --- ROUTES ---

// POST /api/rsvp - confirm attendance
app.post('/api/rsvp', async (req, res) => {
  const { nombre, personas, pareja, ninos, telefono, mensaje, tipo } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre es requerido.' });
  }

  try {
    // --- Date Validation ---
    const deadline = await getDeadline();
    const today = new Date();
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(23, 59, 59, 999);

    if (today > deadlineDate) {
      return res.status(403).json({ error: 'El período de confirmación ha finalizado.' });
    }

    // Prevent duplicate entries by name (case-insensitive)
    const exists = await pool.query(
      'SELECT id FROM confirmations WHERE LOWER(nombre) = LOWER($1)',
      [nombre.trim()]
    );
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe una confirmación con ese nombre.' });
    }

    const id = Date.now().toString();
    const entry = {
      id,
      nombre: nombre.trim(),
      pareja: pareja ? pareja.trim() : '',
      ninos: parseInt(ninos) || 0,
      personas: parseInt(personas) || 1,
      tipo: tipo || 'individual',
      telefono: telefono ? telefono.trim() : '',
      mensaje: mensaje ? mensaje.trim() : '',
      fecha: new Date().toISOString()
    };

    await pool.query(`
      INSERT INTO confirmations (id, nombre, pareja, ninos, personas, tipo, telefono, mensaje, fecha)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [entry.id, entry.nombre, entry.pareja, entry.ninos, entry.personas, entry.tipo, entry.telefono, entry.mensaje, entry.fecha]);

    res.json({ success: true, data: entry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// GET /api/rsvp - get all confirmations
app.get('/api/rsvp', checkAdminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM confirmations ORDER BY fecha DESC');
    const totalPersonas = result.rows.reduce((sum, c) => sum + (parseInt(c.personas) || 0), 0);
    res.json({
      confirmations: result.rows,
      totalInvitados: result.rows.length,
      totalPersonas
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al recuperar los datos.' });
  }
});

// DELETE /api/rsvp/:id - delete a confirmation
app.delete('/api/rsvp/:id', checkAdminAuth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM confirmations WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Confirmación no encontrada.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar.' });
  }
});

// GET /api/settings - get public settings
app.get('/api/settings', async (req, res) => {
  try {
    const deadline = await getDeadline();
    res.json({ deadline });
  } catch (err) {
    res.status(500).json({ deadline: '2026-06-01' });
  }
});

// POST /api/settings - update settings
app.post('/api/settings', checkAdminAuth, async (req, res) => {
  const { deadline } = req.body;
  if (!deadline) return res.status(400).json({ error: 'Fecha requerida.' });
  
  try {
    await pool.query("UPDATE settings SET value = $1 WHERE key = 'deadline'", [deadline]);
    res.json({ success: true, settings: { deadline } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar ajustes.' });
  }
});

// POST /api/import - Bulk import guests
app.post('/api/import', checkAdminAuth, async (req, res) => {
  const { guests } = req.body;
  if (!Array.isArray(guests)) return res.status(400).json({ error: 'Datos invalidos.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const g of guests) {
      // Ensure basic data exists
      if (!g.nombre) continue;
      
      const id = g.id || Date.now() + Math.random().toString(36).substr(2, 5);
      await client.query(`
        INSERT INTO confirmations (id, nombre, pareja, ninos, personas, tipo, telefono, mensaje, fecha)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          pareja = EXCLUDED.pareja,
          ninos = EXCLUDED.ninos,
          personas = EXCLUDED.personas,
          tipo = EXCLUDED.tipo,
          telefono = EXCLUDED.telefono,
          mensaje = EXCLUDED.mensaje
      `, [
        id, 
        g.nombre, 
        g.pareja || '', 
        parseInt(g.ninos) || 0, 
        parseInt(g.personas) || 1, 
        g.tipo || 'individual', 
        g.telefono || '', 
        g.mensaje || '', 
        g.fecha || new Date().toISOString()
      ]);
    }
    await client.query('COMMIT');
    res.json({ success: true, count: guests.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error durante la importación.' });
  } finally {
    client.release();
  }
});

// --- START ---
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🦁 Servidor Baby Shower con PostgreSQL corriendo en http://localhost:${PORT}`);
    console.log(`📊 Dashboard disponible en http://localhost:${PORT}/dashboard.html\n`);
  });
});
