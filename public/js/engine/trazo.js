/* =====================================================================
   trazo.js — pincel "Van Gogh" sobre el motor Vervette.
   El puntero NO pinta: siembra pinceladas. Cada pincelada se dibuja sola,
   en varios frames, con forma de hoja asimétrica (arranca fino, engorda al
   30% del largo y muere en punta), curvatura propia, ángulo con desvío y
   cerda orientada (el shader recibe el eje del trazo).
   Un mismo punto de siembra puede soltar varias pinceladas en paralelo
   (perPass): eso es "cuántas pinceladas van sobre la misma parte".
   ===================================================================== */
(function (global) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function createTrazo(E, canvas, o) {
    const P = E.P;

    // ---------- parámetros vivos (los mueve el GUI) ----------
    const R = Object.assign({
      enabled: true,
      len: 78,        // largo base de la pincelada (px)
      wid: 15,        // radio máximo (px)
      spacing: 0.34,  // separación de siembra = spacing * len
      perPass: 1,     // pinceladas paralelas por punto de siembra
      jitter: 0.20,   // desvío angular ± (rad)
      bend: 0.35,     // curvatura lateral (fracción del largo)
      speed: 10,      // avance de la brocha (px por frame)
      taper: 0.9,     // 0 = banda pareja, 1 = hoja bien puntiaguda
      soft: 0.35,     // dureza del borde (fracción del radio)
      bristle: 1,     // vetas de cerda (0 = ruido original de Vervette)
      stretch: 3.2,   // anisotropía de la cerda (alargada a lo largo)
      spread: 0.95,   // corrimiento lateral (× ancho) = ancho del pincel
      dwell: true,    // si el puntero se queda quieto, sigue acariciando
      lenVar: 0.32,
      widVar: 0.30,
      opacVar: 0.12,
      maxActive: 96,
      speedLen: 1.0,
      seed: 0x9e3779b9,
      colorFn: null,  // (idxDeCarga) => [r,g,b]  · null = color del motor
      windFn: null    // (x, y) => { vx, vy, strength } · null = sin corrientes de aire
    }, o || {});

    let rnd = mulberry32(R.seed >>> 0);
    const TAU = Math.PI * 2;
    // escala de diseño: el lienzo mide 1920x1080, pero los parametros estan
    // pensados para 720 de alto. Todo va en px, asi que se escalan parejo.
    const K = () => (canvas.height || 720) / 720;

    // ---------- estado del puntero ----------
    let down = false;
    let px = 0, py = 0;
    let sx = 1, sy = 0;          // dirección suavizada de la mano
    let sinceEmit = 0;           // px acumulados desde el último spawn
    let stillFrames = 0;
    let handSp = 0;      // velocidad de la mano (px por evento); decae sola
    let dwellCount = 0;  // el dwell es un golpecito, no un emisor infinito
    let dwellTimer = 0;
    let emissions = 0;           // pinceladas sembradas
    let loads = 0;               // cargas de pincel (una por punto de siembra)
    let strokes = [];
    const ultimosTips = [];   // debug: ultimos tips que salieron al motor

    // estilo que viaja por socket: 3 decimales alcanzan y no inflan el payload
    const r3 = v => Math.round((+v || 0) * 1000) / 1000;

    function arcX(s, u) {
      const a = u * s.len;
      const b = Math.sin(Math.PI * u) * s.bend * s.len * 0.5;
      return s.x + Math.cos(s.ang) * a - Math.sin(s.ang) * b;
    }
    function arcY(s, u) {
      const a = u * s.len;
      const b = Math.sin(Math.PI * u) * s.bend * s.len * 0.5;
      return s.y + Math.sin(s.ang) * a + Math.cos(s.ang) * b;
    }
    function radiusAt(s, u) {
      const t = Math.pow(clamp(u, 0, 1), 0.62);
      const leaf = Math.pow(Math.sin(Math.PI * t), 0.42);
      const taper = (typeof s.taper === 'number') ? s.taper : R.taper;
      return s.wid * ((1 - taper) + taper * leaf);
    }

    // suelta UNA pincelada; k = carril dentro del ancho del pincel
    function spawnOne(x, y, hx, hy, scale, k, n, color, auto, ov) {
      if (strokes.length >= R.maxActive) return null;
      // ESTILO: la pincelada remota tiene que verse igual allá que acá. Curvatura,
      // abanico, punta, cerda, veta y ruido son del pincel del que pinta, no del que mira:
      // si no viajan, el mismo trazo se ve distinto en cada pantalla.
      const est = (ov && ov.est) ? ov.est : null;
      // valor del estilo heredado (pincelada remota) o el del panel de acá
      const estN = (k, def) => (est && typeof est[k] === 'number') ? est[k] : def;
      const bendR = (est && typeof est.b === 'number') ? est.b : R.bend;
      const spreadR = (est && typeof est.s === 'number') ? est.s : R.spread;
      const taperR = (est && typeof est.t === 'number') ? est.t : R.taper;
      const speedBoost = 1 + clamp((Math.hypot(hx, hy) / Math.max(1, R.speed * K())) * 0.12, 0, 0.5) * R.speedLen;
      // pincelada remota: manda el tamaño del que la sembró, con una variación chica
      // del que recibe (si no, todas llegan del mismo tamaño exacto y se ve estampado)
      const len = (ov && ov.len)
        ? Math.max(6, ov.len * (1 + (rnd() * 2 - 1) * R.lenVar * 0.45))
        : Math.max(6, R.len * K() * scale * speedBoost * (1 + (rnd() * 2 - 1) * R.lenVar));
      const wid = (ov && ov.wid)
        ? Math.max(1.2, ov.wid * (1 + (rnd() * 2 - 1) * R.widVar * 0.45))
        : Math.max(1.2, R.wid * K() * (1 + (rnd() * 2 - 1) * R.widVar));
      // reparto de carriles: si n=1 se alterna de lado (banda pareja),
      // si n>1 los carriles se distribuyen dentro del ancho del pincel
      let off;
      if (n <= 1) {
        const side = (emissions & 1) ? 1 : -1;
        off = side * (0.35 + 0.65 * rnd()) * spreadR * wid;
      } else {
        off = ((k + 0.5) / n * 2 - 1) * spreadR * wid * 1.15;
      }
      const x0 = x - hy * off, y0 = y + hx * off;
      // las pinceladas del autopintado llevan menos desvio: tienen que leerse alineadas al vector
      const jit = R.jitter * (auto ? 0.35 : 1);
      let ang = Math.atan2(hy, hx) + (rnd() * 2 - 1) * jit;
      // CORRIENTES DE AIRE (FLOWWIND): la pincelada nace alineada al viento
      // en ese punto, mezclada con la dirección de la mano.
      if (typeof R.windFn === 'function') {
        const w = R.windFn(x0, y0);
        if (w && w.strength > 0.001) {
          const wm = Math.hypot(w.vx, w.vy);
          if (wm > 0.001) {
            const blend = clamp(w.strength * 0.45, 0, 0.85);
            const wxn = w.vx / wm, wyn = w.vy / wm;
            const bx = Math.cos(ang) * (1 - blend) + wxn * blend;
            const by = Math.sin(ang) * (1 - blend) + wyn * blend;
            ang = Math.atan2(by, bx);
          }
        }
      }
      strokes.push({
        x: x0, y: y0, ang: ang, len: len, wid: wid,
        bend: (rnd() * 2 - 1) * bendR,
        taper: taperR,
        u: 0, cx: x0, cy: y0, drawn: 0,
        wx: 0, wy: 0,   // deriva acumulada por las corrientes de aire
        seed: [rnd() * 37.13, rnd() * 51.71],
        opac: 1 - rnd() * R.opacVar,
        color: color,
        auto: !!auto,
        // estilo completo que viaja con la pincelada (lo aplica el motor en cada tip).
        // TODO lo que paint() lee del panel de quien pinta va acá: si algo queda afuera
        // (textura, materia, opacidad, contraste, brillo), el mismo trazo se ve distinto
        // en cada pantalla. Los fluidos y la luz NO van: son de la sala.
        est: {
          b: r3(bendR), s: r3(spreadR), t: r3(taperR),
          br: r3(estN('br', R.bristle)),
          st: r3(estN('st', R.stretch)),
          g: r3(estN('g', (typeof P.grano === 'number') ? P.grano : 0)),
          ge: r3(estN('ge', P.granoEscala || 20)),
          op: r3(estN('op', P.brushOpacity)),
          ma: r3(estN('ma', P.brushMatAdd)),
          ns: r3(estN('ns', P.isTexture ? P.noiseScale : 100)),
          nc: r3(estN('nc', P.noiseContrast)),
          nb: r3(estN('nb', P.noiseBrightness)),
          ni: estN('ni', P.isNoiseInverted ? 1 : 0),
          it: r3(estN('it', P.noiseIterations)),
          pm: estN('pm', P.paintMode | 0),
          rp: estN('rp', P.isShiftDown ? 1 : 0),
          ad: estN('ad', P.isAdditive ? 1 : 0),
          // pincel de imagen: viaja el id para que el otro pinte con la misma.
          // OJO: el fallback `R.imagenPincel` es SÓLO para las pinceladas propias.
          // Si una remota llegaba sin `im`, heredaba la imagen que tuviera cargada
          // EL QUE RECIBE y las pinceladas del Van Gogh ajeno se pintaban con esa
          // imagen (bug: "en su cliente se veía con color y en el mío con imagen").
          im: (est && est.im) ? est.im : ((ov && ov.remoto) ? undefined : (R.imagenPincel || undefined))
        },
        // velocidad de la mano que la sembró: la usan los tips para alimentar la corriente.
        // En las remotas sin dato (historial viejo, cliente viejo) queda null y el motor
        // usa el avance de la propia pincelada, así igual se mezcla.
        hand: (ov && typeof ov.hand === 'number') ? ov.hand : ((ov && ov.remoto) ? null : handSp),
        remoto: !!(ov && ov.remoto),
        axis: { x: Math.cos(ang), y: -Math.sin(ang) },
        origin: { x: (x0 / canvas.width) * (canvas.width / canvas.height), y: 1 - y0 / canvas.height }
      });
      emissions++;
      return strokes[strokes.length - 1];
    }

    // suelta una CARGA de pincel (perPass pinceladas del mismo tono)
    function spawn(x, y, dx, dy, scale, opt) {
      const dl = Math.hypot(dx, dy) || 1;
      const hx = dx / dl, hy = dy / dl;
      // color/geometria impuestos = pincelada que llega de otro usuario (colaborativo)
      // color de ESTA pincelada: el que impone el host (remota), el que da colorFn
      // (paleta/imagen) o el color vivo del motor (manual/hue). Así cada pincelada
      // viaja al colaborativo con su color y no con el del que la recibe.
      const porFn = (typeof R.colorFn === 'function') ? R.colorFn(loads, x, y) : null;
      const color = (opt && opt.color) ? opt.color
        : (porFn || ((P && P.Col) ? [P.Col[0], P.Col[1], P.Col[2]] : null));
      // ov SIEMPRE existe: además de tamaño, lleva la velocidad de la mano del que
      // siembra (para que la corriente fluya igual en el que recibe) y la marca remoto.
      const ov = {
        len: opt && opt.len,
        wid: opt && opt.wid,
        est: (opt && opt.est) || null,
        hand: (opt && typeof opt.hand === 'number') ? opt.hand : null,
        remoto: !!(opt && opt.remoto)
      };
      loads++;
      const n = Math.max(1, Math.round((opt && opt.pass) || R.perPass));
      const auto = !!(opt && opt.auto);   // vino del autopintado, no de la mano
      let salida = null;
      for (let k = 0; k < n; k++) {
        const s = spawnOne(x, y, hx, hy, scale, k, n, color, auto, ov);
        if (s) salida = s;
      }
      // la pincelada remota conserva la velocidad de mano de QUIEN la sembró
      if (salida) { salida.pass = n; if (!(opt && opt.remoto)) salida.hand = handSp; }
      // avisa al colaborativo SOLO de las pinceladas de la mano (las del autopintado
      // son de cada cliente y no se sincronizan)
      if (salida && !auto && !(opt && opt.remoto) && typeof R.onSpawn === 'function') R.onSpawn(salida);
      return salida;
    }

    // ---------- entrada ----------
    function onDown(x, y) {
      // con el pincel de TRAZO CONTINUO el trazo del Van Gogh queda apagado:
      // si siguiera sembrando, esas pinceladas viajarían al socket y el otro
      // vería otra cosa distinta a la que yo pinto
      if (!R.enabled) return;
      down = true; px = x; py = y;
      sinceEmit = 0; stillFrames = 0; dwellTimer = 3; dwellCount = 0; handSp = 0; hist.length = 0;
      sx = 1; sy = 0;
    }
    function onUp() { down = false; stillFrames = 0; handSp = 0; hist.length = 0; }

    // hist: últimas posiciones para medir desplazamiento NETO en una ventana de tiempo.
    // Un mouse/trackpad apoyado manda 1-4 px de temblor a 125 Hz: sumando distancias eso
    // parece movimiento y siembra pinceladas sin parar (el "remolino" que gira solo).
    // Midiendo el desplazamiento neto en ~160 ms el temblor da ~0 y la mano real da decenas de px.
    const hist = [];
    const VENTANA = 160;   // ms
    const NETO_MIN = 7;    // px de desplazamiento neto para considerar que la mano se mueve

    function onMove(x, y) {
      if (!R.enabled) return;
      if (!down) return;
      const dx = x - px, dy = y - py;
      const d = Math.hypot(dx, dy);

      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      hist.push({ t: now, x: x, y: y });
      while (hist.length > 1 && now - hist[0].t > VENTANA) hist.shift();
      const o = hist[0];
      const neto = Math.hypot(x - o.x, y - o.y);

      // temblor / mano quieta: no acumula distancia, no siembra, no alimenta la corriente
      if (d < 0.2 || (hist.length > 1 && neto < NETO_MIN)) {
        stillFrames++; handSp *= 0.55; px = x; py = y; sinceEmit = 0;
        return;
      }
      stillFrames = 0;
      handSp = Math.max(handSp * 0.5, neto);

      const ux = dx / d, uy = dy / d;
      const k = 0.30;
      sx += (ux - sx) * k; sy += (uy - sy) * k;
      const sl = Math.hypot(sx, sy) || 1;
      sx /= sl; sy /= sl;

      const gap = Math.max(3, R.spacing * R.len * K());
      let dist = d, cx = px, cy = py, guard = 0;
      while (guard++ < 32) {
        const toNext = gap - sinceEmit;
        if (dist < toNext) { sinceEmit += dist; break; }
        cx += ux * toNext; cy += uy * toNext;
        dist -= toNext;
        sinceEmit = 0;
        spawn(cx, cy, sx, sy, 1);
      }
      if (guard >= 32) sinceEmit = 0;
      px = x; py = y;
    }

    // ---------- un frame del pincel ----------
    function frame() {
      const tips = [];
      const stepPx = Math.max(1.5, R.speed * K());

      handSp *= 0.75;   // sin eventos nuevos la mano "se frena"

      if (R.enabled && down && R.dwell && dwellCount < 2 && stillFrames > 10 && strokes.length < R.maxActive) {
        if (--dwellTimer <= 0) {
          dwellCount++;
          const a = rnd() * TAU;
          spawn(px + Math.cos(a) * R.wid * K() * 0.4, py + Math.sin(a) * R.wid * K() * 0.4,
                sx * 0.6 + Math.cos(a) * 0.4, sy * 0.6 + Math.sin(a) * 0.4, 0.72);
          dwellTimer = 14;
        }
      }

      for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i];
        const u0 = s.u;
        s.u = Math.min(1, s.u + stepPx / s.len);
        // CORRIENTES DE AIRE: cada frame la pincelada se corre un poco a favor del viento
        if (typeof R.windFn === 'function') {
          const w = R.windFn(s.cx, s.cy);
          if (w) { s.wx += w.vx; s.wy += w.vy; }
        }
        const nx = arcX(s, s.u) + s.wx, ny = arcY(s, s.u) + s.wy;
        const r0 = radiusAt(s, u0), r1 = radiusAt(s, s.u);
        const dx = nx - s.cx, dy = ny - s.cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.0004) {
          // la cerda se orienta contra el avance real (incluye la deriva del viento)
          const dl = Math.sqrt(d2);
          s.axis = { x: dx / dl, y: -dy / dl };
          tips.push({
            x: nx, y: ny, dx: dx, dy: dy,
            first: s.drawn === 0,
            rad: 0.5 * (r0 + r1),
            soft: R.soft,
            ang: s.ang,
            axis: s.axis,
            origin: s.origin,
            hand: s.remoto ? s.hand : handSp,
            remoto: s.remoto === true,
            est: s.est,
            auto: s.auto === true,
            seed: s.seed,
            opac: s.opac,
            color: s.color || undefined
          });
        }
        s.cx = nx; s.cy = ny; s.drawn++;
        if (s.u >= 1) strokes.splice(i, 1);
      }

      tips.reverse();
      for (const tp of tips) {
        ultimosTips.push({ x: tp.x, y: tp.y, a: tp.ang, auto: tp.auto === true });
        if (ultimosTips.length > 400) ultimosTips.shift();
      }
      P.bristle = R.enabled ? R.bristle : 0;
      P.noiseStretch = R.stretch;
      return tips;
    }

    function clear() { strokes = []; sinceEmit = 1e9 * 0; stillFrames = 0; }
    function reseed(v) { rnd = mulberry32((v >>> 0) || 1); }

    return {
      R, frame, onDown, onMove, onUp, clear, reseed, spawn,
      get active() { return strokes.length; },
      get emitted() { return emissions; },
      get loads() { return loads; },
      get ultimos() { return ultimosTips; }
    };
  }

  global.TrazoBrush = { createTrazo };
})(typeof window !== 'undefined' ? window : globalThis);
