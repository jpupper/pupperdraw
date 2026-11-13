/* =====================================================================
   estudio.js — panel del estudio: pinceles, color y fluidos.
   Toda la UI es declarativa (data-cmd / data-act) y este archivo la maneja.
   ===================================================================== */
(function () {
  'use strict';

  const canvas = document.getElementById('lienzo');
  const E = VervetteBrush.createEngine(canvas, window.SHADERS);
  const TRAZO = TrazoBrush.createTrazo(E, canvas);
  const tip = E.brushTip();
  const P = E.P;
  window.ENGINE = E;

  // ---------------- AJUSTE PARA CELULAR ----------------
  // El pincel Van Gogh dibuja cada pincelada como geometría aparte (y el fluido
  // hace pases full-screen). Con el lienzo interno a 1920x1080 un teléfono no
  // llega: el trazo droppea mientras arrastrás. El pincel común es un solo
  // trazo continuo, por eso ahí no se nota.
  // Solución: en celular el buffer interno baja a 1280 px de ancho (se ve igual,
  // se muestra a ~400 CSS px) y se recorta la cantidad de pinceladas vivas.
  (function () {
    const movil = /Android|iPhone|iPad|iPod|Mobile|Opera Mini/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) <= 900)
      || /[?&]chico=1/.test(location.search);

    if (!movil) return;

    const ANCHO_MOVIL = 1280;
    if (canvas.width > ANCHO_MOVIL) {
      const esc = ANCHO_MOVIL / canvas.width;
      canvas.width = ANCHO_MOVIL;
      canvas.height = Math.round(canvas.height * esc);
      try { E.resize(); } catch (e) { }
    }

    // menos pinceladas vivas a la vez: cada una es una pasada del shader
    window.__PPD_MOVIL = true;
    if (typeof TRAZO !== 'undefined' && TRAZO.R) {
      TRAZO.R.maxActive = 48;
      TRAZO.R.perPass = Math.min(TRAZO.R.perPass, 1);
    }
  })();
  window.TRAZO = TRAZO;

  // API mínima para el modo colaborativo (js/colab.js)
  window.PPD = {
    limpiar: () => limpiar(),
    aviso: (m) => estado(m),
    trazoListo: () => !!TRAZO,
    // lo que usan el panel rápido (radial.js) y el perfil
    set: (cmd, v) => set(cmd, v),
    // color desde el panel rápido: siempre vuelve a MANUAL (es "pintá con este")
    color: (hex) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(String(hex))) return;
      if (VGColor.mode !== 'manual') set('color.mode', 'manual');
      set('color.base', hex);
    },
    colorSlot: (i) => {
      if (VGColor.mode !== 'manual') set('color.mode', 'manual');
      set('color.slot', +i);
    },
    paleta: () => S['color.slots'].slice(),
    estado: () => S,
    pincel: (id) => setPincel(id),
    // parámetros GLOBALES (luz, fluidos, materia): los de la sala
    globales: () => globalesActuales(),
    aplicarGlobal: (est) => aplicarGlobales(est),
    onGlobal: (fn) => { alCambiarGlobal = fn; },
    // paleta de color compartida (la guarda el servidor, no el navegador)
    aplicarPaleta: (lista) => {
      if (!Array.isArray(lista) || !lista.length) return;
      paletaRemota = true;
      try { setSlots(lista); } finally { paletaRemota = false; }
    },
    // vistas del panel (por si otro módulo quiere abrir/cerrar)
    vista: (v) => { if (window.VGPanel) window.VGPanel.aplicar(v, true); },
    // pintar un trazo guardado (perfil): recibe el PNG como dataURL
    cargarImagen: (dataUrl, fit) => cargarComoFondo(dataUrl, fit),
    // color con el que se está pintando (lo usa el previsualizador)
    colorActual: () => colorActual()
  };

  // ---------- FLOWFIELD (campo de flujo del cuadro + autopintado) ----------
  // Necesita el color del cuadro muestreado en el tamaño del lienzo: se prepara una vez
  // y se refresca cuando cambia el cuadro elegido.
  // El flowfield NO decide colores: usa la seccion COLOR del panel. Aca solo se le pasa
  // la geometria del cuadro para que el campo caiga sobre la obra que se ve.
  function geografiaFlow(id) {
    const c = window.VGImagenes && VGImagenes.byId(id);
    if (c && c.w && c.h && FLOW) FLOW.setCuadro(c.w, c.h);
  }
  const FLOW = window.VGFflow ? VGFflow.crear({
    canvas: canvas,
    trazo: TRAZO,
    overlay: document.getElementById('campo'),
    onMsg: txt => { const el = document.getElementById('flowMsg'); if (el) el.textContent = txt; }
  }) : null;
  window.FLOW = FLOW;
  window.refrescarCamposFlow = () => refrescarCamposFlow();

  // ---------- FLOWWIND (corrientes de aire turbulentas K41 / K62) ----------
  // Segundo motor del menu FLUJO: no mira ningun cuadro, sopla. La pincelada
  // nace alineada al viento del punto y se va derivando frame a frame.
  const WIND = window.VGFlowWind ? VGFlowWind.create({
    canvas: canvas,
    overlay: document.getElementById('campo')
  }) : null;
  window.WIND = WIND;
  TRAZO.R.windFn = (x, y) => (WIND && WIND.st.activo ? WIND.sample(x, y) : null);
  if (FLOW) {
    FLOW.setCuadro(1600, 1267);   // se corrige al preparar el cuadro real
    // en el estudio arranca APAGADO: si no, el lienzo se llena solo de pinceladas
    // y el que quiere pintar a mano se encuentra el cuadro hecho.
    FLOW.st.auto = false;
    FLOW.cargar('data/flow-noche.json').then(() => {
      FLOW.st.activo = true;
      FLOW.ajustarCantidad();
      geografiaFlow(S['color.image']);
      const b = document.getElementById('btnFlowAuto');
      if (b) { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }
      refrescarCamposFlow();
    });
  }
  function refrescarCamposFlow(sel) {
    const el = document.getElementById('selFlowGuardados');
    if (!el || !FLOW) return;
    const prev = sel || el.value;
    el.textContent = '';
    const o0 = document.createElement('option');
    o0.value = ''; o0.textContent = '— campo guardado —';
    el.appendChild(o0);
    FLOW.listaGuardados().forEach(n => {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      el.appendChild(o);
    });
    el.value = prev || '';
  }

  /** estado visual del switch: la clase .on y aria-pressed, sin texto ON/OFF */
  function marcarSwitch(btn, on) {
    if (!btn) return;
    btn.classList.toggle('on', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  /** los dos botones que miran FLAGS.verimagen tienen que quedar iguales */
  function syncFondoSwitches() {
    ['btnVer', 'btnFlowFondo'].forEach(id => {
      const b = document.getElementById(id);
      if (b) marcarSwitch(b, FLAGS.verimagen);
    });
  }

  function avisoFlow(t) { const el = document.getElementById('flowMsg'); if (el) el.textContent = t; }

  // ---------- estado de la UI (fuente de verdad del panel) ----------
  const S = {
    pincel: VGPinceles.DEFAULT,
    'pincel.tamano': 100,
    'pincel.fuerza': 100,
    'trazo.len': 78, 'trazo.wid': 15, 'trazo.spacing': 34, 'trazo.perPass': 1,
    'trazo.jitter': 20, 'trazo.bend': 35, 'trazo.speed': 10, 'trazo.bristle': 100,
    'trazo.stretch': 32, 'trazo.spread': 10, 'trazo.grano': 35, 'trazo.granoEsc': 26,
    'tip.size': 60, 'tip.soft': 50, 'tip.opacity': 255, 'tip.matter': 50,
    'tip.noiseScale': 15, 'tip.noiseContrast': 75, 'tip.noiseBrightness': 20,
    'color.mode': 'manual', 'color.base': '#d93f1e', 'color.noise': 42, 'color.huespeed': 35,
    'color.lerpspeed': 1, 'color.palette': (window.VGPALETAS ? VGPALETAS.DEFAULT : 'noche'),
    'color.palcycle': 32, 'color.palvar': 18,
    'color.slot': 0, 'color.slots': VGColor.slotsHex(),
    'color.image': (window.VGCUADROS ? VGCUADROS.DEFAULT : 'noche'), 'color.imgradio': 0,
    'fluid.speed': 20, 'fluid.smudge': 99, 'fluid.slip': 50, 'fluid.life': 50, 'paint.blend': 'add',
    'flow.densidad': 70, 'flow.velocidad': 100, 'flow.grilla': 40, 'flow.escala': 100, 'flow.fuerza': 85, 'flow.radio': 150, 'flow.cobertura': 32, 'flow.smartfuerza': 55,
    // menú FLUJO (flowfield = campo del cuadro · flowwind = corrientes de aire)
    'flujo.modo': 'flowfield',
    'wind.fuerza': 65, 'wind.epsilon': 45, 'wind.escalaL': 70, 'wind.eta': 18,
    'wind.octavas': 4, 'wind.lambda': 20, 'wind.viento': 20, 'wind.angulo': 15, 'wind.velocidad': 60,
    'light.gloss': 75, 'light.bump': 50, 'light.refrstr': 32,
    'luz.materia': 'off', 'luz.refraccion': 'off'
  };
  const FLAGS = { fluid: true, dry: true, light: true, verimagen: false, vivo: true, speedsize: true,
    windactivo: false, windver: false };

  // ---------- comandos ----------
  const APPLY = {
    'pincel.tamano': v => aplicarTamano(+v),
    'pincel.fuerza': v => E.S.setBrushOpacity(Math.round(Math.max(0, Math.min(100, +v)) * 2.55)),
    'trazo.len': v => { TRAZO.R.len = +v; },
    'trazo.wid': v => { TRAZO.R.wid = +v; },
    'trazo.spacing': v => { TRAZO.R.spacing = +v / 100; },
    'trazo.perPass': v => { TRAZO.R.perPass = +v; },
    'trazo.jitter': v => { TRAZO.R.jitter = +v / 100; },
    'trazo.bend': v => { TRAZO.R.bend = +v / 100; },
    'trazo.speed': v => { TRAZO.R.speed = +v; },
    'trazo.bristle': v => { TRAZO.R.bristle = +v / 100; P.bristle = +v / 100; },
    'trazo.stretch': v => { TRAZO.R.stretch = +v / 10; },
    'trazo.spread': v => { TRAZO.R.spread = +v / 10; },
    'trazo.grano': v => { P.grano = +v / 100; },
    'trazo.granoEsc': v => { P.granoEscala = +v; },
    'tip.size': v => E.S.setBrushSize(+v),
    'tip.soft': v => E.S.setBrushSoft(+v),
    'tip.opacity': v => E.S.setBrushOpacity(+v),
    'tip.matter': v => E.S.setBrushMatAdd(+v),
    'tip.noiseScale': v => E.S.setNoiseScale(+v),
    'tip.noiseContrast': v => E.S.setNoiseContrast(+v),
    'tip.noiseBrightness': v => E.S.setNoiseBrightness(+v),
    'color.mode': v => setColorMode(v),
    'color.base': v => setBase(v),
    'color.noise': v => { VGColor.noiseFreq = +v / 100; muestras(); },
    'color.huespeed': v => { VGColor.hueSpeed = +v / 10; },
    'color.lerpspeed': v => { VGColor.lerpSpeed = Math.max(1, +v); },
    'color.palette': v => setPaleta(v),
    'color.palcycle': v => { VGColor.palCycle = +v / 100; },
    'color.palvar': v => { VGColor.palVar = +v / 100; },
    'color.slot': v => setSlot(+v, true),
    'color.slots': v => {
      setSlots(v);
      publicarPaleta();
    },
    'color.image': v => setCuadroColor(v),
    'color.imgradio': v => { VGColor.imgRadio = +v * 0.3; },
    'luz.materia': v => setMateria(v),
    'luz.refraccion': v => setRefraccion(v),
    'light.refrstr': v => { P.refrStrength = +v / 100 * 6.4; },
    'fluid.speed': v => E.S.setFluidSpeed(+v),
    'fluid.smudge': v => E.S.setFluidSmudge(+v),
    'fluid.slip': v => E.S.setFluidSlip(+v),
    'fluid.life': v => { P.fluidLife = +v / 100; },
    'paint.blend': v => { P.isReplace = (v === 'replace'); },
    'flow.densidad': v => { if (FLOW) { FLOW.st.densidad = +v; FLOW.ajustarCantidad(); } },
    'flow.velocidad': v => { if (FLOW) FLOW.st.velocidad = +v / 100; },
    'flow.grilla': v => { if (FLOW) { FLOW.st.grilla = +v; FLOW.construirGrilla(+v); avisoFlow('Grilla: ' + FLOW.stats().grilla); } },
    'flow.escala': v => { if (FLOW) FLOW.st.escala = +v / 100; },
    'flow.fuerza': v => { if (FLOW) FLOW.st.fuerza = +v / 100; },
    'flow.radio': v => { if (FLOW) FLOW.st.radioEdit = +v; },
    'flow.smartfuerza': v => { if (FLOW) FLOW.st.smartF = +v; },
    'flow.cobertura': v => {
      if (!FLOW) return;
      FLOW.st.cobNx = +v;
      const g = FLOW.armarCob();
      if (g) avisoFlow('Cobertura: ' + g.nx + '×' + g.ny + ' celdas');
    },
    // ---------- FLOWWIND: corrientes de aire ----------
    'wind.fuerza': v => { if (WIND) WIND.st.fuerza = +v / 100; },
    'wind.epsilon': v => { if (WIND) WIND.st.epsilon = +v / 100; },
    'wind.escalaL': v => { if (WIND) WIND.st.escalaL = +v / 100; },
    'wind.eta': v => { if (WIND) WIND.st.eta = +v; },
    'wind.octavas': v => { if (WIND) WIND.st.octavas = +v; },
    'wind.lambda': v => { if (WIND) WIND.st.lambda = +v / 100; },
    'wind.viento': v => { if (WIND) WIND.st.viento = +v / 100; },
    'wind.angulo': v => { if (WIND) WIND.st.angulo = +v; },
    'wind.velocidad': v => { if (WIND) WIND.st.velocidad = +v / 100; },
    // modo del menú FLUJO (flowfield / flowwind): viaja en el preset
    'flujo.modo': v => { ponerModoFlujo(v, true); },
    'light.gloss': v => E.S.setGlossiness(+v),
    'light.bump': v => E.S.setBumpHeight(+v)
  };

  // ---------- MENÚ FLUJO: FLOWFIELD o FLOWWIND ----------
  // Un solo menú (FLUJO) con dos paneles. El modo decide qué parámetros se ven
  // y qué motor empuja las pinceladas: el campo del cuadro o las corrientes de aire.
  function ponerModoFlujo(modo, silencioso) {
    modo = modo === 'flowwind' ? 'flowwind' : 'flowfield';
    S['flujo.modo'] = modo;
    const pf = document.getElementById('paneFlow');
    const pw = document.getElementById('paneWind');
    if (pf) pf.hidden = modo !== 'flowfield';
    if (pw) pw.hidden = modo !== 'flowwind';
    document.querySelectorAll('#flujoModo .fm').forEach(b => {
      b.classList.toggle('on', b.dataset.flujo === modo);
      b.setAttribute('aria-selected', b.dataset.flujo === modo ? 'true' : 'false');
    });
    if (!silencioso) {
      avisoFlow(modo === 'flowwind' ? 'Flujo: FLOWWIND (corrientes de aire)' : 'Flujo: FLOWFIELD (campo del cuadro)');
    }
    return modo;
  }

  // ---------- tamaño del pincel (el único control de la vista simple) ----------
  // Es una ESCALA sobre el largo y el ancho base del pincel elegido: el "tamaño"
  // que espera cualquiera que agarra el estudio por primera vez. Si después toca
  // Largo o Ancho en el panel completo, la escala vuelve a 100 y esos valores
  // pasan a ser la nueva base.
  let basePincel = { len: 78, wid: 15 };
  let baseTip = { size: 60 };          // base del TAMAÑO cuando el pincel es Vervette
  function setBasePincel(len, wid) {
    basePincel = { len: Math.max(6, +len || 78), wid: Math.max(1, +wid || 15) };
  }
  function aplicarTamano(pct) {
    const k = Math.max(10, +pct || 100) / 100;
    // Vervette (trazo continuo): el tamaño es `tip.size`, no largo/ancho de pincelada
    if ((document.body.dataset.motor || 'trazo') === 'tip') {
      const size = Math.max(1, Math.round(baseTip.size * k));
      S['tip.size'] = size;
      E.S.setBrushSize(size);
      syncOut('tip.size');
      return;
    }
    const L = Math.round(basePincel.len * k);
    const W = Math.round(basePincel.wid * k * 10) / 10;
    S['trazo.len'] = L;
    S['trazo.wid'] = W;
    TRAZO.R.len = L;
    TRAZO.R.wid = W;
    syncOut('trazo.len');
    syncOut('trazo.wid');
  }

  function set(cmd, v, apply) {
    S[cmd] = v;
    if (apply !== false && APPLY[cmd]) APPLY[cmd](v);
    // tocar Largo/Ancho a mano redefine la base y vuelve la escala a 100
    if (cmd === 'trazo.len' || cmd === 'trazo.wid') {
      setBasePincel(S['trazo.len'], S['trazo.wid']);
      S['pincel.tamano'] = 100;
      syncOut('pincel.tamano');
    }
    syncOut(cmd);
    // los que son de la sala avisan al colaborativo (luz, fluidos, materia)
    if (esGlobal(cmd)) avisarGlobal();
  }

  function syncOut(cmd) {
    const out = document.querySelector('[data-out="' + cmd + '"]');
    if (out) {
      if (out.tagName === 'INPUT') {
        // campo de texto: no pisar lo que el usuario esta escribiendo
        if (document.activeElement !== out) out.value = String(S[cmd]);
      } else {
        out.textContent = String(S[cmd]);
      }
    }
    const inp = document.querySelector('[data-cmd="' + cmd + '"]');
    if (inp && String(inp.value) !== String(S[cmd])) inp.value = S[cmd];
  }

  function syncAll() {
    document.querySelectorAll('[data-cmd]').forEach(el => {
      const cmd = el.dataset.cmd;
      if (S[cmd] !== undefined && el.tagName !== 'SELECT' && el.type !== 'color') el.value = S[cmd];
      if (S[cmd] !== undefined && el.type === 'color') el.value = S[cmd];
    });
    Object.keys(S).forEach(syncOut);
  }

  // ---------- pinceles ----------
  const selPincel = document.getElementById('selPincel');
  VGPinceles.PINCELES.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.label;
    selPincel.appendChild(o);
  });

  const T = { // defs de trazo -> valores de slider
    len: v => v, wid: v => v, spacing: v => Math.round(v * 100), perPass: v => v,
    jitter: v => Math.round(v * 100), bend: v => Math.round(v * 100), speed: v => v,
    bristle: v => Math.round(v * 100), stretch: v => Math.round(v * 10), spread: v => Math.round(v * 10)
  };

  function asegurarMotorTrazo() {
    if (document.body.dataset.motor !== 'trazo') setPincel('vangogh');
  }

  function setPincel(id) {
    const b = VGPinceles.byId(id);
    S.pincel = b.id;
    selPincel.value = b.id;
    document.body.dataset.motor = b.motor;
    document.getElementById('pincelDesc').textContent = b.desc;

    if (b.motor === 'trazo') {
      TRAZO.R.enabled = true;
      TRAZO.R.dwell = b.trazo.dwell !== false;
      Object.keys(T).forEach(k => { if (b.trazo[k] !== undefined) S['trazo.' + k] = T[k](b.trazo[k]); });
      Object.keys(T).forEach(k => { if (APPLY['trazo.' + k]) APPLY['trazo.' + k](S['trazo.' + k]); });
      // el pincel nuevo define la base del control de TAMAÑO
      setBasePincel(S['trazo.len'], S['trazo.wid']);
      S['pincel.tamano'] = 100;
      syncOut('pincel.tamano');
      TRAZO.R.colorFn = (idx, x, y) => (VGColor.usesPerLoad() ? VGColor.colorForLoad(idx, x, y) : null);
      // el ruido de la capa de grano es del pincel Van Gogh: al volver, se restaura
      P.grano = Math.max(0, (+S['trazo.grano'] || 0) / 100);
      P.granoEscala = +S['trazo.granoEsc'] || 20;
    } else {
      TRAZO.R.enabled = false;
      TRAZO.clear();
      P.bristle = 0;
      // el pincel Vervette (trazo continuo) NO lleva la capa de grano del Van Gogh:
      // era la textura de ruido que no se podía sacar. Su textura se controla con
      // el slider TEXTURA del panel (100 = sin textura) y nada más.
      P.grano = 0;
      P.granoEscala = 20;
      if (b.tip) {
        baseTip = { size: b.tip.size || 60 };
        S['pincel.tamano'] = 100;
        syncOut('pincel.tamano');
        S['tip.size'] = b.tip.size; S['tip.soft'] = b.tip.soft; S['tip.opacity'] = b.tip.opacity;
        S['tip.matter'] = b.tip.matter; S['tip.noiseScale'] = b.tip.noiseScale;
        S['tip.noiseContrast'] = b.tip.noiseContrast; S['tip.noiseBrightness'] = b.tip.noiseBrightness;
        P.isSizeDynamic = b.tip.sizeDynamic === true;
        P.isSpeedSize = (b.tip.speedSize === true) && FLAGS.speedsize !== false;
        ['tip.size', 'tip.soft', 'tip.opacity', 'tip.matter', 'tip.noiseScale', 'tip.noiseContrast', 'tip.noiseBrightness']
          .forEach(k => APPLY[k](S[k]));
      }
    }
    E.color(colorActual()[0], colorActual()[1], colorActual()[2]);
    syncAll();
    estado('Pincel: ' + b.label);
  }

  // ---------- color ----------
  // color que se le pasa al motor (los modos por carga lo ajustan por pincelada)
  function colorActual() {
    if (VGColor.mode === 'palette' && VGColor.palColors.length) {
      return VGColor.palColors[Math.floor(VGColor.palColors.length / 2)];
    }
    return VGColor.base;
  }

  function setColorMode(m) {
    VGColor.mode = m;
    S['color.mode'] = m;
    document.body.dataset.color = m;
    const c = colorActual();
    E.color(c[0], c[1], c[2]);
    TRAZO.R.colorFn = (idx, x, y) => (VGColor.usesPerLoad() ? VGColor.colorForLoad(idx, x, y) : null);
    muestras();
  }

  function setPaleta(id) {
    const p = (window.VGPALETAS ? VGPALETAS.byId(id) : null);
    if (!p) return;
    VGColor.paleta = p.id;
    VGColor.setPaleta(p.colores);
    S['color.palette'] = p.id;
    const obra = document.getElementById('paletaObra');
    if (obra) obra.textContent = p.obra;
    if (VGColor.mode === 'palette') {
      const c = colorActual();
      E.color(c[0], c[1], c[2]);
    }
    muestras();
  }

  function setBase(hex) {
    const rgb = VGColor.fromHex(hex);
    if (!rgb) return;
    VGColor.setBase(rgb);
    S['color.base'] = hex;
    S['color.slots'] = VGColor.slotsHex();
    if (VGColor.mode === 'manual') E.color(rgb[0], rgb[1], rgb[2]);
    muestras();
  }

  // ---------- casilleros de color (SLOT 1/2/3) ----------
  function setSlot(i, sinModo) {
    if (!VGColor.slots[i]) return;
    VGColor.setActivo(i);
    S['color.slot'] = i;
    S['color.base'] = VGColor.hexOf(VGColor.base);
    const inp = document.querySelector('[data-cmd="color.base"]');
    if (inp) inp.value = S['color.base'];
    if (VGColor.mode === 'manual') {
      const c = VGColor.base;
      E.color(c[0], c[1], c[2]);
    }
    if (!sinModo) estado('SLOT ' + (i + 1) + ' · ' + S['color.base']);
    muestras();
  }

  function setSlots(arr) {
    VGColor.setSlots(arr);
    S['color.slots'] = VGColor.slotsHex();
    S['color.base'] = VGColor.hexOf(VGColor.base);
    S['color.slot'] = VGColor.slotActivo;
    const inp = document.querySelector('[data-cmd="color.base"]');
    if (inp) inp.value = S['color.base'];
    if (VGColor.mode === 'manual') {
      const c = VGColor.base;
      E.color(c[0], c[1], c[2]);
    }
    muestras();
  }

  /** paleta que llega del servidor (o el cambio local): se aplica y se comparte la sala */
  let paletaRemota = false;
  function publicarPaleta() {
    if (paletaRemota) return;                 // no rebotar lo que vino del server
    if (!window.COLAB || typeof window.COLAB.paleta !== 'function') return;
    window.COLAB.paleta(S['color.slots'].slice(0, 24));
  }

  // ---------- imagen (modo IMAGE, materia, refraccion) ----------
  function setCuadroColor(id) {
    geografiaFlow(id);
    // si el id ya no existe (una imagen subida que no sobrevive al refresh) cae al default
    let c = (window.VGImagenes ? VGImagenes.byId(id) : null);
    if (!c && window.VGImagenes && window.VGCUADROS) c = VGImagenes.byId(VGCUADROS.DEFAULT);
    if (!c) return;
    VGColor.imagen = c.id;
    S['color.image'] = c.id;
    const obra = document.getElementById('cuadroObra');
    if (obra) obra.textContent = c.obra + (c.subido ? ' · tu archivo' : '');
    VGImagenes.preparar(c.id, canvas.width, canvas.height)
      .then(() => { if (FLAGS.verimagen) aplicarFondo(); muestras(); })
      .catch(() => estado('No se pudo cargar la imagen'));
    if (FLAGS.verimagen) aplicarFondo();
    muestras();
  }

  // VER IMAGEN: el cuadro se dibuja DENTRO del motor (el canvas es opaco, así que
  // el fondo no puede ir por CSS). Cubre el lienzo igual que el muestreo.
  function aplicarFondo() {
    if (FLAGS.verimagen && S['color.image'] && window.VGImagenes) {
      const id = S['color.image'];
      VGImagenes.cargar(id).then(o => {
        if (S['color.image'] !== id || !FLAGS.verimagen) return;
        E.setBackgroundImage(o.img, o.w, o.h);
      }).catch(() => estado('No se pudo cargar la imagen de fondo'));
    } else {
      E.setBackgroundImage(null);
    }
  }

  function setMateria(id) {
    S['luz.materia'] = id;
    const el = document.getElementById('selMateria');
    if (el && el.value !== id) el.value = id;
    if (!id || id === 'off' || !window.VGImagenes) { E.setMaterialImage(null); return; }
    VGImagenes.cargar(id).then(o => {
      E.setMaterialImage(o.img);
      P.bumpImgHeight = P.bumpHeight;
      estado('Materia: ' + (VGImagenes.byId(id) || {}).label);
    }).catch(() => estado('No se pudo cargar la materia'));
  }

  function setRefraccion(id) {
    S['luz.refraccion'] = id;
    const el = document.getElementById('selRefraccion');
    if (el && el.value !== id) el.value = id;
    if (!id || id === 'off' || !window.VGImagenes) { E.setRefractionImage(null); return; }
    VGImagenes.cargar(id).then(o => {
      E.setRefractionImage(o.img);
      P.bumpImgHeight = P.bumpHeight;
      estado('Refracción: ' + (VGImagenes.byId(id) || {}).label);
    }).catch(() => estado('No se pudo cargar la refracción'));
  }

  // el color "de verdad" que se está pintando: lo muestra la vista simple
  function syncColorSimple() {
    const el = document.getElementById('colorSimple');
    if (el && typeof S['color.base'] === 'string' && el.value !== S['color.base']) el.value = S['color.base'];
  }

  function muestras() {
    // hay dos contenedores: la tira chica de la vista simple y la del panel completo
    const conts = ['muestras', 'muestras2'].map(id => document.getElementById(id)).filter(Boolean);
    conts.forEach(c => { c.textContent = ''; });
    syncColorSimple();
    if (!conts.length) return;
    if (VGColor.mode === 'manual') {
      // tres casilleros como el Vervette original: el activo es el que pinta
      conts.forEach(cont => {
        VGColor.slots.forEach((c, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'slot' + (i === VGColor.slotActivo ? ' on' : '');
          b.dataset.slot = String(i);
          b.style.background = VGColor.rgbCss(c);
          b.title = 'SLOT ' + (i + 1) + ' · ' + VGColor.hexOf(c) + ' (Q/W/E)';
          cont.appendChild(b);
        });
      });
      return;
    }
    if (VGColor.mode === 'image') {
      // tira de colores tomados del cuadro (lo que van a pintar las pinceladas)
      const hay = window.VGImagenes && VGImagenes.hayMuestra(S['color.image']);
      for (let i = 0; hay && i < 8; i++) {
        const c = VGImagenes.color(canvas.width * (i + 0.5) / 8, canvas.height * 0.5, VGColor.imgRadio);
        if (!c) break;
        conts.forEach(cont => {
          const el = document.createElement('i');
          el.style.background = VGColor.rgbCss(c);
          cont.appendChild(el);
        });
      }
      return;
    }
    if (VGColor.mode === 'palette') {
      VGColor.palColors.forEach(c => {
        conts.forEach(cont => {
          const i_ = document.createElement('i');
          i_.style.background = VGColor.rgbCss(c);
          i_.title = VGColor.hexOf(c);
          cont.appendChild(i_);
        });
      });
      return;
    }
    const n = VGColor.mode === 'lerpwhite' ? 10 : 3;
    for (let i = 0; i < n; i++) {
      const c = VGColor.mode === 'lerpwhite' ? VGColor.colorForLoad(i * 3 * VGColor.lerpSpeed) : VGColor.base;
      conts.forEach(cont => {
        const i_ = document.createElement('i');
        i_.style.background = VGColor.rgbCss(c);
        cont.appendChild(i_);
      });
    }
  }

  // ---------- eventos del panel ----------
  const panel = document.getElementById('panel');
  panel.addEventListener('input', ev => {
    const el = ev.target;
    if (el.dataset.cmd === 'pincel') return;
    if (el.dataset.cmd) set(el.dataset.cmd, el.value);
  });
  panel.addEventListener('change', ev => {
    const el = ev.target;
    if (el.dataset.cmd) set(el.dataset.cmd, el.value);
  });
  // Los valores del panel son campos de texto: escribir un numero y salir (o Enter)
  // aplica el parametro igual que mover el slider.
  function aplicarNumero(el) {
    const cmd = el.dataset.out;
    if (!cmd) return;
    const slider = document.querySelector('input[type="range"][data-cmd="' + cmd + '"]');
    let v = parseFloat(String(el.value).replace(',', '.'));
    if (!isFinite(v)) { syncOut(cmd); return; }
    // OJO: NO se recorta al rango del slider. Si escribís 200 en un parámetro de 0..100,
    // el valor 200 se aplica igual (el slider se queda mostrando su tope, el parámetro no).
    if (slider) slider.value = v;
    if (el.type !== 'text') return;
    set(cmd, v);
    syncOut(cmd);
  }
  panel.addEventListener('change', ev => {
    const el = ev.target;
    if (el.dataset && el.dataset.out && el.tagName === 'INPUT' && el.type === 'text') aplicarNumero(el);
  });
  panel.addEventListener('keydown', ev => {
    const el = ev.target;
    if (!(el.dataset && el.dataset.out && el.type === 'text')) return;
    if (ev.key === 'Enter') { ev.preventDefault(); aplicarNumero(el); el.blur(); }
    if (ev.key === 'Escape') { syncOut(el.dataset.out); el.blur(); }
  });

  panel.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'fluid.toggle') {
      FLAGS.fluid = !FLAGS.fluid; P.isFluid = FLAGS.fluid;
      marcarSwitch(btn, FLAGS.fluid);
      avisarGlobal();
    } else if (act === 'fluid.vivo') {
      FLAGS.vivo = !FLAGS.vivo; P.fluidLive = FLAGS.vivo;
      marcarSwitch(btn, FLAGS.vivo);
      avisarGlobal();
    } else if (act === 'fluid.dry') {
      FLAGS.dry = !FLAGS.dry; P.isDrying = FLAGS.dry;
      marcarSwitch(btn, FLAGS.dry);
      avisarGlobal();
    } else if (act === 'light.toggle') {
      FLAGS.light = !FLAGS.light; P.isLighting = FLAGS.light;
      marcarSwitch(btn, FLAGS.light);
      avisarGlobal();
    } else if (act === 'flow.auto') {
      if (!FLOW) return;
      FLOW.st.auto = !FLOW.st.auto;
      marcarSwitch(btn, FLOW.st.auto);
      if (FLOW.st.auto) { asegurarMotorTrazo(); geografiaFlow(S['color.image']); }
      avisoFlow(FLOW.st.auto ? 'Autopintado andando' : 'Autopintado en pausa');
    } else if (act === 'flow.campo') {
      if (!FLOW) return;
      FLOW.st.campo = !FLOW.st.campo;
      document.body.classList.toggle('ver-campo', !!(FLOW.st.campo || FLOW.st.verCob || (WIND && WIND.st.ver)));
      btn.classList.toggle('on', FLOW.st.campo);
      avisoFlow(FLOW.st.campo ? 'Campo visible' : 'Campo oculto');
    } else if (act === 'flowwind.toggle') {
      // FLOWWIND: corrientes de aire K41/K62 empujando las pinceladas
      if (!WIND) return;
      WIND.st.activo = !WIND.st.activo;
      FLAGS.windactivo = WIND.st.activo;
      marcarSwitch(btn, WIND.st.activo);
      if (WIND.st.activo) {
        asegurarMotorTrazo();
        if (WIND.st.ver) document.body.classList.add('ver-campo');
      }
      estado(WIND.st.activo
        ? 'FLOWWIND activado: las pinceladas siguen las corrientes de aire'
        : 'FLOWWIND apagado');
    } else if (act === 'flowwind.ver') {
      if (!WIND) return;
      WIND.st.ver = !WIND.st.ver;
      FLAGS.windver = WIND.st.ver;
      marcarSwitch(btn, WIND.st.ver);
      document.body.classList.toggle('ver-campo',
        !!((FLOW && (FLOW.st.campo || FLOW.st.verCob)) || WIND.st.ver));
      estado(WIND.st.ver ? 'Corrientes de aire visibles' : 'Corrientes de aire ocultas');
    } else if (act === 'flow.inter') {
      if (!FLOW) return;
      FLOW.st.interactivo = !FLOW.st.interactivo;
      marcarSwitch(btn, FLOW.st.interactivo);
      avisoFlow(FLOW.st.interactivo ? 'Los vectores apuntan a tu mano' : 'Flujo interactivo apagado');
    } else if (act === 'tip.speedsize') {
      FLAGS.speedsize = !FLAGS.speedsize;
      P.isSpeedSize = FLAGS.speedsize;
      marcarSwitch(btn, FLAGS.speedsize);
    } else if (act === 'flow.smart') {
      if (!FLOW) return;
      FLOW.st.smart = !FLOW.st.smart;
      marcarSwitch(btn, FLOW.st.smart);
      if (FLOW.st.smart) {
        if (FLOW.rearmarSmart) FLOW.rearmarSmart();
        if (!FLOW.st.auto) avisoFlow('Smart flowfield ON (se nota con AUTOMÁTICO prendido)');
        else avisoFlow('Smart flowfield: los vectores van hacia lo que falta pintar');
      } else {
        avisoFlow('Smart flowfield apagado');
      }
    } else if (act === 'flow.vercob') {
      if (!FLOW) return;
      FLOW.st.verCob = !FLOW.st.verCob;
      marcarSwitch(btn, FLOW.st.verCob);
      document.body.classList.toggle('ver-campo', !!(FLOW.st.campo || FLOW.st.verCob || (WIND && WIND.st.ver)));
      avisoFlow(FLOW.st.verCob ? 'Grilla de cobertura visible' : 'Grilla de cobertura oculta');
    } else if (act === 'flow.editar') {
      if (!FLOW) return;
      FLOW.st.editar = !FLOW.st.editar;
      marcarSwitch(btn, FLOW.st.editar);
      if (FLOW.st.editar && !FLOW.st.campo) {
        // para editar hay que ver el campo
        FLOW.st.campo = true;
        document.body.classList.add('ver-campo');
        const bc = document.getElementById('btnFlowCampo');
        if (bc) bc.classList.add('on');
      }
      avisoFlow(FLOW.st.editar ? 'Arrastrá sobre el lienzo para reescribir el campo' : 'Edición del campo apagada');
    } else if (act === 'flow.guardar') {
      const nom = (document.getElementById('flowNombre').value || '').trim();
      if (!FLOW || !nom) { avisoFlow('Poné un nombre para guardar el campo'); return; }
      const ok = FLOW.guardarCampo(nom);
      refrescarCamposFlow(nom);
      avisoFlow(ok ? 'Campo guardado: ' + nom : 'No pude guardar el campo');
    } else if (act === 'flow.cargar') {
      const nom = document.getElementById('selFlowGuardados').value;
      if (!FLOW || !nom) { avisoFlow('Elegí un campo guardado'); return; }
      const ok = FLOW.cargarGuardado(nom);
      if (ok) { syncOut('flow.grilla'); avisoFlow('Campo cargado: ' + nom); }
      else avisoFlow('No encontré ese campo');
    } else if (act === 'flow.borrar') {
      const nom = document.getElementById('selFlowGuardados').value;
      if (!FLOW || !nom) { avisoFlow('Elegí un campo guardado'); return; }
      FLOW.borrarGuardado(nom);
      refrescarCamposFlow();
      avisoFlow('Campo borrado: ' + nom);
    } else if (act === 'flow.original') {
      if (!FLOW) return;
      FLOW.campoOriginal();
      avisoFlow('Campo original restaurado');
    } else if (act === 'flow.fondo') {
      FLAGS.verimagen = !FLAGS.verimagen;
      syncFondoSwitches();
      aplicarFondo();
      avisoFlow(FLAGS.verimagen ? 'El cuadro se ve detrás de la pintura' : 'Fondo oculto');
    } else if (act === 'imagen.ver') {
      FLAGS.verimagen = !FLAGS.verimagen;
      syncFondoSwitches();
      aplicarFondo();
    } else if (act === 'imagen.subir') {
      subidaPara = 'color';
      if (fileCuadro) fileCuadro.click();
    } else if (act === 'materia.subir') {
      subidaPara = 'materia';
      if (fileCuadro) fileCuadro.click();
    } else if (act === 'accion.limpiar') {
      limpiar();
    } else if (act === 'accion.png') {
      guardarPng();
    } else if (act === 'accion.full') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else if (document.exitFullscreen) document.exitFullscreen();
    }
  });

  document.getElementById('selPincel').addEventListener('change', ev => setPincel(ev.target.value));

  // ---------- descargar el lienzo en PNG ----------
  // En celular el <a download> con un dataURL de 1920×1080 CASI NUNCA baja nada:
  // iOS Safari ignora el atributo y el base64 se pasa del límite de la barra.
  // Camino robusto:
  //   1. canvas.toBlob → File → navigator.share: abre el menú del sistema con
  //      "Guardar en Fotos/Archivos" (es la única vía 100% segura en iPhone).
  //   2. si no hay share (navegador in-app), hoja propia con la imagen para
  //      guardarla con long press + link de descarga por si el navegador puede.
  //   3. escritorio: ancla con blob URL (más liviana que el dataURL gigante).
  const esCelular = () => {
    if (navigator.userAgentData && navigator.userAgentData.mobile) return true;
    if (/Android|iPhone|iPad|iPod|Mobile|Opera Mini/i.test(navigator.userAgent)) return true;
    return navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) <= 900;
  };

  function pngBlob(cb) {
    let hecho = false;
    const listo = b => { if (!hecho) { hecho = true; cb(b || null); } };
    if (typeof canvas.toBlob === 'function') {
      try { canvas.toBlob(b => listo(b), 'image/png'); }
      catch (e) { /* lienzo contaminado por una imagen externa */ }
      setTimeout(() => listo(null), 12000);   // si toBlob nunca contesta, no colgarse
      return;
    }
    try {
      const d = canvas.toDataURL('image/png');
      const s = atob(d.slice(d.indexOf(',') + 1));
      const u8 = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
      listo(new Blob([u8], { type: 'image/png' }));
    } catch (e) { listo(null); }
  }

  // hoja con la imagen: el long press "Guardar imagen" anda hasta en iPhone
  let pngUrl = null;
  function hojaPng(blob) {
    const hoja = document.getElementById('hojaPng');
    const img = document.getElementById('hojaPngImg');
    const a = document.getElementById('hojaPngBajar');
    if (!hoja || !img || !a) { estado('no pude abrir la vista del PNG'); return; }
    if (pngUrl) URL.revokeObjectURL(pngUrl);
    pngUrl = URL.createObjectURL(blob);
    img.src = pngUrl;
    a.href = pngUrl;
    hoja.hidden = false;
    estado('PNG listo: mantené apretada la imagen para guardarla');
  }
  function cerrarHojaPng() {
    const hoja = document.getElementById('hojaPng');
    const img = document.getElementById('hojaPngImg');
    if (hoja) hoja.hidden = true;
    if (img) img.removeAttribute('src');
    if (pngUrl) { const u = pngUrl; pngUrl = null; setTimeout(() => URL.revokeObjectURL(u), 500); }
  }
  ['hojaPngX', 'hojaPngCerrar'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', cerrarHojaPng);
  });
  (function clickAfueraHojaPng() {
    const hoja = document.getElementById('hojaPng');
    if (hoja) hoja.addEventListener('click', ev => { if (ev.target === hoja) cerrarHojaPng(); });
  })();

  function guardarPng() {
    const nombre = 'pupperdraw.png';
    estado('preparando el PNG…');
    pngBlob(blob => {
      if (!blob) { estado('no pude generar el PNG (¿hay una imagen externa en el lienzo?)'); return; }
      if (esCelular()) {
        // 1) compartir el archivo: menú del sistema con "Guardar en Fotos"
        if (navigator.canShare) {
          let file = null;
          try { file = new File([blob], nombre, { type: 'image/png' }); } catch (e) {}
          if (file && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: 'PUPPERDRAW' })
              .then(() => estado('PNG listo para guardar'))
              .catch(err => {
                if (err && err.name === 'AbortError') { estado('descarga cancelada'); return; }
                hojaPng(blob);   // plan B
              });
            return;
          }
        }
        hojaPng(blob);         // 2) sin share: la imagen en pantalla, se guarda a mano
        return;
      }
      // 3) escritorio
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombre; a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      estado('PNG descargado');
    });
  }
  const btnPng = document.getElementById('btnPng');
  if (btnPng) btnPng.addEventListener('click', guardarPng);

  // el color de la vista simple: siempre pinta en MANUAL (es "elegí un color")
  const colorSimple = document.getElementById('colorSimple');
  if (colorSimple) {
    colorSimple.addEventListener('input', () => {
      if (VGColor.mode !== 'manual') set('color.mode', 'manual');
      set('color.base', colorSimple.value);
    });
  }

  // "+": suma un casillero CON EL COLOR QUE ESTÁ SELECCIONADO (se cambia después con
  // el selector de color del panel). Sin diálogos: un click y aparece el color nuevo.
  const btnMasColor = document.getElementById('btnMasColor');
  if (btnMasColor) {
    btnMasColor.addEventListener('click', () => {
      if (VGColor.slots.length >= 12) { estado('ya hay 12 colores en la paleta'); return; }
      const c = VGColor.base || VGColor.slots[VGColor.slotActivo] || [0.85, 0.25, 0.12];
      VGColor.slots.push([c[0], c[1], c[2]]);
      set('color.slots', VGColor.slotsHex());
      set('color.slot', VGColor.slots.length - 1);   // queda activo, listo para editar
      if (VGColor.mode !== 'manual') set('color.mode', 'manual');
      estado('color ' + VGColor.slots.length + ' agregado (el mismo que tenías) — cambialo con el selector');
    });
  }
  // elegir casillero con el mouse (en la tira simple o en la del panel completo)
  ['muestras', 'muestras2'].forEach(id => {
    const cont = document.getElementById(id);
    if (!cont) return;
    cont.addEventListener('click', ev => {
      const b = ev.target.closest('[data-slot]');
      if (!b) return;
      if (VGColor.mode !== 'manual') set('color.mode', 'manual');
      setSlot(+b.dataset.slot);
    });
  });

  // subir una imagen propia (sirve para IMAGE y para MATERIA)
  let subidaPara = 'color';
  const fileCuadro = document.getElementById('fileCuadro');
  function refrescarCuadros() {
    ['selCuadro', 'selMateria', 'selRefraccion'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const conOff = id !== 'selCuadro';
      const valor = el.value;
      el.textContent = '';
      if (conOff) {
        const o = document.createElement('option');
        o.value = 'off'; o.textContent = '— OFF —';
        el.appendChild(o);
      }
      VGImagenes.lista().forEach(c => {
        const o = document.createElement('option');
        o.value = c.id; o.textContent = c.label;
        el.appendChild(o);
      });
      el.value = valor;
    });
  }
  if (fileCuadro) {
    fileCuadro.addEventListener('change', () => {
      const f = fileCuadro.files && fileCuadro.files[0];
      fileCuadro.value = '';
      if (!f) return;
      VGImagenes.subir(f).then(c => {
        refrescarCuadros();
        if (subidaPara === 'materia') set('luz.materia', c.id);
        else { set('color.image', c.id); setCuadroColor(c.id); }
        estado('Imagen subida: ' + c.label);
      }).catch(err => estado('No se pudo subir: ' + err.message));
    });
  }

  // ---------- lienzo: entrada ----------
  let down = false;
  let editUlt = null;
  const pos = ev => {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * canvas.width / r.width, y: (ev.clientY - r.top) * canvas.height / r.height };
  };

  canvas.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    const p = pos(ev);
    if (FLOW && FLOW.st.editar) {          // modo MODIFICAR: el mouse reescribe el campo
      down = true;
      editUlt = { x: p.x, y: p.y };
      FLOW.pintarCampo(p.x, p.y, 1, 0, FLOW.st.radioEdit);
      return;
    }
    if (FLOW && FLOW.dedo) { FLOW.dedo.x = p.x; FLOW.dedo.y = p.y; FLOW.dedo.dentro = true; }
    down = true;
    TRAZO.onDown(p.x, p.y);
    tip.x = p.x; tip.y = p.y; tip.dx = 0; tip.dy = 0;
    P.isFirstDown = true; tip.moved = false;
  });

  canvas.addEventListener('pointermove', ev => {
    if (FLOW && FLOW.dedo) { const q = pos(ev); FLOW.dedo.x = q.x; FLOW.dedo.y = q.y; FLOW.dedo.dentro = true; }
    if (FLOW && FLOW.st.editar && down) {
      const q = pos(ev);
      if (editUlt) FLOW.pintarCampo(q.x, q.y, q.x - editUlt.x, q.y - editUlt.y, FLOW.st.radioEdit);
      editUlt = { x: q.x, y: q.y };
      return;
    }
    if (!down) return;
    ev.preventDefault();
    const lote = (typeof ev.getCoalescedEvents === 'function' && ev.getCoalescedEvents().length)
      ? ev.getCoalescedEvents() : [ev];
    for (const e of lote) {
      const p = pos(e);
      TRAZO.onMove(p.x, p.y);
      const dx = p.x - tip.x, dy = p.y - tip.y;
      if (dx * dx + dy * dy < 0.25) continue;
      tip.x = p.x; tip.y = p.y; tip.dx = dx; tip.dy = dy; tip.moved = true;
    }
  });

  const fin = () => { down = false; editUlt = null; TRAZO.onUp(); };
  canvas.addEventListener('pointerleave', () => { if (FLOW && FLOW.dedo) FLOW.dedo.dentro = false; });
  canvas.addEventListener('pointerup', fin);
  canvas.addEventListener('pointercancel', fin);
  window.addEventListener('blur', fin);

  // ---------- estado ----------
  let estadoTxt = 'Arrastrá para pintar';
  function estado(t) {
    estadoTxt = t;
    // El pie se sacó del HTML (el usuario no quiere mensajes al pie): si no está, no pasa nada.
    const el = document.getElementById('estado');
    if (el) el.textContent = t;
  }
  function limpiar() {
    TRAZO.clear();
    E.clearAll();
    if (FLOW) {
      FLOW.reiniciar();     // la grilla de cobertura vuelve a cero
      // Si el AUTOPINTADO estaba prendido, LIMPIAR también lo apaga. Si no, al resetear
      // la cobertura el campo vuelve a llenar el lienzo desde cero y parece que limpiar
      // no limpia: "empezó a pintarse solo".
      if (FLOW.st.auto) {
        FLOW.st.auto = false;
        marcarSwitch(document.getElementById('btnFlowAuto'), false);
        const b2 = document.getElementById('btnFlowAuto');
        if (b2) b2.classList.remove('on');
      }
    }
    estado('Lienzo limpio');
  }

  // ---------- atajos ----------
  window.addEventListener('keydown', ev => {
    if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT') return;
    const k = ev.key.toLowerCase();
    if (k === 'c') limpiar();
    if (k === 'd') document.querySelector('[data-act="fluid.dry"]').click();
    if (k === 'f') document.querySelector('[data-act="fluid.toggle"]').click();
    if (k === 'l') document.querySelector('[data-act="light.toggle"]').click();
    // P: abre/cierra los parámetros GLOBALES de la sala (luz, fluidos, materia)
    if (k === 'p') aplicarVista(vista === 'global' ? vistaPincel : 'global', true);
    if (k === 'q' || k === 'w' || k === 'e') {
      const i = { q: 0, w: 1, e: 2 }[k];
      if (VGColor.mode !== 'manual') set('color.mode', 'manual');
      setSlot(i);
    }
    if (ev.key === '[' || ev.key === ']') {
      const el = document.querySelector('[data-cmd="trazo.wid"]');
      const v = Math.max(+el.min, Math.min(+el.max, +el.value + (ev.key === ']' ? 2 : -2)));
      el.value = v; set('trazo.wid', v);
    }
  });

  // ---------- loop ----------
  let ultimo = performance.now();
  let frames = 0;
  // El motor del trazo continuo pinta con UN color global (E.color): para que
  // LERPT TO WHITE / PALETA / IMAGEN funcionen también con Vervette hay que ir
  // cambiándolo carga por carga, igual que hace el Van Gogh con su colorFn.
  let cargasTip = 0;

  // ESTILO COMPLETO DEL PINCEL, para que viaje con cada huella.
  // El pincel es de cada uno, pero la huella tiene que verse IGUAL en todas las
  // pantallas: por eso viaja todo lo que paint() lee del panel (dureza, opacidad,
  // materia, textura, contraste, brillo, cerda, veta, ruido...). Los fluidos y la
  // luz NO viajan acá: esos son parámetros GLOBALES de la sala.
  const r3 = v => Math.round((+v || 0) * 1000) / 1000;
  function estiloTip() {
    return {
      so: r3(P.brushSoft),
      op: r3(P.brushOpacity),
      ma: r3(P.brushMatAdd),
      ns: r3(P.isTexture ? P.noiseScale : 100),
      nc: r3(P.noiseContrast),
      nb: r3(P.noiseBrightness),
      ni: P.isNoiseInverted ? 1 : 0,
      it: r3(P.noiseIterations),
      br: r3(P.bristle),
      st: r3(P.noiseStretch),
      g: r3(P.grano || 0),
      ge: r3(P.granoEscala || 20),
      pm: P.paintMode | 0,
      rp: P.isShiftDown ? 1 : 0,
      ad: P.isAdditive ? 1 : 0
    };
  }

  function loop(now) {
    const dt = Math.min(3, (now - ultimo) / 16.67) || 1;
    ultimo = now;

    if (VGColor.mode === 'hue') {
      const c = VGColor.tick(dt);
      if (c) E.color(c[0], c[1], c[2]);
    }

    const motor = document.body.dataset.motor;
    if (motor === 'tip') {
      if (tip.moved) {
        P.bristle = 0;
        if (VGColor.usesPerLoad()) {
          const c = VGColor.colorForLoad(cargasTip++, tip.x, tip.y);
          if (c) E.color(c[0], c[1], c[2]);
        }
        // el trazo continuo NO crea pinceladas del Van Gogh: lo que ve la sala
        // son las huellas del pincel, con su radio, su dureza, su color Y TODO SU ESTILO
        if (window.COLAB && typeof window.COLAB.stamp === 'function') {
          window.COLAB.stamp({
            x: tip.x, y: tip.y, dx: tip.dx, dy: tip.dy,
            // radio EFECTIVO (ya incluye TAMAÑO POR VEL.): si viajara el tamaño pelado,
            // el otro cliente vería un trazo de ancho fijo y no el de acá
            r: Math.max(1, E.radioActual()),
            s: P.brushSoft,
            o: P.brushOpacity,
            f: P.isFirstDown ? 1 : 0,   // primer punto del trazo: la misma gota inicial
            e: estiloTip(),             // todo el estilo: textura, materia, dureza, cerda...
            c: (E.P.Col || [1, 1, 1]).slice(0, 3)
          });
        }
        // + las pinceladas de Van Gogh que estén llegando de la sala
        const ajenas = TRAZO.frame();
        E.frame([{ x: tip.x, y: tip.y, dx: tip.dx, dy: tip.dy, first: P.isFirstDown }].concat(ajenas), 1);
        tip.moved = false;
      } else {
        const ajenas = TRAZO.frame();
        E.frame(ajenas.length ? ajenas : null, 1);
      }
    } else {
      if (WIND && (WIND.st.activo || WIND.st.ver)) WIND.update(dt);
      if (FLOW && FLOW.st.auto && FLOW.st.pincel && FLOW.listo) FLOW.update(dt);
      const flowDibuja = !!(FLOW && (FLOW.st.campo || FLOW.st.verCob));
      if (flowDibuja) FLOW.dibujar();
      // las corrientes de aire comparten el overlay: si FLOWFIELD ya dibujó, suma
      if (WIND && WIND.st.ver) WIND.dibujar(flowDibuja);
      const tips = TRAZO.frame();
      E.frame(tips.length ? tips : null, 1);
    }

    if (g2) {
      g2.globalCompositeOperation = 'copy';
      g2.drawImage(document.getElementById('lienzo'), 0, 0);
    }

    // El contador de pinceladas en la línea de estado se sacó a pedido:
    // ensuciaba el pie ("preset: ... · 0 pinceladas") y no aporta.
    requestAnimationFrame(loop);
  }

  // ---------- modo espejo (mirror=1) ----------
  // Un canvas WebGL dentro de un iframe con transform 3D queda NEGRO en Chrome.
  // Por eso el estudio se copia cada frame a un canvas 2D, que si compone:
  // asi la pared LED de la Sala 5 muestra el estudio de verdad, pintando.
  const MIRROR = window.VG_MIRROR === 1 || /[?&]mirror=1/.test(location.search);
  let g2 = null, lienzo2d = null;
  if (MIRROR) {
    const src = document.getElementById('lienzo');
    lienzo2d = document.createElement('canvas');
    lienzo2d.id = 'lienzo2d';
    lienzo2d.width = src.width; lienzo2d.height = src.height;
    document.body.appendChild(lienzo2d);
    g2 = lienzo2d.getContext('2d', { alpha: false });
    document.body.classList.add('mirror');
  }

  // ---------- modo pantalla: sin panel + pinta solo (attract loop) ----------
  if (MIRROR) {
    const p = document.getElementById('panel');
    if (p) p.style.display = 'none';
    const barra = document.querySelector('.barra'), pie = document.querySelector('.pie');
    if (barra) barra.style.display = 'none';
    if (pie) pie.style.display = 'none';

    // la pared LED nunca queda vacía: si nadie toca, la mano imaginaria pinta sola
    const lienzo = document.getElementById('lienzo');
    let ultimoToque = 0;
    ['pointerdown', 'pointermove'].forEach(ev =>
      addEventListener(ev, () => { ultimoToque = performance.now(); }, { passive: true }));
    let f = 0;
    setInterval(() => {
      if (performance.now() - ultimoToque < 2500) return;
      const w = innerWidth, h = innerHeight;
      const x = w * (0.5 + 0.34 * Math.sin(f * 0.09) * Math.cos(f * 0.031));
      const y = h * (0.5 + 0.32 * Math.cos(f * 0.071) * Math.sin(f * 0.043));
      const tipo = f % 90 === 0 ? 'pointerdown' : 'pointermove';
      lienzo.dispatchEvent(new PointerEvent(tipo, {
        clientX: x, clientY: y, bubbles: true, buttons: 1, pointerId: 1, isPrimary: true
      }));
      f++;
    }, 28);
  }

  // ---------- modo embed (dentro del dashboard de salas, sin barra ni pie) ----------
  if (window.VG_EMBED === 1 || /[?&]embed=1/.test(location.search)) document.body.classList.add('embed');

  // ---------- presets: guardar / cargar todo el panel ----------
  const FLAG_ACT = { fluid: 'fluid.toggle', dry: 'fluid.dry', vivo: 'fluid.vivo', light: 'light.toggle', verimagen: 'imagen.ver', speedsize: 'tip.speedsize',
    windactivo: 'flowwind.toggle', windver: 'flowwind.ver' };

  function aplicarEstado(est) {
    if (!est) return;
    if (est.pincel && VGPinceles.byId(est.pincel).id === est.pincel) setPincel(est.pincel);
    const p = est.params || {};
    // el color va primero: el modo define qué hace cada carga de pincel
    ['color.image', 'color.imgradio', 'color.mode', 'color.palette', 'color.lerpspeed',
      'color.palcycle', 'color.palvar', 'color.noise', 'color.huespeed',
      'color.slots', 'color.slot', 'color.base',
      'luz.materia', 'luz.refraccion', 'light.refrstr']
      .forEach(k => { if (p[k] !== undefined) set(k, p[k]); });
    Object.keys(p).forEach(k => {
      if (k === 'pincel.tamano') return;    // se aplica al final, sobre la base nueva
      if (S[k] !== undefined) set(k, p[k]);
    });
    if (p['pincel.tamano'] !== undefined) set('pincel.tamano', p['pincel.tamano']);
    const f = est.flags || {};
    Object.keys(FLAG_ACT).forEach(k => {
      if (f[k] !== undefined && !!f[k] !== !!FLAGS[k]) {
        const b = document.querySelector('[data-act="' + FLAG_ACT[k] + '"]');
        if (b) b.click();
      }
    });
    syncAll();
    muestras();
  }

  VGPresets.iniciar({
    capturar: () => ({ pincel: S.pincel, params: Object.assign({}, S), flags: Object.assign({}, FLAGS) }),
    aplicar: aplicarEstado,
    avisar: estado,
    // los presets se guardan en el servidor (los recibe toda la sala)
    guardar: (lista) => {
      if (window.COLAB && typeof window.COLAB.presets === 'function') window.COLAB.presets(lista);
    },
    // SET AS DEFAULT: el preset elegido se carga solo al abrir (lo guarda el server)
    guardarDefault: (clave) => {
      if (window.COLAB && typeof window.COLAB.config === 'function') window.COLAB.config('presetDefault', clave);
    }
  });

  // el preset por defecto de la sala llega en la config del server.
  // colab.js se carga DESPUÉS de este archivo, así que se engancha con reintento.
  (function engancharPresetDefault() {
    if (window.COLAB && typeof window.COLAB.onConfig === 'function') {
      window.COLAB.onConfig((clave, valor) => {
        if (clave === 'presetDefault' && valor && window.VGPresets && VGPresets.aplicarPorId) {
          VGPresets.aplicarPorId(valor);
        }
      });
      return;
    }
    setTimeout(engancharPresetDefault, 150);
  })();

  // ---------- switches: estado inicial segun FLAGS ----------
  function sincronizarSwitches() {
    [['btnFluid', 'fluid'], ['btnVivo', 'vivo'], ['btnDry', 'dry'], ['btnLight', 'light'],
     ['btnSpeedSize', 'speedsize'], ['btnVer', 'verimagen'], ['btnFlowFondo', 'verimagen'],
     ['btnWindToggle', 'windactivo'], ['btnWindVer', 'windver']]
      .forEach(([id, k]) => marcarSwitch(document.getElementById(id), FLAGS[k]));
  }

  // ---------- parámetros GLOBALES (luz, fluidos, materia): son de la SALA ----------
  // Cada cliente tiene su pincel; estos, en cambio, valen para todos. Se avisan al
  // colaborativo (colab.js los manda por socket) y cuando llegan de afuera se aplican
  // sin re-emitir, para no armar un rebote infinito entre clientes.
  const PARAMS_GLOBALES = [
    'fluid.speed', 'fluid.smudge', 'fluid.slip', 'fluid.life',
    'light.gloss', 'light.bump', 'light.refrstr',
    'paint.blend', 'luz.materia', 'luz.refraccion'
  ];
  const FLAGS_GLOBALES = ['fluid', 'vivo', 'dry', 'light'];
  let alCambiarGlobal = null;
  let aplicandoGlobal = false;

  function esGlobal(cmd) { return PARAMS_GLOBALES.indexOf(cmd) >= 0; }

  function globalesActuales() {
    const params = {};
    PARAMS_GLOBALES.forEach(k => { if (S[k] !== undefined) params[k] = S[k]; });
    const flags = {};
    FLAGS_GLOBALES.forEach(k => { flags[k] = !!FLAGS[k]; });
    return { params: params, flags: flags };
  }

  function avisarGlobal() {
    if (aplicandoGlobal || typeof alCambiarGlobal !== 'function') return;
    alCambiarGlobal(globalesActuales());
  }

  function aplicarGlobales(est) {
    if (!est) return;
    aplicandoGlobal = true;
    try { aplicarEstado(est); } finally { aplicandoGlobal = false; }
  }

  // ---------- vistas del panel: simple · todos · global · cerrado ----------
  // El estado queda escrito en la URL: panel=simple|todos|global|off (ver config.js)
  const U = window.PPDURL || { leer: (k, d) => d, escribir: () => {} };
  let vista = 'simple';
  let vistaPincel = 'simple';   // qué vista del pincel estaba abierta (simple | todos)

  function aplicarVista(v, guardar) {
    v = (v === 'global' || v === 'off' || v === 'todos') ? v : 'simple';
    vista = v;
    const esGlobal = v === 'global';
    document.body.classList.toggle('panel-off', v === 'off');
    // la barra de vistas (GLOBAL / volver) aparece SÓLO cuando estás en global:
    // por defecto el panel no muestra nada de global, se entra con la tecla P
    const pv = document.getElementById('panelVistas');
    if (pv) pv.hidden = !esGlobal;
    if (v !== 'off' && !esGlobal) vistaPincel = v;
    if (v === 'off' && guardar !== false) { /* se recuerda para el botón ⚙ */ }

    document.querySelectorAll('[data-vista-btn]').forEach(b => {
      b.classList.toggle('on', b.dataset.vistaBtn === (esGlobal ? 'global' : 'pincel'));
    });
    document.querySelectorAll('#panel .vista').forEach(d => {
      d.hidden = esGlobal ? d.dataset.vista !== 'global' : d.dataset.vista !== 'pincel';
    });

    const completa = v === 'todos';
    const sc = document.getElementById('secCompleto');
    if (sc) sc.hidden = !completa;
    marcarSwitch(document.getElementById('btnTodos'), completa);

    if (guardar !== false) U.escribir('panel', v === 'simple' ? null : v);
    try { E.resize(); } catch (e) {}
    syncColorSimple();
  }

  document.querySelectorAll('[data-vista-btn]').forEach(b => {
    b.addEventListener('click', () => {
      if (b.dataset.vistaBtn === 'global') aplicarVista('global', true);
      else aplicarVista(vistaPincel, true);
    });
  });

  const btnTodos = document.getElementById('btnTodos');
  if (btnTodos) btnTodos.addEventListener('click', () => aplicarVista(vista === 'todos' ? 'simple' : 'todos', true));

  (function panelPlegable() {
    const cerrar = document.getElementById('btnCerrarPanel');
    const abrir = document.getElementById('btnAbrirPanel');
    // en celular arranca cerrado (si no no se puede ni tocar el lienzo)
    const chico = Math.min(window.innerWidth, window.innerHeight) < 700;
    let inicial = U.leer('panel', null);
    if (inicial === null) inicial = chico ? 'off' : 'simple';
    aplicarVista(inicial, false);
    if (cerrar) cerrar.addEventListener('click', () => aplicarVista('off', true));
    if (abrir) abrir.addEventListener('click', () => aplicarVista(vistaPincel, true));
    window.VGPanel = { aplicar: aplicarVista, vista: () => vista };
  })();

  // El panel y el chat cuelgan debajo de la barra; en el celular la barra se
  // envuelve en dos filas y crece, así que el alto real se publica como --barra-h.
  (function altoDeLaBarra() {
    const barra = document.querySelector('.barra');
    const medir = () => {
      const h = barra ? barra.offsetHeight : 0;
      document.documentElement.style.setProperty('--barra-h', (h > 20 ? h + 8 : 54) + 'px');
    };
    medir();
    addEventListener('resize', medir);
    addEventListener('orientationchange', () => setTimeout(medir, 250));
  })();

  // ---------- la ruedita de la barra: derecho a los FLUIDOS avanzados ----------
  // En el celular no hay tecla P: este botón abre la vista GLOBAL (los fluidos son
  // de la sala), abre la sección FLUIDOS y la deja a la vista con un destello.
  const btnFluidos = document.getElementById('btnFluidos');
  if (btnFluidos) btnFluidos.addEventListener('click', () => {
    aplicarVista('global', true);
    const sec = document.getElementById('secFluidos');
    if (!sec) return;
    sec.open = true;
    const panelEl = document.getElementById('panel');
    if (panelEl) {
      // offsetTop no siempre es relativo al panel: se calcula con rectángulos
      const pr = panelEl.getBoundingClientRect(), sr = sec.getBoundingClientRect();
      panelEl.scrollTop += (sr.top - pr.top) - 8;
    }
    sec.classList.remove('destello');
    void sec.offsetWidth;              // reinicia la animación
    sec.classList.add('destello');
    setTimeout(() => sec.classList.remove('destello'), 1500);
    estado('FLUIDOS de la sala: velocidad, arrastre, desliz y vida');
  });

  // ---------- build visible ----------
  // la estampa de version la pone publish.py en cada deploy: sirve para saber si el
  // navegador está corriendo el JS nuevo o uno cacheado
  const VG_BUILD = (function () {
    const s = [...document.querySelectorAll('script[src*="?v="]')].map(x => x.src.split('?v=')[1]);
    return s.length ? s[s.length - 1] : 'dev';
  })();
  window.VG_BUILD = VG_BUILD;
  const ayuda = document.querySelector('.ayuda');
  if (ayuda) ayuda.textContent = 'C limpiar · D secado · F fluido · L luz · [ ] tamaño · build ' + VG_BUILD;

  // ---------- arranque ----------
  const selPaleta = document.getElementById('selPaleta');
  if (selPaleta && window.VGPALETAS) {
    VGPALETAS.PALETAS.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.label;
      selPaleta.appendChild(o);
    });
  }
  // imagenes: cinco cuadros + (despues) las que suba el usuario
  refrescarCuadros();
  // la paleta NO se guarda en el navegador: arranca con los colores por defecto
  // y, si la sala ya tiene una, el servidor la manda en el 'historial'
  setSlots(S['color.slots']);
  setCuadroColor(S['color.image']);
  setMateria(S['luz.materia']);
  setRefraccion(S['luz.refraccion']);
  set('light.refrstr', S['light.refrstr']);
  setPaleta(S['color.palette']);
  setPincel(VGPinceles.DEFAULT);
  // con muchos pinceles automáticos hacen falta más pinceladas concurrentes.
  // En celular se recorta: cada pincelada viva es una pasada del shader y el
  // pincel Van Gogh droppeaba mientras se arrastraba el dedo.
  TRAZO.R.maxActive = window.__PPD_MOVIL ? 48 : 240;
  // capa de ruido del trazo: el slider muestra 20/26, hay que empujarlo al motor
  set('trazo.grano', S['trazo.grano']);
  set('trazo.granoEsc', S['trazo.granoEsc']);
  set('flow.cobertura', S['flow.cobertura']);
  set('flow.smartfuerza', S['flow.smartfuerza']);
  // FLOWWIND: los sliders de viento empujan sus valores al módulo
  ['wind.fuerza', 'wind.epsilon', 'wind.escalaL', 'wind.eta', 'wind.octavas',
    'wind.lambda', 'wind.viento', 'wind.angulo', 'wind.velocidad']
    .forEach(k => set(k, S[k]));
  // el selector FLOWFIELD / FLOWWIND del menú FLUJO
  document.querySelectorAll('#flujoModo .fm').forEach(b => {
    b.addEventListener('click', () => ponerModoFlujo(b.dataset.flujo));
  });
  ponerModoFlujo(S['flujo.modo'] || 'flowfield', true);
  set('color.mode', 'manual');
  E.S.setFluidSpeed(S['fluid.speed']);
  E.S.setFluidSmudge(S['fluid.smudge']);
  E.S.setFluidSlip(S['fluid.slip']);
  E.S.setGlossiness(S['light.gloss']);
  E.S.setBumpHeight(S['light.bump']);
  P.isFluid = true; P.isDrying = true; P.isLighting = true; P.fluidLive = true;
  document.getElementById('btnFluid').classList.add('on');
  document.getElementById('btnDry').classList.add('on');
  document.getElementById('btnLight').classList.add('on');
  muestras();
  sincronizarSwitches();

  // último paso: si la URL trae ?p=<config completa> o ?preset=<nombre|id>, se aplica
  // DESPUÉS de todo el arranque (si va antes, los defaults de arriba la pisan)
  try {
    const desdeLink = VGPresets.aplicarDesdeURL();
    if (desdeLink) { muestras(); estado('configuración del link aplicada'); }
    else {
      // preset con el que arranca el estudio: el del pincel por defecto (Vervette).
      // Si no lo encuentra, cae al primero de las fábricas de ese pincel.
      const fabs = (VGPresets.fabricas ? VGPresets.fabricas() : []);
      const pid = VGPinceles.DEFAULT;
      const fab = fabs.find(f => f.estado && f.estado.pincel === pid && /parejo|continuo/i.test(f.nombre))
        || fabs.find(f => f.estado && f.estado.pincel === pid);
      if (fab) {
        aplicarEstado(fab.estado);
        const selP = document.getElementById('selPreset');
        if (selP) selP.value = 'fab:' + fab.nombre;
        const nomP = document.getElementById('nombrePreset');
        if (nomP) nomP.value = fab.nombre;
        muestras();
        estado('preset: ' + fab.nombre);
      }
    }
  } catch (err) { /* link roto: se ignora */ }

  requestAnimationFrame(loop);
})();
