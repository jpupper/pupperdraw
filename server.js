// ============================================================
// PUPPERDRAW — lienzo colaborativo (FSC)
// Express + Socket.IO. Sirve el estudio de pinceladas y sincroniza
// las pinceladas de todos los usuarios conectados a la misma sala.
//
// Cada pincelada viaja con SU color y SU geometría: el que pinta
// amarillo con un pincel grande lo ven todos igual. Cada cliente
// conserva su propio pincel y su propio color para pintar.
//
// DOS FAMILIAS DE PARÁMETROS:
//   · DEL CLIENTE (pincel y color): cada uno pinta con SU pincel, pero la pincelada
//     viaja con su ESTILO (curvatura, abanico, punta, cerda, veta, ruido), así que
//     los demás la ven exactamente como la pintó él.
//   · GLOBALES (luz, fluidos, materia): son de la sala, se sincronizan para todos.
//     El último que los toca manda.
// ============================================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 5124;
const BASE_PATH = process.env.BASE_PATH || '/pupperdraw';
const PUB = path.join(__dirname, 'public');

const app = express();
const server = http.createServer(app);
// El front se sirve desde el FTP (fullscreencode.com/pupperdraw/) y el socket desde acá:
// es cross-origin por diseño, así que va la lista blanca del ecosistema (README §0.7).
const ORIGENES = [
  'https://fullscreencode.com', 'https://www.fullscreencode.com',
  'http://fullscreencode.com', 'http://www.fullscreencode.com',
  'https://vps-4455523-x.dattaweb.com',
  'http://localhost:5124', 'http://127.0.0.1:5124'
];
const io = new Server(server, {
  path: BASE_PATH + '/socket.io',
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ORIGENES.includes(origin)) return cb(null, true);
      if (/fullscreencode\.com$|dattaweb\.com$/.test(origin)) return cb(null, true);
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
      cb(null, false);
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  maxHttpBufferSize: 2e6,
  pingInterval: 12000,
  pingTimeout: 20000
});

app.use(express.json({ limit: '14mb' }));

