/* =====================================================================
   perfil.js — PERFIL de PUPPERDRAW (dibujos e imágenes por usuario FSC)
   La sesión es la del ecosistema: el front manda el JWT de JPCONNECT en
   `Authorization: Bearer <token>` y acá se valida con el JWT_SECRET
   compartido (el mismo de /root/jpconnect/.env). Sin secreto o sin Mongo
   el perfil queda apagado y la app sigue funcionando igual.

   Los PNG NO se guardan en Mongo: van a `data/perfil/` y se sirven por
   /api/perfil/img/<archivo> (nombre aleatorio, no adivinable).
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pupperdraw';
const JWT_SECRET = process.env.JWT_SECRET || '';
const MAX_ITEMS = 60;             // por usuario y por tipo
const DIR = path.join(__dirname, 'data', 'perfil');

const Esquema = new mongoose.Schema({
  userId: { type: String, index: true },   // id del usuario en fullscreen_global
  username: { type: String, default: '' },
  tipo: { type: String, default: 'dibujo' }, // dibujo | imagen
  nombre: { type: String, default: '' },
  sala: { type: String, default: '' },
  archivo: { type: String, default: '' },     // nombre base en data/perfil
  bytes: { type: Number, default: 0 },
  creado: { type: Date, default: Date.now }
});
Esquema.index({ userId: 1, tipo: 1, creado: -1 });

let Modelo = null;
let estado = 'apagado';   // apagado | conectando | listo | sinmongo

function conectar() {
  if (estado !== 'apagado') return;      // idempotente: se llama una vez por prefijo
  if (!JWT_SECRET) {
    console.warn('  perfil: sin JWT_SECRET -> el perfil queda apagado');
    return;
  }
  Modelo = mongoose.models.PupperDibujo || mongoose.model('PupperDibujo', Esquema);
  estado = 'conectando';
  mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 6000, dbName: 'pupperdraw' })
    .then(() => { estado = 'listo'; console.log('  perfil: mongo ok (' + MONGO_URI.replace(/\/\/[^@]*@/, '//***@') + ')'); })
    .catch(e => { estado = 'sinmongo'; console.warn('  perfil: mongo no conecta (' + e.message + ')'); });
}

// ------------------------------------------------------------
// sesión
// ------------------------------------------------------------
function leerSesion(req) {
  const h = req.headers.authorization || '';
  const tok = h.indexOf('Bearer ') === 0 ? h.slice(7).trim() : '';
  if (!tok || !JWT_SECRET) return null;
  try { return jwt.verify(tok, JWT_SECRET); } catch (e) { return null; }
}

function requiereSesion(req, res, next) {
  const u = leerSesion(req);
  if (!u) return res.status(401).json({ ok: false, error: 'sin sesión' });
  req.fsc = {
    id: String(u.id || u._id || u.userId || ''),
    email: u.email || '',
    role: u.role || 'USER'
  };
  if (!req.fsc.id) return res.status(401).json({ ok: false, error: 'token sin id' });
  next();
}

// ------------------------------------------------------------
// archivos
// ------------------------------------------------------------
function guardarPng(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 200 || buf.length > 12 * 1024 * 1024) return null;
  const base = 'd' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, base + '.png'), buf);
  return { archivo: base, bytes: buf.length };
}

function guardarThumb(dataUrl, base) {
  if (!base || typeof dataUrl !== 'string') return;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 600 * 1024) return;
  fs.writeFileSync(path.join(DIR, base + '-t.png'), buf);
}

function borrarArchivos(base) {
  if (!base) return;
  [base + '.png', base + '-t.png'].forEach(n => {
    const p = path.join(DIR, n);
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
  });
}

// El front vive en el FTP (Apache) y su `/pupperdraw/api/*` NO proxea al VPS,
// así que la URL de la imagen la arma el cliente con CONFIG.API_URL. Acá va
// sólo el nombre base del archivo.
function aJson(d) {
  return {
    id: String(d._id),
    tipo: d.tipo,
    nombre: d.nombre,
    sala: d.sala,
    fecha: d.creado,
    archivo: d.archivo,
    bytes: d.bytes,
    mio: true
  };
}

// ------------------------------------------------------------
// rutas
// ------------------------------------------------------------
function instalar(app, prefijo) {
  const P = prefijo || '';
  conectar();

  // estado (para saber si el perfil está operativo, sin exponer nada)
  app.get(P + '/api/perfil/estado', (req, res) => res.json({ ok: true, estado: estado }));

  // imagen guardada (pública por id aleatorio: la usan los <img> y las descargas)
  app.get(P + '/api/perfil/img/:archivo', (req, res) => {
    const nom = String(req.params.archivo || '');
    if (!/^[a-z0-9-]+\.png$/i.test(nom)) return res.status(400).end();
    const p = path.join(DIR, nom);
    if (!fs.existsSync(p)) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type('png').send(fs.readFileSync(p));
  });

  // mis cosas
  app.get(P + '/api/perfil', requiereSesion, async (req, res) => {
    if (estado !== 'listo') return res.status(503).json({ ok: false, error: 'perfil sin base: ' + estado });
    try {
      const docs = await Modelo.find({ userId: req.fsc.id }).sort({ creado: -1 }).limit(MAX_ITEMS * 2).lean();
      res.json({
        ok: true,
        usuario: { id: req.fsc.id, role: req.fsc.role },
        dibujos: docs.filter(d => d.tipo !== 'imagen').map(aJson),
        imagenes: docs.filter(d => d.tipo === 'imagen').map(aJson)
      });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  async function crear(req, res, tipo) {
    if (estado !== 'listo') return res.status(503).json({ ok: false, error: 'perfil sin base: ' + estado });
    const body = req.body || {};
    const g = guardarPng(body.png);
    if (!g) return res.status(400).json({ ok: false, error: 'imagen inválida o demasiado grande' });
    try {
      const cuantos = await Modelo.countDocuments({ userId: req.fsc.id, tipo: tipo });
      if (cuantos >= MAX_ITEMS) {
        // se borra el más viejo de ese tipo (el perfil no crece sin control)
        const viejo = await Modelo.findOne({ userId: req.fsc.id, tipo: tipo }).sort({ creado: 1 });
        if (viejo) { borrarArchivos(viejo.archivo); await Modelo.deleteOne({ _id: viejo._id }); }
      }
      guardarThumb(body.thumb, g.archivo);
      const doc = await Modelo.create({
        userId: req.fsc.id,
        username: String(body.username || '').slice(0, 40),
        tipo: tipo,
        nombre: String(body.nombre || (tipo === 'imagen' ? 'imagen' : 'dibujo')).replace(/[<>]/g, '').slice(0, 60),
        sala: String(body.sala || '').slice(0, 40),
        archivo: g.archivo,
        bytes: g.bytes
      });
      res.json({ ok: true, item: aJson(doc) });
    } catch (e) {
      borrarArchivos(g.archivo);
      res.status(500).json({ ok: false, error: e.message });
    }
  }

  app.post(P + '/api/perfil/dibujos', requiereSesion, (req, res) => crear(req, res, 'dibujo'));
  app.post(P + '/api/perfil/imagenes', requiereSesion, (req, res) => crear(req, res, 'imagen'));

  app.delete(P + '/api/perfil/:tipo/:id', requiereSesion, async (req, res) => {
    if (estado !== 'listo') return res.status(503).json({ ok: false, error: 'perfil sin base' });
    const tipo = req.params.tipo === 'imagenes' ? 'imagen' : 'dibujo';
    try {
      const doc = await Modelo.findOne({ _id: req.params.id, userId: req.fsc.id, tipo: tipo });
      if (!doc) return res.status(404).json({ ok: false, error: 'no existe' });
      borrarArchivos(doc.archivo);
      await Modelo.deleteOne({ _id: doc._id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}

module.exports = { instalar, estado: () => estado };
