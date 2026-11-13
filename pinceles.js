/* ============================================================================
   PUPPERDRAW · PINCELES DE IMAGEN
   ----------------------------------------------------------------------------
   Guarda las imágenes que la gente sube para usarlas como pincel. El cliente
   las manda YA RECORTADAS a 200x200 en PNG (base64), así que acá sólo se
   validan, se guardan en data/pinceles y se sirven por HTTP.

   Rutas (con y sin prefijo, igual que perfil.js):
     GET  /api/pinceles              → lista [{id, nombre, url}]
     POST /api/pinceles  {nombre, png} → {ok, pincel}
     GET  /api/pincel/img/<id>.png   → la imagen
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'data', 'pinceles');
const INDICE = path.join(DIR, 'indice.json');

const MAX_BYTES = 400 * 1024;      // 200x200 png comprimido sobra de sobra
const MAX_ITEMS = 60;

function asegurar() {
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) { }
}

function leerIndice() {
  try { return JSON.parse(fs.readFileSync(INDICE, 'utf8')) || {}; }
  catch (e) { return {}; }
}

function guardarIndice(obj) {
  try { fs.writeFileSync(INDICE, JSON.stringify(obj, null, 1)); } catch (e) { }
}

function nuevoId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function instalar(app, prefijo) {
  const P = prefijo || '';
  asegurar();

  app.get(P + '/api/pinceles', (req, res) => {
    const idx = leerIndice();
    let items = Object.keys(idx).map(id => ({ id: id, nombre: idx[id].nombre, fecha: idx[id].fecha }))
      .sort((a, b) => (b.fecha || 0) - (a.fecha || 0))
      .slice(0, MAX_ITEMS);
    // sólo los que tienen archivo de verdad
    items = items.filter(p => fs.existsSync(path.join(DIR, p.id + '.png')));
    res.json({ ok: true, pinceles: items });
  });

  app.post(P + '/api/pinceles', (req, res) => {
    const body = req.body || {};
    const png = String(body.png || '');
    const nombre = String(body.nombre || 'imagen').slice(0, 40);
    const m = png.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return res.status(400).json({ ok: false, error: 'falta el PNG (data URL)' });

    let buf;
    try { buf = Buffer.from(m[1], 'base64'); }
    catch (e) { return res.status(400).json({ ok: false, error: 'base64 inválido' }); }

    if (!buf.length || buf.length > MAX_BYTES) {
      return res.status(413).json({ ok: false, error: 'la imagen es muy grande (máx 400 KB)' });
    }
    // firma PNG
    if (buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') {
      return res.status(400).json({ ok: false, error: 'no es un PNG' });
    }

    const id = nuevoId();
    try { fs.writeFileSync(path.join(DIR, id + '.png'), buf); }
    catch (e) { return res.status(500).json({ ok: false, error: 'no pude guardar' }); }

    const idx = leerIndice();
    idx[id] = { nombre: nombre, fecha: Date.now() };
    guardarIndice(idx);

    res.json({ ok: true, pincel: { id: id, nombre: nombre, bytes: buf.length } });
  });

  app.get(P + '/api/pincel/img/:archivo', (req, res) => {
    const nom = String(req.params.archivo || '');
    if (!/^[a-z0-9]+\.png$/i.test(nom)) return res.status(400).end();
    const p = path.join(DIR, nom);
    if (!fs.existsSync(p)) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.type('png').send(fs.readFileSync(p));
  });
}

module.exports = { instalar, DIR };