// ------------------------------------------------------------
// CORS de la API: el front vive en el FTP (fullscreencode.com) y las
// llamadas del perfil van al VPS, así que son cross-origin por diseño.
// ------------------------------------------------------------
const origenOk = (o) => !o ||
  ORIGENES.includes(o) ||
  /fullscreencode\.com$|dattaweb\.com$/.test(o) ||
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && origenOk(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ------------------------------------------------------------
// estado colaborativo (en memoria)
// ------------------------------------------------------------
const MAX_TRAZOS = 6000;          // pinceladas recordadas por sala
const MAX_CHAT = 80;              // mensajes recordados por sala
const salas = new Map();          // sala -> { trazos, chat, globales, usuarios, creada }

// ------------------------------------------------------------
// ESTADO PERSISTENTE — la configuración NO vive en el navegador:
//   data/estado.json = { "_default": {globales, paleta, presets}, "<sala>": {...} }
// Los parámetros globales, la paleta de colores y los presets guardados
// se escriben acá y se devuelven en el 'historial': si se reinicia el
// servidor (o entra otro), la sala arranca con lo último que se usó.
// ------------------------------------------------------------
const fs = require('fs');
const RUTA_ESTADO = path.join(__dirname, 'data', 'estado.json');
let ESTADO = {};
try { ESTADO = JSON.parse(fs.readFileSync(RUTA_ESTADO, 'utf8')) || {}; } catch (e) { ESTADO = {}; }
const DEFECTO = ESTADO._default || { globales: null, paleta: null, presets: [] };

let turnoEstado = null;
function persistir() {
  if (turnoEstado) return;
  turnoEstado = setTimeout(() => {
    turnoEstado = null;
    try {
      fs.mkdirSync(path.dirname(RUTA_ESTADO), { recursive: true });
      fs.writeFileSync(RUTA_ESTADO, JSON.stringify(ESTADO));
    } catch (e) { console.warn('no pude guardar estado.json:', e.message); }
  }, 300);
}
/** guarda un cambio de la sala y lo deja como default para las salas nuevas */
function guardarEstado(nombre, cambio) {
  ESTADO[nombre] = Object.assign({}, ESTADO[nombre] || {}, cambio);
  ESTADO._default = Object.assign({}, ESTADO._default || {}, cambio);
  persistir();
}

function salaDe(nombre) {
  let s = salas.get(nombre);
  if (!s) {
    const prev = ESTADO[nombre] || {};
    s = {
      trazos: [], chat: [], usuarios: new Map(), creada: Date.now(),
      globales: prev.globales || DEFECTO.globales || null,
      paleta: Array.isArray(prev.paleta) ? prev.paleta : (Array.isArray(DEFECTO.paleta) ? DEFECTO.paleta : null),
      presets: Array.isArray(prev.presets) ? prev.presets : (Array.isArray(DEFECTO.presets) ? DEFECTO.presets : [])
    };
    salas.set(nombre, s);
  }
  return s;
}

const num = (v, a, b, def) => {
  const n = Number(v);
  if (!isFinite(n)) return def;
  return Math.max(a, Math.min(b, n));
};
const txt = (v, max) => String(v == null ? '' : v).replace(/[<>]/g, '').slice(0, max);

/**
 * Estilo del pincel de quien pintó: TODO lo que el motor lee del panel para
 * dibujar la pincelada. Si un trazo llega sin estos datos, cada cliente lo
 * pinta con SU pincel y el mismo trazo se ve distinto en cada pantalla.
 * Sólo se copian los campos que vienen: un cliente viejo manda 7 y el motor
 * usa su propio panel para el resto (sin romper nada).
 */
function sanearEstilo(e) {
  if (!e || typeof e !== 'object') return null;
  const out = {};
  const campo = (k, a, b) => {
    if (e[k] === undefined || e[k] === null) return;
    const v = Number(e[k]);
    if (!isFinite(v)) return;
    out[k] = Math.round(Math.max(a, Math.min(b, v)) * 1000) / 1000;
  };
  campo('b', 0, 6);        // curvatura
  campo('s', 0, 12);       // abanico (corrimiento lateral)
  campo('t', 0, 1);        // punta de la hoja
  campo('br', 0, 1);       // cerda
  campo('st', 0.5, 60);    // veta (anisotropía)
  campo('g', 0, 1);        // ruido (capa de grano)
  campo('ge', 1, 200);     // escala del ruido
  campo('so', 0, 1);       // dureza del borde
  campo('op', 0, 1);       // opacidad
  campo('ma', -1, 1);      // materia
  campo('ns', 0, 100);     // textura (frecuencia del ruido de la pintura)
  campo('nc', 0, 1);       // contraste del ruido
  campo('nb', 0, 1);       // brillo del ruido
  campo('ni', 0, 1);       // ruido invertido
  campo('it', 1, 11);      // octavas de ruido
  campo('pm', 0, 3);       // modo de pintura
  campo('rp', 0, 1);       // replace
  campo('ad', 0, 1);       // aditivo
  return Object.keys(out).length ? out : null;
}

/**
 * Stamp del pincel de TRAZO CONTINUO (Vervette): una huella del pincel con su
 * radio, su dureza y su color. El receptor la pinta con el MISMO motor, así el
 * trazo se ve igual en todas las pantallas (`k: 't'` lo distingue de las
 * pinceladas del Van Gogh en `trazos`).
 */
function sanearStamp(t) {
  if (!t || typeof t !== 'object') return null;
  const x = Number(t.x), y = Number(t.y);
  if (!isFinite(x) || !isFinite(y)) return null;
  const c = Array.isArray(t.c) ? t.c.slice(0, 3).map((v) => num(v, 0, 1, 0)) : [1, 1, 1];
  return {
    k: 't',
    x: num(x, -4000, 8000, 0),
    y: num(y, -4000, 8000, 0),
    dx: num(t.dx, -600, 600, 0),
    dy: num(t.dy, -600, 600, 0),
    r: num(t.r, 0.4, 500, 40),        // radio en px del lienzo
    s: num(t.s, 0, 1, 0.5),           // dureza (fracción del radio)
    o: num(t.o, 0, 1, 1),             // opacidad
    f: num(t.f, 0, 1, 0),             // primer punto del trazo (la gota inicial)
    e: sanearEstilo(t.e),             // estilo completo del pincel que la pintó
    c: c,
    u: txt(t.u, 24) || null,
    t: Date.now()
  };
}

/** limpia y acota una pincelada que llega del cliente */
function sanearTrazo(t) {
  if (!t || typeof t !== 'object') return null;
  const color = Array.isArray(t.c) ? t.c.slice(0, 3).map(x => num(x, 0, 1, 0)) : null;
  return {
    x: num(t.x, -4000, 8000, 0),
    y: num(t.y, -4000, 8000, 0),
    a: num(t.a, -8, 8, 0),
    l: num(t.l, 1, 400, 40),
    w: num(t.w, 0.5, 120, 8),
    // velocidad de la mano del que pinta (px por evento) y pinceladas por carga:
    // el que recibe los necesita para que la corriente del fluido se mueva igual
    h: num(t.h, 0, 400, 0),
    p: num(t.p, 1, 8, 1),
    e: sanearEstilo(t.e),
    c: color,
    u: txt(t.u, 24) || null,
    t: Date.now()
  };
}

// ------------------------------------------------------------
// parámetros GLOBALES de la sala: luz, fluidos, materia y sus switches
// ------------------------------------------------------------
const NUM_GLOBAL = {
  'fluid.speed': [0, 100], 'fluid.smudge': [0, 99], 'fluid.slip': [0, 99], 'fluid.life': [0, 100],
  'light.gloss': [0, 100], 'light.bump': [0, 99], 'light.refrstr': [0, 100]
};
const FLAGS_GLOBAL = ['fluid', 'vivo', 'dry', 'light'];

function sanearGlobales(g) {
  if (!g || typeof g !== 'object') return null;
  const out = { params: {}, flags: {} };
  const p = g.params || {};
  for (const k in NUM_GLOBAL) {
    if (p[k] !== undefined) out.params[k] = num(p[k], NUM_GLOBAL[k][0], NUM_GLOBAL[k][1], 0);
  }
  if (typeof p['paint.blend'] === 'string') out.params['paint.blend'] = p['paint.blend'] === 'replace' ? 'replace' : 'add';
  ['luz.materia', 'luz.refraccion'].forEach(k => {
    if (typeof p[k] === 'string') out.params[k] = txt(p[k], 40);
  });
  const f = g.flags || {};
  FLAGS_GLOBAL.forEach(k => { if (f[k] !== undefined) out.flags[k] = !!f[k]; });
  return out;
}

/** aplica una pincelada en los clientes (no en el motor del server) */
const listaUsuarios = (sala) => Array.from(sala.usuarios.entries())
  .map(([id, u]) => ({ id, nombre: u.nombre, color: u.color }));

io.on('connection', (socket) => {
  socket.on('entrar', (data) => {
    const nombreSala = txt((data && data.sala) || 'principal', 40) || 'principal';
    const nombre = txt((data && data.nombre) || 'artista', 24) || 'artista';
    const color = txt((data && data.color) || '#f5c518', 16);

    // salir de la sala anterior
    if (socket.data.sala && socket.data.sala !== nombreSala) {
      const vieja = salas.get(socket.data.sala);
      if (vieja) {
        vieja.usuarios.delete(socket.id);
        socket.leave(socket.data.sala);
        io.to(socket.data.sala).emit('usuarios', listaUsuarios(vieja));
      }
    }

    const sala = salaDe(nombreSala);
    sala.usuarios.set(socket.id, { nombre, color });
    socket.data.sala = nombreSala;
    socket.data.nombre = nombre;
    socket.data.color = color;
    socket.join(nombreSala);

    // al que entra: el dibujo completo + la configuración de la sala + el chat
    socket.emit('historial', {
      sala: nombreSala,
      trazos: sala.trazos,
      usuarios: listaUsuarios(sala),
      globales: sala.globales,
      paleta: sala.paleta,
      presets: sala.presets,
      config: sala.config || {},
      chat: sala.chat
    });
    // al resto: quién está
    socket.to(nombreSala).emit('usuarios', listaUsuarios(sala));
    console.log(`[${nombreSala}] entra ${nombre} (${socket.id}) · ${sala.usuarios.size} online`);
  });

  // lote de pinceladas de la mano
  socket.on('trazos', (lote) => {
    const nombreSala = socket.data.sala;
    if (!nombreSala || !Array.isArray(lote) || !lote.length) return;
    const sala = salas.get(nombreSala);
    if (!sala) return;

    const limpios = [];
    for (const t of lote.slice(0, 200)) {
      const s = sanearTrazo(t);
      if (s) { s.u = socket.data.nombre; limpios.push(s); }
    }
    if (!limpios.length) return;

    sala.trazos.push(...limpios);
    if (sala.trazos.length > MAX_TRAZOS) sala.trazos.splice(0, sala.trazos.length - MAX_TRAZOS);
    socket.to(nombreSala).emit('trazos', limpios);
  });

  // stamps del pincel de TRAZO CONTINUO (Vervette): huellas del pincel.
  // Van a la misma lista que las pinceladas para que el que entra reconstruya
  // el dibujo completo (con k:'t' se distinguen al pintarlas).
  socket.on('stamps', (lote) => {
    const nombreSala = socket.data.sala;
    if (!nombreSala || !Array.isArray(lote) || !lote.length) return;
    const sala = salas.get(nombreSala);
    if (!sala) return;

    const limpios = [];
    for (const s of lote.slice(0, 300)) {
      const st = sanearStamp(s);
      if (st) { st.u = socket.data.nombre; limpios.push(st); }
    }
    if (!limpios.length) return;

    sala.trazos.push(...limpios);
    if (sala.trazos.length > MAX_TRAZOS) sala.trazos.splice(0, sala.trazos.length - MAX_TRAZOS);
    socket.to(nombreSala).emit('trazos', limpios);
  });

  // parámetros GLOBALES de la sala (luz, fluidos, materia)
  socket.on('globales', (g) => {
    const nombreSala = socket.data.sala;
    if (!nombreSala) return;
    const sala = salas.get(nombreSala);
    if (!sala) return;
    const limpio = sanearGlobales(g);
    if (!limpio) return;
    sala.globales = limpio;
    guardarEstado(nombreSala, { globales: limpio });
    socket.to(nombreSala).emit('globales', limpio);
  });

  // paleta del estudio (los casilleros de color): vive en el servidor, no en el navegador
  socket.on('paleta', (lista) => {
    const nombreSala = socket.data.sala;
    if (!nombreSala || !Array.isArray(lista)) return;
    const sala = salas.get(nombreSala);
    if (!sala) return;
    const limpia = lista.slice(0, 24)
      .map((c) => String(c == null ? '' : c).trim())
      .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c));
    if (limpia.length < 1) return;
    sala.paleta = limpia;
    guardarEstado(nombreSala, { paleta: limpia });
    socket.to(nombreSala).emit('paleta', limpia);
  });

  // presets guardados (los del desplegable): también en el servidor
  socket.on('presets', (lista) => {
    const nombreSala = socket.data.sala;
    if (!nombreSala || !Array.isArray(lista)) return;
    const sala = salas.get(nombreSala);
    if (!sala) return;
    const limpios = lista.slice(0, 60)
      .filter((p) => p && typeof p === 'object' && p.estado && typeof p.estado === 'object')
      .map((p) => ({
        id: txt(p.id, 24) || 'p' + Math.random().toString(36).slice(2, 8),
        nombre: txt(p.nombre, 40) || 'preset',
        fecha: txt(p.fecha, 26),
        estado: p.estado
      }));
    sala.presets = limpios;
    guardarEstado(nombreSala, { presets: limpios });
    socket.to(nombreSala).emit('presets', limpios);
  });

  // configuración libre de la sala (flowfields propios, etc.): también persiste
  socket.on('config', (d) => {
    const nombreSala = socket.data.sala;
    if (!nombreSala || !d || typeof d.clave !== 'string') return;
    const sala = salas.get(nombreSala);
    if (!sala) return;
    const clave = d.clave.replace(/[^\w.-]/g, '').slice(0, 40);
    if (!clave) return;
    if (!sala.config) sala.config = {};
    sala.config[clave] = d.valor;
    guardarEstado(nombreSala, { config: sala.config });
    socket.to(nombreSala).emit('config', { clave: clave, valor: d.valor });
  });

  // chat de la sala
  socket.on('chat', (m) => {
    const nombreSala = socket.data.sala;
    if (!nombreSala) return;
    const texto = txt(m && m.texto, 240).trim();
    if (!texto) return;
    const sala = salas.get(nombreSala);
    if (!sala) return;
    const msg = {
      id: socket.id,
      nombre: socket.data.nombre,
      color: socket.data.color,
      texto: texto,
      t: Date.now()
    };
    sala.chat.push(msg);
    if (sala.chat.length > MAX_CHAT) sala.chat.splice(0, sala.chat.length - MAX_CHAT);
    io.to(nombreSala).emit('chat', msg);
  });

  // puntero en vivo (para ver dónde está pintando cada uno)
  socket.on('cursor', (c) => {
    const nombreSala = socket.data.sala;
    if (!nombreSala) return;
    socket.to(nombreSala).volatile.emit('cursor', {
      id: socket.id,
      nombre: socket.data.nombre,
      color: socket.data.color,
      x: num(c && c.x, -1e5, 1e5, 0),
      y: num(c && c.y, -1e5, 1e5, 0),
      dentro: !!(c && c.dentro)
    });
  });

  // borrar el lienzo de todos
  socket.on('limpiar', () => {
    const nombreSala = socket.data.sala;
    if (!nombreSala) return;
    const sala = salas.get(nombreSala);
    if (sala) sala.trazos = [];
    io.to(nombreSala).emit('limpiar', { por: socket.data.nombre });
    console.log(`[${nombreSala}] limpió ${socket.data.nombre}`);
  });

  socket.on('disconnect', () => {
    const nombreSala = socket.data.sala;
    if (!nombreSala) return;
    const sala = salas.get(nombreSala);
    if (!sala) return;
    sala.usuarios.delete(socket.id);
    io.to(nombreSala).emit('usuarios', listaUsuarios(sala));
    console.log(`[${nombreSala}] sale ${socket.data.nombre} · ${sala.usuarios.size} online`);
  });
});

