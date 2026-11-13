/* =====================================================================
   colab.js — PUPPERDRAW colaborativo
   Todo lo que pinta la MANO de cada usuario viaja al servidor y vuelve
   a los demás con su color, su geometría Y SU ESTILO (curvatura, punta,
   cerda, veta, ruido): el que pinta amarillo con pincel grande lo ven
   todos igual, y cada uno conserva su propio pincel para seguir pintando.

   Acá viven las tres piezas de la sala:
     · las pinceladas (del cliente, viajan con su estilo)
     · los parámetros GLOBALES (luz, fluidos, materia: son de todos)
     · el CHAT y la lista de conectados
   ===================================================================== */
(function () {
  'use strict';

  const U = window.PPDURL || { leer: (k, d) => d, escribir: () => {}, link: () => location.href };
  const q = new URLSearchParams(location.search);

  // NADA de localStorage: la sala viene en la URL y el nombre lo asigna la sala
  // (si venías con nombre, el servidor lo devuelve en el historial).
  const sala = (q.get('sala') || 'principal').slice(0, 40);
  let nombre = (q.get('user') || '').trim();
  let nombreAuto = !nombre;      // si nadie eligió nombre, lo pone la sala (estilo pizarraia)
  if (!nombre) nombre = (window.VGNombres ? VGNombres.aleatorio() : 'artista-' + Math.random().toString(36).slice(2, 5));

  const $ = (id) => document.getElementById(id);
  const ui = {
    sala: $('colabSala'),
    online: $('colabOnline'),
    usuarios: $('colabUsuarios'),
    estado: $('colabEstado'),
    botLink: $('colabLink'),
    botLimpiar: $('colabLimpiar'),
    nombre: $('colabNombre'),
    cursores: $('cursores'),
    // chat
    chat: $('chat'),
    chatSala: $('chatSala'),
    chatOnline: $('chatOnline'),
    chatQuienes: $('chatQuienes'),
    chatLista: $('chatLista'),
    chatForm: $('chatForm'),
    chatInput: $('chatInput'),
    chatCerrar: $('chatCerrar'),
    botChat: $('btnChat')
  };

  if (ui.sala) ui.sala.textContent = sala;
  if (ui.chatSala) ui.chatSala.textContent = sala;

  // ------------------------------------------------------------
  // conexión
  // ------------------------------------------------------------
  let socket = null;

  function estado(t) { if (ui.estado) ui.estado.textContent = t; }

  if (typeof io !== 'function') {
    estado('sin socket.io');
    return;
  }

  // el socket vive en el VPS (aunque la página se sirva desde el dominio)
  const cfg = window.CONFIG || {};
  const base = cfg.BASE || '/pupperdraw';
  const url = cfg.SOCKET_URL || location.origin;
  socket = io(url, { path: base + '/socket.io', transports: ['websocket', 'polling'] });

  const colorMio = () => {
    const el = document.querySelector('[data-cmd="color.base"]');
    return (el && el.value) || '#f5c518';
  };

  socket.on('connect', () => {
    // nombre por defecto con semilla del socket (igual que pizarraia): estable
    // mientras dure la conexión y distinto para cada persona que entra
    if (nombreAuto && window.VGNombres) {
      nombre = VGNombres.aleatorio(socket.id);
      if (typeof pintarNombrePropio === 'function') pintarNombrePropio();
    }
    estado('conectado');
    socket.emit('entrar', { sala: sala, nombre: nombre, color: colorMio() });
    // al reconectar, los globales que tengo son los que valen para mí: los republico
    setTimeout(publicarGlobales, 400);
  });
  socket.on('disconnect', () => estado('reconectando…'));
  socket.on('connect_error', () => estado('no conecta'));

  // ------------------------------------------------------------
  // envío: lo que siembra la mano
  // ------------------------------------------------------------
  let cola = [];
  let ultimoEnvio = 0;

  function encolar(st) {
    // st es la pincelada que acaba de crear el motor local
    cola.push({
      x: Math.round(st.x * 10) / 10,
      y: Math.round(st.y * 10) / 10,
      a: Math.round(st.ang * 1000) / 1000,
      l: Math.round(st.len * 10) / 10,
      w: Math.round(st.wid * 10) / 10,
      // velocidad de la mano al sembrar: sin esto el que recibe pinta la pincelada
      // con la corriente apagada y se ve como un sello duro, sin mezcla de fluido
      h: Math.round((st.hand || 0) * 10) / 10,
      // cuántas pinceladas tenía la carga (perPass): si no viaja, el que recibe ve 1 de N
      p: st.pass || 1,
      // estilo del pincel del que pinta: así se ve igual en todas las pantallas
      e: st.est || null,
      c: Array.isArray(st.color)
        ? [Math.round(st.color[0] * 100) / 100, Math.round(st.color[1] * 100) / 100, Math.round(st.color[2] * 100) / 100]
        : null
    });
    if (cola.length > 300) cola.splice(0, cola.length - 300);
    const ahora = performance.now();
    if (ahora - ultimoEnvio > 50) vaciar();
  }

  function vaciar() {
    if (!cola.length || !socket || !socket.connected) return;
    ultimoEnvio = performance.now();
    socket.emit('trazos', cola);
    cola = [];
  }
  setInterval(vaciar, 120);

  // ------------------------------------------------------------
  // stamps del pincel de TRAZO CONTINUO (Vervette)
  // Ese motor no crea "pinceladas" del Van Gogh: pinta huellas de pincel.
  // Si no se mandan, con Vervette por socket NO LLEGA NADA y el otro no ve
  // el trazo. Van en su propia cola y se agrupan para no saturar.
  // ------------------------------------------------------------
  let colaStamps = [];
  let ultimoStamp = 0;

  function encolarStamp(s) {
    if (!s || !isFinite(s.x) || !isFinite(s.y)) return;
    colaStamps.push({
      x: Math.round(s.x * 10) / 10,
      y: Math.round(s.y * 10) / 10,
      dx: Math.round((s.dx || 0) * 10) / 10,
      dy: Math.round((s.dy || 0) * 10) / 10,
      r: Math.round(s.r * 10) / 10,
      s: Math.round((s.s == null ? 0.5 : s.s) * 1000) / 1000,
      o: Math.round((s.o == null ? 1 : s.o) * 1000) / 1000,
      // primer punto del trazo (la gota inicial redonda) y estilo COMPLETO del
      // pincel con el que se pintó: sin esto el otro cliente inventa textura,
      // materia, dureza y opacidad con SU panel y el trazo se ve distinto.
      f: s.f ? 1 : 0,
      e: s.e || null,
      c: Array.isArray(s.c)
        ? [Math.round(s.c[0] * 100) / 100, Math.round(s.c[1] * 100) / 100, Math.round(s.c[2] * 100) / 100]
        : null
    });
    if (colaStamps.length > 400) colaStamps.splice(0, colaStamps.length - 400);
    const ahora = performance.now();
    if (ahora - ultimoStamp > 50) vaciarStamps();
  }

  function vaciarStamps() {
    if (!colaStamps.length || !socket || !socket.connected) return;
    ultimoStamp = performance.now();
    socket.emit('stamps', colaStamps);
    colaStamps = [];
  }
  setInterval(vaciarStamps, 120);

  // engancha el motor: cada pincelada de la mano se manda
  function enganchar() {
    const T = window.TRAZO;
    if (!T || !T.R) return setTimeout(enganchar, 300);
    T.R.onSpawn = (st) => encolar(st);
    estado('pintando en «' + sala + '»');
  }
  enganchar();

  // ------------------------------------------------------------
  // recepción: pinceladas de los demás
  // ------------------------------------------------------------
  function pintarRemoto(t) {
    if (!t) return;
    // huella del pincel de TRAZO CONTINUO: se pinta con el mismo motor del estudio
    if (t.k === 't') { pintarStamps([t]); return; }
    const T = window.TRAZO;
    if (!T) return;
    T.spawn(t.x, t.y, Math.cos(t.a), Math.sin(t.a), 1, {
      color: Array.isArray(t.c) ? t.c : null,
      len: t.l, wid: t.w,
      pass: t.p || 1,
      hand: typeof t.h === 'number' ? t.h : null,   // la mano del que pinta, no la mía
      est: t.e || null,                             // su pincel, no el mío
      remoto: true
    });
  }

  /** pinta un lote de huellas del pincel continuo con el motor del estudio */
  function pintarStamps(lista) {
    const E = window.ENGINE;
    if (!E || typeof E.frame !== 'function') return;
    const tips = [];
    for (const s of lista) {
      if (!s || !isFinite(s.x) || !isFinite(s.y)) continue;
      // pincel de imagen: la huella trae el id; si todavía no está la textura,
      // se pide al servidor (se pinta procedural en este lote y con imagen al rato)
      if (s.e && s.e.im && window.PPDImagenPincel) window.PPDImagenPincel(s.e.im);
      // si la huella trae su estilo completo, la opacidad ya viene adentro (est.op):
      // no se multiplica por la mía o el trazo sale más transparente acá que allá
      const tieneEstilo = !!(s.e && typeof s.e.op === 'number');
      tips.push({
        x: s.x, y: s.y,
        dx: s.dx || 0, dy: s.dy || 0,
        rad: s.r > 0 ? s.r : 0,
        soft: typeof s.s === 'number' ? s.s : 0,
        opac: tieneEstilo ? 1 : (typeof s.o === 'number' ? s.o : 1),
        est: s.e || null,      // textura, materia, dureza, cerda... del que pintó
        first: !!s.f,          // la gota inicial del trazo
        color: Array.isArray(s.c) ? s.c : null,
        remoto: true
      });
    }
    if (!tips.length) return;
    E.frame(tips, 1);       // un solo pase para todo el lote
  }

  socket.on('trazos', (lote) => {
    if (!Array.isArray(lote)) return;
    // las huellas se juntan en un pase; las pinceladas van una por una
    const stamps = [];
    for (const t of lote) {
      if (t && t.k === 't') stamps.push(t);
      else pintarRemoto(t);
    }
    if (stamps.length) pintarStamps(stamps);
  });

  socket.on('historial', (data) => {
    if (!data) return;
    if (ui.sala && data.sala) ui.sala.textContent = data.sala;
    if (ui.chatSala && data.sala) ui.chatSala.textContent = data.sala;
    pintarUsuarios(data.usuarios || []);
    // los globales de la sala mandan sobre los míos
    if (data.globales) aplicarGlobales(data.globales);
    // la paleta y los presets viven en el servidor: los que lleguen son los que valen
    if (Array.isArray(data.paleta)) aplicarPaleta(data.paleta);
    if (Array.isArray(data.presets)) aplicarPresets(data.presets);
    if (data.config && typeof data.config === 'object') {
      Object.keys(data.config).forEach(k => dispararConfig(k, data.config[k]));
    }
    if (Array.isArray(data.chat)) {
      if (ui.chatLista) ui.chatLista.textContent = '';
      data.chat.forEach(pintarMensaje);
    }
    // El lienzo arranca LIMPIO: el dibujo que ya estaba en la sala NO se
    // reconstruye. Sólo se sincroniza lo que llega a partir de ahora.
    estado('pintando en «' + data.sala + '»');
  });

  socket.on('limpiar', (d) => {
    if (window.PPD) window.PPD.limpiar();
    estado((d && d.por ? d.por + ' ' : '') + 'limpió el lienzo');
  });

  socket.on('usuarios', (lista) => pintarUsuarios(lista));

  // ------------------------------------------------------------
  // parámetros GLOBALES (luz, fluidos, materia): son de la sala
  // ------------------------------------------------------------
  // estudio.js avisa cuando el usuario toca uno; acá se manda (con un pelín de
  // debounce para que arrastrar un slider no dispare 40 paquetes) y se aplica
  // lo que llega de los demás.
  let ultGlobal = 0, tGlobal = null, aplicandoRemoto = false;

  function publicarGlobales() {
    if (!socket || !socket.connected) return;
    const PPD = window.PPD;
    if (!PPD || typeof PPD.globales !== 'function') return;
    const est = PPD.globales();
    if (est) socket.emit('globales', est);
  }

  function globalCambiado() {
    if (aplicandoRemoto) return;              // no rebotar lo que vino de afuera
    const ahora = performance.now();
    const falta = 90 - (ahora - ultGlobal);
    if (falta <= 0) { ultGlobal = ahora; publicarGlobales(); }
    else if (!tGlobal) {
      tGlobal = setTimeout(() => { tGlobal = null; ultGlobal = performance.now(); publicarGlobales(); }, falta);
    }
  }

  function aplicarGlobales(g) {
    const PPD = window.PPD;
    if (!PPD || typeof PPD.aplicarGlobal !== 'function' || !g) return;
    aplicandoRemoto = true;
    try { PPD.aplicarGlobal(g); } finally { aplicandoRemoto = false; }
  }

  socket.on('globales', aplicarGlobales);

  // ------------------------------------------------------------
  // PALETA y PRESETS: los guarda el servidor (nada en el navegador).
  // Al entrar llegan en el 'historial'; cuando alguien los cambia, se
  // emiten para toda la sala.
  // ------------------------------------------------------------
  let aplicandoConfig = false;

  function aplicarPaleta(lista) {
    if (!Array.isArray(lista) || !window.PPD || typeof window.PPD.aplicarPaleta !== 'function') return;
    aplicandoConfig = true;
    try { window.PPD.aplicarPaleta(lista); } finally { aplicandoConfig = false; }
  }

  function publicarPaleta(lista) {
    if (aplicandoConfig) return;
    if (!socket || !socket.connected) return;
    socket.emit('paleta', lista);
  }

  function publicarPresets(lista) {
    if (!socket || !socket.connected) return;
    socket.emit('presets', lista);
  }

  function aplicarPresets(lista) {
    if (!Array.isArray(lista) || !window.VGPresets || typeof window.VGPresets.setLista !== 'function') return;
    window.VGPresets.setLista(lista);
  }

  socket.on('paleta', aplicarPaleta);
  socket.on('presets', aplicarPresets);

  // configuración libre de la sala (flowfields propios, preset por defecto):
  // la manda el server al entrar. Varios módulos pueden escuchar.
  const configFns = [];
  const configVals = {};        // último valor conocido de cada clave (para el que se engancha tarde)
  const dispararConfig = (clave, valor) => {
    configVals[clave] = valor;
    configFns.forEach(fn => { try { fn(clave, valor); } catch (e) {} });
  };
  socket.on('config', (d) => { if (d && typeof d.clave === 'string') dispararConfig(d.clave, d.valor); });

  function publicarConfig(clave, valor) {
    if (!socket || !socket.connected) return;
    socket.emit('config', { clave: clave, valor: valor });
  }

  // estudio.js engancha acá su aviso de cambio
  function engancharGlobales() {
    const PPD = window.PPD;
    if (!PPD || typeof PPD.onGlobal !== 'function') return setTimeout(engancharGlobales, 300);
    PPD.onGlobal(globalCambiado);
  }
  engancharGlobales();

  // ------------------------------------------------------------
  // CHAT de la sala
  // ------------------------------------------------------------
  function horaCorta(t) {
    const d = new Date(t || Date.now());
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function pintarMensaje(m) {
    if (!m || !ui.chatLista) return;
    const fila = document.createElement('div');
    fila.className = 'chat-msg' + (m.nombre === nombre ? ' mio' : '');
    const quien = document.createElement('b');
    quien.style.setProperty('--c', m.color || '#f5c518');
    quien.textContent = m.nombre || '?';
    const texto = document.createElement('span');
    texto.textContent = m.texto || '';
    const hora = document.createElement('i');
    hora.textContent = horaCorta(m.t);
    fila.appendChild(quien);
    fila.appendChild(texto);
    fila.appendChild(hora);
    ui.chatLista.appendChild(fila);
    // quedan los últimos 120 a la vista (el server guarda 80)
    while (ui.chatLista.children.length > 120) ui.chatLista.removeChild(ui.chatLista.firstChild);
    ui.chatLista.scrollTop = ui.chatLista.scrollHeight;
  }

  socket.on('chat', pintarMensaje);

  if (ui.chatForm) {
    ui.chatForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const texto = (ui.chatInput.value || '').trim();
      if (!texto) return;
      if (socket && socket.connected) socket.emit('chat', { texto: texto });
      else pintarMensaje({ nombre: nombre, texto: texto, t: Date.now() });
      ui.chatInput.value = '';
      ui.chatInput.focus();
    });
  }

  // abrir / cerrar el chat (y dejarlo escrito en la URL)
  function abrirChat(abierto, guardar) {
    if (!ui.chat) return;
    ui.chat.hidden = !abierto;
    if (ui.botChat) ui.botChat.classList.toggle('on', !!abierto);
    if (guardar !== false) U.escribir('chat', abierto ? '1' : null);
    if (abierto && ui.chatInput) setTimeout(() => ui.chatInput.focus(), 60);
  }
  if (ui.botChat) ui.botChat.addEventListener('click', () => abrirChat(ui.chat.hidden, true));
  if (ui.chatCerrar) ui.chatCerrar.addEventListener('click', () => abrirChat(false, true));
  abrirChat(U.leer('chat', '0') === '1', false);

  // ------------------------------------------------------------
  // cursores de los demás
  // ------------------------------------------------------------
  const cursores = new Map();

  socket.on('cursor', (c) => {
    if (!c || !c.id) return;
    let el = cursores.get(c.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'cursor-otro';
      el.innerHTML = '<i></i><span></span>';
      (ui.cursores || document.body).appendChild(el);
      cursores.set(c.id, el);
    }
    el.style.transform = 'translate(' + c.x + 'px,' + c.y + 'px)';
    el.style.opacity = c.dentro ? '1' : '0';
    el.style.setProperty('--c', c.color || '#f5c518');
    el.querySelector('span').textContent = c.nombre || '';
  });

  function pintarUsuarios(lista) {
    if (ui.online) ui.online.textContent = String(lista.length || 1);
    if (ui.chatOnline) ui.chatOnline.textContent = String(lista.length || 1);
    // en la barra: los nombres como pastillas de color
    if (ui.usuarios) {
      ui.usuarios.textContent = '';
      for (const u of lista) {
        const d = document.createElement('span');
        d.className = 'quien';
        d.style.setProperty('--c', u.color || '#f5c518');
        d.textContent = u.nombre + (u.nombre === nombre ? ' (vos)' : '');
        ui.usuarios.appendChild(d);
      }
    }
    // en el chat: la lista completa, para ver quién está conectado
    if (ui.chatQuienes) {
      ui.chatQuienes.textContent = '';
      for (const u of lista) {
        const d = document.createElement('span');
        d.className = 'chat-quien';
        d.style.setProperty('--c', u.color || '#f5c518');
        d.textContent = u.nombre + (u.nombre === nombre ? ' (vos)' : '');
        ui.chatQuienes.appendChild(d);
      }
    }
  }

  // manda mi puntero (para que los demás vean dónde estoy)
  const lienzo = $('lienzo');
  let ultCursor = 0;
  function mandarCursor(x, y, dentro) {
    const ahora = performance.now();
    if (ahora - ultCursor < 60) return;
    ultCursor = ahora;
    if (socket && socket.connected) socket.emit('cursor', { x: x, y: y, dentro: dentro });
  }
  if (lienzo) {
    lienzo.addEventListener('pointermove', (e) => {
      const r = lienzo.getBoundingClientRect();
      mandarCursor(
        Math.round((e.clientX - r.left) / r.width * lienzo.width),
        Math.round((e.clientY - r.top) / r.height * lienzo.height),
        true
      );
    });
    lienzo.addEventListener('pointerleave', () => mandarCursor(0, 0, false));
  }

  // ------------------------------------------------------------
  // barra: link y limpiar
  // ------------------------------------------------------------
  if (ui.botLink) {
    ui.botLink.addEventListener('click', () => {
      const url = U.link('sala', sala);
      navigator.clipboard.writeText(url).then(
        () => estado('link copiado: mandalo y pintamos juntos'),
        () => estado(url)
      );
    });
  }
  if (ui.botLimpiar) {
    ui.botLimpiar.addEventListener('click', () => {
      if (socket && socket.connected) socket.emit('limpiar');
      else if (window.PPD) window.PPD.limpiar();
    });
  }

  // nombre editable: input EN EL CHAT (sin diálogos del navegador)
  const inpNombre = $('chatNombre');
  function pintarNombrePropio() { if (inpNombre) inpNombre.value = nombre; }
  function guardarNombre() {
    const n = (inpNombre && inpNombre.value || '').trim();
    if (!n || n === nombre) return;
    nombre = n.slice(0, 24);
    nombreAuto = false;
    pintarNombrePropio();
    if (socket && socket.connected) socket.emit('entrar', { sala: sala, nombre: nombre, color: colorMio() });
    estado('ahora te llamás ' + nombre);
  }
  if (inpNombre) {
    pintarNombrePropio();
    inpNombre.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); guardarNombre(); inpNombre.blur(); }
    });
  }
  const okNombre = $('chatNombreOk');
  if (okNombre) okNombre.addEventListener('click', guardarNombre);

  window.COLAB = {
    sala,
    get nombre() { return nombre; },     // getter: el nombre cambia sin recargar
    socket: () => socket,
    cola: () => cola.length,
    chat: (abierto) => abrirChat(abierto, true),
    globales: publicarGlobales,
    paleta: publicarPaleta,
    presets: publicarPresets,
    // huellas del pincel de trazo continuo (Vervette) hacia la sala
    stamp: encolarStamp,
    config: publicarConfig,
    // varios módulos escuchan; el que se engancha tarde recibe lo ya conocido
    onConfig: (fn) => {
      if (typeof fn !== 'function') return;
      configFns.push(fn);
      Object.keys(configVals).forEach(k => { try { fn(k, configVals[k]); } catch (e) {} });
    }
  };
})();
