/* =====================================================================
   presets.js — guardar y cargar presets de TODOS los parámetros del estudio.
   El estado completo (pincel + cada control del panel + los tres toggles)
   se serializa y se manda al SERVIDOR (nada de localStorage: la lista la
   guarda la sala y la recibe todo el que entra). También se puede exportar
   a un .json y volver a importarlo (para pasarlos de una máquina a otra).

   Quien sabe capturar y aplicar el estado es estudio.js: acá sólo se
   guarda la lista y se dibuja la UI. El contrato es:
     VGPresets.iniciar({ capturar(), aplicar(estado), avisar(texto) })
   ===================================================================== */
(function (global) {
  'use strict';


  // Presets de fábrica: las variantes que antes vivían como "pinceles" distintos.
  // Son el MISMO motor con otros números, así que van acá y no en el desplegable.
  const FABRICAS = [
    {
      nombre: 'Van Gogh · seco (empaste)',
      estado: { pincel: 'vangogh', params: {
        'trazo.len': 58, 'trazo.wid': 19, 'trazo.spacing': 26, 'trazo.perPass': 2,
        'trazo.jitter': 34, 'trazo.bend': 45, 'trazo.speed': 12, 'trazo.stretch': 42,
        'trazo.spread': 11, 'trazo.grano': 45
      } }
    },
    {
      nombre: 'Van Gogh · arremolinado',
      estado: { pincel: 'vangogh', params: {
        'trazo.len': 130, 'trazo.wid': 13, 'trazo.spacing': 30, 'trazo.perPass': 1,
        'trazo.jitter': 26, 'trazo.bend': 75, 'trazo.speed': 14, 'trazo.stretch': 36,
        'trazo.spread': 10, 'trazo.grano': 22
      } }
    },
    {
      nombre: 'Van Gogh · pinceladas (base)',
      estado: { pincel: 'vangogh', params: {
        'trazo.len': 78, 'trazo.wid': 15, 'trazo.spacing': 34, 'trazo.perPass': 1,
        'trazo.jitter': 20, 'trazo.bend': 35, 'trazo.speed': 10, 'trazo.stretch': 32,
        'trazo.spread': 10, 'trazo.grano': 35
      } }
    },
    {
      nombre: 'Vervette · continuo parejo',
      estado: { pincel: 'vervette', params: { 'tip.size': 60, 'tip.soft': 50, 'tip.matter': 50 }, flags: { speedsize: false } }
    },
    {
      nombre: 'Vervette · tamaño por velocidad',
      estado: { pincel: 'vervette', params: { 'tip.size': 70, 'tip.soft': 55, 'tip.matter': 55 }, flags: { speedsize: true } }
    }
  ];
  let hooks = null;

  // ---------- almacenamiento (EN EL SERVIDOR: nada de localStorage) ----------
  // La lista vive en el servidor de la sala; acá queda la copia de trabajo.
  // colab.js llama a VGPresets.setLista() cuando llega del 'historial' o de otro
  // usuario, y VGPresets.disparar() avisa por socket cada vez que se guarda algo.
  let LISTA = [];
  function leer() { return LISTA; }
  function escribir(lista) {
    LISTA = (Array.isArray(lista) ? lista : []).filter(p => p && p.estado);
    if (hooks && typeof hooks.guardar === 'function') {
      try { hooks.guardar(LISTA); } catch (e) {}
    }
    return true;
  }
  /** lista que llega del servidor (historial o cambio de otro cliente) */
  function setLista(lista) {
    LISTA = (Array.isArray(lista) ? lista : []).filter(p => p && p.estado);
    pintar();
  }
  // ---------- para compartir por URL ----------
  function b64enc(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64dec(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }

  /** Link que abre el estudio con ESTA configuración (todos los parámetros). */
  function linkCompartir() {
    if (!hooks) return '';
    const e = hooks.capturar();
    const payload = b64enc(JSON.stringify({ v: 1, n: (input && input.value) || 'preset', pincel: e.pincel, params: e.params, flags: e.flags }));
    return location.origin + location.pathname + '?p=' + payload;
  }

  /** Aplica lo que venga en la URL: ?p=<base64> (config completa) o ?preset=<nombre|id>. */
  function aplicarDesdeURL() {
    if (!hooks) return false;
    let q = null;
    try { q = new URLSearchParams(location.search); } catch (e) { return false; }
    const payload = q.get('p') || q.get('preset64');
    const porNombre = q.get('preset') || q.get('presetNombre');
    if (payload) {
      try {
        const d = JSON.parse(b64dec(payload));
        if (d && d.params) {
          hooks.aplicar({ pincel: d.pincel, params: d.params, flags: d.flags });
          if (input && d.n) input.value = d.n;
          avisar('Configuración cargada desde el link');
          return true;
        }
      } catch (e) { avisar('El link no tiene una configuración válida'); }
    }
    if (porNombre) {
      const lista = leer();
      const p = lista.find(x => x.id === porNombre) ||
                lista.find(x => x.nombre.toLowerCase() === decodeURIComponent(porNombre).toLowerCase());
      if (p) { hooks.aplicar(p.estado); if (sel) sel.value = p.id; if (input) input.value = p.nombre; avisar('Preset del link: ' + p.nombre); return true; }
      const fab = FABRICAS.find(x => x.nombre.toLowerCase() === decodeURIComponent(porNombre).toLowerCase());
      if (fab) { hooks.aplicar(fab.estado); avisar('De fábrica: ' + fab.nombre); return true; }
      avisar('No encontré el preset "' + porNombre + '" en esta máquina');
    }
    return false;
  }

  function copiarLink() {
    const url = linkCompartir();
    if (!url) return;
    // sin prompt: el link queda ESCRITO en el panel (se puede seleccionar y copiar)
    const mostrar = () => {
      if (msg) msg.textContent = url;
      if (hooks && hooks.avisar) hooks.avisar('Link de la configuración listo');
    };
    if (hooks && hooks.avisar) hooks.avisar('Link copiado al portapapeles');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(mostrar, mostrar);
    } else {
      mostrar();
    }
  }

  function nuevoId() {
    return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  }

  // ---------- DOM ----------
  const $ = s => document.querySelector(s);
  let sel = null, input = null, msg = null, file = null;

  function avisar(t) {
    if (msg) msg.textContent = t;
  }

  function pintar() {
    if (!sel) return;
    const lista = leer();
    const antes = sel.value;
    sel.textContent = '';
    const vacio = document.createElement('option');
    vacio.value = '';
    vacio.textContent = (lista.length || FABRICAS.length) ? '— elegí un preset —' : '— no hay presets —';
    sel.appendChild(vacio);
    if (FABRICAS.length) {
      const g = document.createElement('optgroup');
      g.label = 'de fábrica';
      FABRICAS.forEach(f => {
        const o = document.createElement('option');
        o.value = 'fab:' + f.nombre;
        o.textContent = f.nombre;
        g.appendChild(o);
      });
      sel.appendChild(g);
    }
    lista.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.nombre;
      sel.appendChild(o);
    });
    // conservar la elección: un preset guardado o una de las de fábrica
    if (lista.some(p => p.id === antes)) sel.value = antes;
    else if (String(antes).indexOf('fab:') === 0 && FABRICAS.some(f => 'fab:' + f.nombre === antes)) sel.value = antes;
    avisar(lista.length + ' preset' + (lista.length === 1 ? '' : 's') + ' guardado' + (lista.length === 1 ? '' : 's'));
  }

  // ---------- acciones ----------
  function guardar() {
    if (!hooks) return;
    const nombre = (input.value || '').trim() ||
      (sel.value ? (leer().find(p => p.id === sel.value) || {}).nombre : '');
    if (!nombre) { avisar('Ponele un nombre al preset'); input.focus(); return; }

    const lista = leer();
    const existente = lista.find(p => p.nombre.toLowerCase() === nombre.toLowerCase());
    // si ya existe se REEMPLAZA (sin confirm del navegador) y se avisa
    const estado = hooks.capturar();
    if (existente) {
      existente.estado = estado;
      existente.fecha = new Date().toISOString();
    } else {
      lista.push({ id: nuevoId(), nombre: nombre, fecha: new Date().toISOString(), estado: estado });
    }
    if (escribir(lista)) {
      pintar();
      sel.value = (existente || lista[lista.length - 1]).id;
      avisar('Guardado: ' + nombre);
      if (hooks.avisar) hooks.avisar('Preset guardado: ' + nombre);
    }
  }

  function cargar() {
    if (!hooks) return;
    if (String(sel.value).indexOf('fab:') === 0) {
      const f = FABRICAS.find(x => 'fab:' + x.nombre === sel.value);
      if (!f) { avisar('No encontré ese preset de fábrica'); return; }
      hooks.aplicar(f.estado);
      input.value = f.nombre;
      avisar('De fábrica: ' + f.nombre);
      if (hooks.avisar) hooks.avisar('Preset: ' + f.nombre);
      return;
    }
    const p = leer().find(x => x.id === sel.value);
    if (!p) { avisar('Elegí un preset de la lista'); return; }
    hooks.aplicar(p.estado);
    input.value = p.nombre;
    avisar('Cargado: ' + p.nombre);
    if (hooks.avisar) hooks.avisar('Preset: ' + p.nombre);
  }

  // SET AS DEFAULT: el preset elegido se carga solo al abrir el estudio.
  // La elección se guarda en el SERVIDOR (config de la sala), no en el navegador.
  let DEFAULT_ID = '';
  function setDefault(btn) {
    if (!sel || !sel.value) { avisar('Elegí un preset y después SET AS DEFAULT'); return; }
    const clave = String(sel.value);
    DEFAULT_ID = clave;
    if (hooks && typeof hooks.guardarDefault === 'function') hooks.guardarDefault(clave);
    const nombre = (sel.options[sel.selectedIndex] || {}).textContent || clave;
    avisar('al abrir se carga: ' + nombre);
    if (hooks && hooks.avisar) hooks.avisar('Preset por defecto: ' + nombre);
    marcarDefault(btn);
  }
  function marcarDefault(btn) {
    document.querySelectorAll('[data-preset="default"]').forEach(b => {
      b.classList.toggle('on', !!DEFAULT_ID && b === btn);
    });
    if (btn) {
      btn.classList.add('on');
      setTimeout(() => { if (sel && sel.value === DEFAULT_ID) btn.classList.add('on'); }, 2400);
    }
  }
  /** aplica el preset que está marcado como default (lo usa colab al recibir la config) */
  function aplicarPorId(clave) {
    if (!clave) return false;
    const k = String(clave);
    if (k.indexOf('fab:') === 0) {
      const f = FABRICAS.find(x => 'fab:' + x.nombre === k);
      if (!f) return false;
      if (hooks) hooks.aplicar(f.estado);
      if (sel) sel.value = k;
      if (input) input.value = f.nombre;
      DEFAULT_ID = k;
      marcarDefault(document.querySelector('[data-preset="default"]'));
      return true;
    }
    const p = LISTA.find(x => x.id === k);
    if (!p) return false;
    if (hooks) hooks.aplicar(p.estado);
    if (sel) sel.value = p.id;
    if (input) input.value = p.nombre;
    DEFAULT_ID = k;
    marcarDefault(document.querySelector('[data-preset="default"]'));
    return true;
  }

  function exportar() {
    const lista = leer();
    if (!lista.length) { avisar('No hay presets para exportar'); return; }
    const blob = new Blob([JSON.stringify(lista, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vangogh-presets.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    avisar('Exportados ' + lista.length + ' presets');
  }

  function importar(archivo) {
    const r = new FileReader();
    r.onload = () => {
      let datos;
      try { datos = JSON.parse(r.result); }
      catch (e) { avisar('Ese archivo no es un JSON de presets'); return; }
      const entrantes = (Array.isArray(datos) ? datos : [datos])
        .filter(p => p && p.estado && (p.nombre || p.name))
        .map(p => ({
          id: nuevoId(),
          nombre: p.nombre || p.name,
          fecha: p.fecha || new Date().toISOString(),
          estado: p.estado
        }));
      if (!entrantes.length) { avisar('El archivo no tiene presets'); return; }
      const lista = leer();
      let nuevos = 0, pisados = 0;
      entrantes.forEach(p => {
        const mismo = lista.find(x => x.nombre.toLowerCase() === p.nombre.toLowerCase());
        if (mismo) { mismo.estado = p.estado; mismo.fecha = p.fecha; pisados++; }
        else { lista.push(p); nuevos++; }
      });
      escribir(lista);
      pintar();
      avisar('Importados: ' + nuevos + ' nuevos, ' + pisados + ' actualizados');
    };
    r.readAsText(archivo);
  }

  // ---------- init ----------
  function iniciar(opciones) {
    hooks = opciones || null;
    sel = document.getElementById('selPreset');
    input = document.getElementById('nombrePreset');
    msg = document.getElementById('presetMsg');
    file = document.getElementById('filePreset');
    if (!sel) return;

    pintar();

    document.querySelectorAll('[data-preset]').forEach(btn => {
      const act = btn.dataset.preset;
      if (act === 'sel') return;
      btn.addEventListener('click', () => {
        if (act === 'guardar') guardar();
        else if (act === 'cargar') cargar();
        else if (act === 'default') setDefault(btn);
        else if (act === 'export') exportar();
        else if (act === 'import') file && file.click();
        else if (act === 'link') copiarLink();
      });
    });

    // elegir en el dropdown = cargar ese preset con TODOS sus parámetros
    sel.addEventListener('change', () => {
      // las de fábrica van con prefijo fab: y las carga cargar(), no la lista guardada
      if (String(sel.value).indexOf('fab:') === 0) { cargar(); return; }
      const p = leer().find(x => x.id === sel.value);
      if (!p) return;
      input.value = p.nombre;
      cargar();
    });
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); guardar(); }
    });
    if (file) {
      file.addEventListener('change', () => {
        if (file.files && file.files[0]) importar(file.files[0]);
        file.value = '';
      });
    }
  }

  global.VGPresets = { iniciar, lista: leer, fabricas: () => FABRICAS, pintar, setLista, aplicarPorId, linkCompartir, aplicarDesdeURL, copiarLink };
})(typeof window !== 'undefined' ? window : globalThis);