// ------------------------------------------------------------
// API
// ------------------------------------------------------------
const status = (req, res) => res.json({
  ok: true,
  app: 'pupperdraw',
  base: BASE_PATH,
  version: '1.2.0',
  uptimeSeconds: Math.round(process.uptime()),
  now: new Date().toISOString(),
  perfil: perfil.estado(),
  salas: Array.from(salas.entries()).map(([n, s]) => ({
    sala: n, trazos: s.trazos.length, online: s.usuarios.size,
    globales: !!s.globales, chat: s.chat.length
  }))
});
app.get(['/api/status', BASE_PATH + '/api/status'], status);
app.get(['/api/salas', BASE_PATH + '/api/salas'], status);

// ------------------------------------------------------------
// PERFIL (login del ecosistema + dibujos e imágenes)
// ------------------------------------------------------------
const perfil = require('./perfil');
perfil.instalar(app, BASE_PATH);
perfil.instalar(app, '');

// ------------------------------------------------------------
// estáticos
// ------------------------------------------------------------
app.use(BASE_PATH, express.static(PUB, { index: 'index.html', maxAge: '1h' }));
app.use('/', express.static(PUB, { index: 'index.html', maxAge: '1h' }));

server.listen(PORT, () => {
  console.log('');
  console.log('  PUPPERDRAW · lienzo colaborativo');
  console.log('  http://localhost:' + PORT + BASE_PATH + '/');
  console.log('  socket.io en ' + BASE_PATH + '/socket.io');
  console.log('');
});
