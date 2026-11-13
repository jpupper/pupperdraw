/* =====================================================================
   flowfield.js — campo de flujo del cuadro + autopintado.
   Modulo compartido por el ESTUDIO (seccion FLOWFIELD) y por la pagina
   /noche/. Una sola implementacion: si cambia algo, cambia para los dos.

   El campo sale del tensor de estructura de la obra (tools/flowfield.py):
   cada celda guarda la direccion de la pincelada (tangente al trazo) y su
   coherencia. Aca solo se muestrea, se dibuja y se usan "caminantes" que
   recorren el campo sembrando pinceladas con el color del cuadro.
   ===================================================================== */
(function (global) {
  'use strict';

  function crear(opts) {
    const canvas = opts.canvas;
    const TRAZO = opts.trazo;
    const overlay = opts.overlay || null;
    const gOv = overlay ? overlay.getContext('2d') : null;
    const colorAt = opts.colorAt || null;   // null = el color lo maneja el host
    const onMsg = opts.onMsg || (() => {});

    // OJO: el motor puede cambiar el tamaño del canvas (resize del drawing buffer).
    // Si el modulo se queda con el tamaño de creacion, el aro y la zona editada se
    // desfasan respecto del puntero. Todo se recalcula con sincronizar().
    let CW = canvas.width, CH = canvas.height;
    if (overlay) { overlay.width = CW; overlay.height = CH; }

    function sincronizar() {
      if (canvas.width === CW && canvas.height === CH) return;
      CW = canvas.width; CH = canvas.height;
      if (overlay) { overlay.width = CW; overlay.height = CH; }
      if (geo.ok) setCuadro(geo.iw, geo.ih);   // recalcular el encuadre cover
      reiniciar();
    }

    // ---------- estado ----------
    const st = {
      activo: false,      // el sistema esta encendido (carga el campo)
      auto: true,         // dibujo automatico
      pincel: true,       // siembra pinceladas (si no, solo campo)
      campo: false,       // ver los vectores
      interactivo: false, // los vectores apuntan a la mano
      editar: false,      // MODIFICAR: el mouse reescribe el campo
      escala: 1.0,        // zoom del campo
      fuerza: 0.85,       // obediencia al campo
      grilla: 40,         // celdas a lo ancho (hasta 400)
      densidad: 70,       // caminantes
      velocidad: 1.0,
      radio: 420,         // radio de la mano (px de canvas)
      radioEdit: 150,     // radio con el que MODIFICAR reescribe el campo
      cobNx: 32,          // celdas a lo ancho de la grilla de cobertura
      verCob: false,      // dibujar la grilla de cobertura
      smart: false,       // SMART FLOWFIELD: el campo se sesga hacia lo que falta pintar
      smartF: 55          // fuerza de ese sesgo (0-100)
    };

    let FIELD = null, GRID = null, listo = false;
    let caminantes = [], emitidas = 0, ultimoMs = 0;

    // ---------- muestreo del campo ----------
    function angleAt(u, v) {
      const G = GRID || FIELD;
      if (!G) return { a: 0, c: 0 };
      const { cols, rows, angles, coh } = G;
      const fx = Math.min(cols - 1.001, Math.max(0, u * cols - 0.5));
      const fy = Math.min(rows - 1.001, Math.max(0, v * rows - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      let sx = 0, sy = 0, sc = 0;
      for (let j = 0; j <= 1; j++) {
        for (let i = 0; i <= 1; i++) {
          const k = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
          const id = Math.min(rows - 1, y0 + j) * cols + Math.min(cols - 1, x0 + i);
          const a = angles[id], c = coh[id];
          sx += Math.cos(2 * a) * c * k;
          sy += Math.sin(2 * a) * c * k;
          sc += c * k;
        }
      }
      return { a: 0.5 * Math.atan2(sy, sx), c: sc };
    }

    /** Re-muestrea el campo base a `n` celdas de ancho (sirve para bajar Y subir). */
    function construirGrilla(n) {
      if (!FIELD) return;
      const cols = Math.max(4, Math.min(600, Math.round(n)));   // tope tecnico, no del slider
      const rows = Math.max(3, Math.round(cols * FIELD.rows / FIELD.cols));
      const A = new Float32Array(cols * rows);
      const C = new Float32Array(cols * rows);
      const base = FIELD;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          // centro de la celda nueva en uv
          const u = (i + 0.5) / cols, v = (j + 0.5) / rows;
          const fx = Math.min(base.cols - 1.001, Math.max(0, u * base.cols - 0.5));
          const fy = Math.min(base.rows - 1.001, Math.max(0, v * base.rows - 0.5));
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const tx = fx - x0, ty = fy - y0;
          let sx = 0, sy = 0, sc = 0;
          for (let jj = 0; jj <= 1; jj++) {
            for (let ii = 0; ii <= 1; ii++) {
              const w = (ii ? tx : 1 - tx) * (jj ? ty : 1 - ty);
              const id = Math.min(base.rows - 1, y0 + jj) * base.cols + Math.min(base.cols - 1, x0 + ii);
              sx += Math.cos(2 * base.angles[id]) * base.coh[id] * w;
              sy += Math.sin(2 * base.angles[id]) * base.coh[id] * w;
              sc += base.coh[id] * w;
            }
          }
          A[j * cols + i] = 0.5 * Math.atan2(sy, sx);
          C[j * cols + i] = sc;
        }
      }
      GRID = { cols, rows, angles: A, coh: C };
    }


    // ---------- SMART FLOWFIELD ----------
    // Cuando esta activo, el campo deja de ser solo el de la obra: se le suma un sesgo que
    // empuja las pinceladas hacia las celdas de cobertura que todavia estan apagadas.
    // Se calcula un campo de DISTANCIA (BFS) desde lo que falta pintar sobre una grilla
    // gruesa y se usa su gradiente: apunta siempre a la zona virgen mas cercana.
    const SM_NX = 64, SM_NY = 36;
    const smDist = new Float32Array(SM_NX * SM_NY);
    const smGx = new Float32Array(SM_NX * SM_NY);
    const smGy = new Float32Array(SM_NX * SM_NY);
    let smHay = false, smPendiente = true;

    function rearmarSmart() { smPendiente = true; armarSmart(); }

    function armarSmart() {
      const INF = 1e6;
      smDist.fill(INF);
      let faltan = 0;
      for (let j = 0; j < COB_NY; j++) {
        for (let i = 0; i < COB_NX; i++) {
          if (cob[j * COB_NX + i]) continue;
          faltan++;
          const gi = Math.min(SM_NX - 1, ((i + 0.5) * SM_NX / COB_NX) | 0);
          const gj = Math.min(SM_NY - 1, ((j + 0.5) * SM_NY / COB_NY) | 0);
          smDist[gj * SM_NX + gi] = 0;
        }
      }
      smHay = faltan > 0;
      if (!smHay) { smGx.fill(0); smGy.fill(0); return; }

      const cola = [];
      for (let k = 0; k < smDist.length; k++) if (smDist[k] === 0) cola.push(k);
      for (let h = 0; h < cola.length; h++) {
        const k = cola[h], d = smDist[k] + 1;
        const i = k % SM_NX, j = (k / SM_NX) | 0;
        if (i > 0 && smDist[k - 1] > d) { smDist[k - 1] = d; cola.push(k - 1); }
        if (i < SM_NX - 1 && smDist[k + 1] > d) { smDist[k + 1] = d; cola.push(k + 1); }
        if (j > 0 && smDist[k - SM_NX] > d) { smDist[k - SM_NX] = d; cola.push(k - SM_NX); }
        if (j < SM_NY - 1 && smDist[k + SM_NX] > d) { smDist[k + SM_NX] = d; cola.push(k + SM_NX); }
      }
      // gradiente de descenso = hacia la distancia mas chica = hacia lo que falta pintar
      for (let j = 0; j < SM_NY; j++) {
        for (let i = 0; i < SM_NX; i++) {
          const k = j * SM_NX + i;
          const l = smDist[j * SM_NX + Math.max(0, i - 1)];
          const r = smDist[j * SM_NX + Math.min(SM_NX - 1, i + 1)];
          const up = smDist[Math.max(0, j - 1) * SM_NX + i];
          const dn = smDist[Math.min(SM_NY - 1, j + 1) * SM_NX + i];
          let gx = l - r, gy = up - dn;
          const m = Math.hypot(gx, gy);
          if (m < 1e-6) { smGx[k] = 0; smGy[k] = 0; } else { smGx[k] = gx / m; smGy[k] = gy / m; }
        }
      }
    }

    /** angulo hacia la zona sin pintar mas cercana, o null si no hace falta sesgo */
    function sesgoSmart(x, y) {
      if (!smHay) return null;
      const fx = (x / CW) * SM_NX - 0.5, fy = (y / CH) * SM_NY - 0.5;
      const x0 = Math.max(0, Math.min(SM_NX - 1, Math.floor(fx)));
      const y0 = Math.max(0, Math.min(SM_NY - 1, Math.floor(fy)));
      const x1 = Math.min(SM_NX - 1, x0 + 1), y1 = Math.min(SM_NY - 1, y0 + 1);
      const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
      const ids = [y0 * SM_NX + x0, y0 * SM_NX + x1, y1 * SM_NX + x0, y1 * SM_NX + x1];
      const ws = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
      let gx = 0, gy = 0;
      for (let n = 0; n < 4; n++) { gx += smGx[ids[n]] * ws[n]; gy += smGy[ids[n]] * ws[n]; }
      if (Math.hypot(gx, gy) < 0.08) return null;
      return Math.atan2(gy, gx);
    }

    // ---------- transformacion canvas <-> cuadro ----------
    const geo = { ok: false, ox: 0, oy: 0, k: 1, iw: 1, ih: 1 };
    function setCuadro(iw, ih) {
      const k = Math.max(CW / iw, CH / ih);
      geo.iw = iw; geo.ih = ih; geo.k = k;
      geo.ox = (CW - iw * k) / 2;
      geo.oy = (CH - ih * k) / 2;
      geo.ok = true;
    }
    function uvDe(x, y) {
      if (!geo.ok) return { u: x / CW, v: y / CH };
      return { u: (x - geo.ox) / geo.k / geo.iw, v: (y - geo.oy) / geo.k / geo.ih };
    }

    // ---------- direccion en un punto ----------
    const dedo = { x: 0, y: 0, dentro: false };

    function mezclaAngulo(a, b, w) {
      const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
      return a + d * w;
    }

    function direccion(x, y, propia, kSmart) {
      const uv = uvDe(x, y);
      const u = (uv.u - 0.5) / st.escala + 0.5;
      const v = (uv.v - 0.5) / st.escala + 0.5;
      const f = angleAt(u, v);
      const w = st.fuerza * (0.35 + 0.65 * Math.min(1, f.c * 1.6));
      let a = mezclaAngulo(propia, f.a, w);
      if (st.editar && dedo.dentro) {
        // blanco: se lee sobre cualquier color del campo y no se confunde con los vectores
        gOv.strokeStyle = 'rgba(255,255,255,0.95)';
        gOv.lineWidth = 2;
        gOv.beginPath(); gOv.arc(dedo.x, dedo.y, st.radioEdit, 0, 6.2832); gOv.stroke();
        gOv.strokeStyle = 'rgba(255,255,255,0.35)';
        gOv.lineWidth = 1;
        gOv.beginPath(); gOv.arc(dedo.x, dedo.y, st.radioEdit * 0.55, 0, 6.2832); gOv.stroke();
        // cruz en el centro exacto
        gOv.strokeStyle = 'rgba(255,255,255,0.9)';
        gOv.lineWidth = 2;
        gOv.beginPath();
        gOv.moveTo(dedo.x - 10, dedo.y); gOv.lineTo(dedo.x + 10, dedo.y);
        gOv.moveTo(dedo.x, dedo.y - 10); gOv.lineTo(dedo.x, dedo.y + 10);
        gOv.stroke();
      }
      if (st.smart && st.auto && smPendiente) { armarSmart(); smPendiente = false; }
      if (st.smart && st.auto) {
        const g = sesgoSmart(x, y);
        if (g !== null) {
          // El CAMINANTE se va hacia los huecos (fuerte); la PINCELADA apenas se inclina, así
          // sigue leyéndose el remolino de la obra mientras el recorrido cubre todo.
          const pintada = cob[celdaDe(x, y)] === 1;
          const k = kSmart === undefined ? 1 : kSmart;
          const sF = Math.max(0, Math.min(100, st.smartF)) / 100;
          a = mezclaAngulo(a, g, (pintada ? sF : sF * 0.33) * k);
        }
      }
      if (st.interactivo && dedo.dentro) {
        const dx = dedo.x - x, dy = dedo.y - y;
        const d = Math.hypot(dx, dy);
        if (d < st.radio && d > 1) {
          const k = Math.pow(1 - d / st.radio, 1.4) * 1.15;
          a = mezclaAngulo(a, Math.atan2(dy, dx), Math.min(1, k));
        }
      }
      return a;
    }

    /** Angulo del campo tal cual (sin mezclar con la direccion propia). */
    function campoPuro(x, y) {
      const uv = uvDe(x, y);
      const u = (uv.u - 0.5) / (st.escala || 1) + 0.5;
      const v = (uv.v - 0.5) / (st.escala || 1) + 0.5;
      return angleAt(u, v).a;
    }

    // ---------- caminantes con cobertura garantizada ----------
    // La grilla de cobertura marca donde YA se pinto. Al nacer, el caminante
    // arranca en una celda SIN pintar elegida al azar: asi no quedan zonas
    // vacias y el arranque siempre es random.
    // Grilla de cobertura: marca qué zonas YA se pintaron. Es redimensionable (el usuario
    // la maneja con COBERTURA): con pocas celdas una zona se da por pintada aunque solo se
    // haya tocado una esquina, y quedan huecos (una estrella sin pintar, por ejemplo).
    let cobCv = null, cobG = null, cobImg = null;
    let ultimoAfloje = 0;
    let frameCob = 0, cobUsados = 0;
    function contarCob() { let n = 0; for (let i = 0; i < cob.length; i++) if (cob[i]) n++; cobUsados = n; }
    let COB_NX = 32, COB_NY = 20;
    let cob = new Uint8Array(COB_NX * COB_NY);

    function armarCob() {
      const nx = Math.max(4, Math.min(500, Math.round(st.cobNx || 32)));
      const ny = Math.max(3, Math.round(nx * CH / CW));
      if (cob.length !== nx * ny) cob = new Uint8Array(nx * ny);
      else cob.fill(0);
      COB_NX = nx; COB_NY = ny;
      cobUsados = 0;
      smPendiente = true;
      return { nx, ny };
    }
    armarCob();

    function celdaDe(x, y) {
      const i = Math.max(0, Math.min(COB_NX - 1, Math.floor(x / CW * COB_NX)));
      const j = Math.max(0, Math.min(COB_NY - 1, Math.floor(y / CH * COB_NY)));
      return j * COB_NX + i;
    }

    function inicio() {
      const azar = () => ({ x: 30 + Math.random() * (CW - 60), y: 30 + Math.random() * (CH - 60) });
      if (Math.random() < 0.18) return azar();
      // se prueban celdas al azar hasta dar con una sin pintar (O(1) tipico, no O(n):
      // con la grilla a 500 de ancho hay ~140.000 celdas)
      for (let t = 0; t < 600; t++) {
        const c = (Math.random() * cob.length) | 0;
        if (cob[c]) continue;
        const i = c % COB_NX, j = (c / COB_NX) | 0;
        return {
          x: (i + Math.random()) * CW / COB_NX,
          y: (j + Math.random()) * CH / COB_NY
        };
      }
      return azar();
    }

    function nacer(c) {
      const p = inicio();
      c.x = Math.max(8, Math.min(CW - 8, p.x));
      c.y = Math.max(8, Math.min(CH - 8, p.y));
      c.a = direccion(c.x, c.y, campoPuro(c.x, c.y));   // arranca alineado al campo
      c.dist = 0;
      c.primer = true;                 // la primera pincelada sale en el punto de nacimiento
      c.vida = 10 + Math.random() * 32;
      cob[celdaDe(c.x, c.y)] = 1;      // la celda queda marcada: ninguna zona se saltea
      return c;
    }

    function ajustarCantidad() {
      const n = Math.max(1, Math.round(st.densidad));
      while (caminantes.length < n) caminantes.push(nacer({}));
      if (caminantes.length > n) caminantes.length = n;
    }

    function reiniciar() {
      caminantes = [];
      armarCob();          // LIMPIAR reinicia la cobertura con el tamaño actual
      cob.fill(0);
      smPendiente = true;
      emitidas = 0;
      ajustarCantidad();
    }

    // ---------- avance ----------
    function update(dt) {
      sincronizar();
      if (!listo || !st.auto || !st.pincel) return;
      let presupuesto = 8;
      const paso = 5.2 * st.velocidad * (dt || 1);
      const K = (CH || 720) / 720;
      const gap = Math.max(4, TRAZO.R.len * K * 0.55);

      for (const c of caminantes) {
        c.a = mezclaAngulo(c.a, direccion(c.x, c.y, c.a), 0.55);
        c.x += Math.cos(c.a) * paso;
        c.y += Math.sin(c.a) * paso;
        c.dist += paso;

        const gapEf = c.primer ? 0 : gap;
        if (c.dist >= gapEf && presupuesto > 0) {
          c.dist = 0;
          c.primer = false;
          presupuesto--;
          cob[celdaDe(c.x, c.y)] = 1;
          // la pincelada arranca con la direccion del VECTOR del campo en ese punto
          // (no con la direccion suavizada del caminante, que va con atraso)
          const aS = direccion(c.x, c.y, campoPuro(c.x, c.y), 0.3);
          sembrar(c.x, c.y, Math.cos(aS), Math.sin(aS));
          c.vida--;
        }
        if (c.vida <= 0 || c.x < 4 || c.y < 4 || c.x > CW - 4 || c.y > CH - 4) nacer(c);
      }
      // ----- reposicion de la cobertura -----
      // OJO: si esto se aplica todos los frames (o demasiado temprano) la cobertura NO crece
      // nunca y quedan zonas enteras sin pintar (una estrella, por ejemplo). Ahora se libera
      // recien cuando esta casi todo cubierto, y de a poco, con un enfriamiento.
      if (++frameCob >= 20) { frameCob = 0; contarCob(); if (st.smart) smPendiente = true; }   // no recorrer 140k celdas por frame
      const usados = cobUsados;
      if (usados >= cob.length * 0.95) {
        const ahora = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (ahora - ultimoAfloje > 1500) {
          ultimoAfloje = ahora;
          let n = Math.max(1, Math.round(cob.length * 0.03));   // libera 3% por vez
          let vueltas = 0;
          while (n > 0 && vueltas++ < cob.length * 4) {
            const i = (Math.random() * cob.length) | 0;
            if (cob[i]) { cob[i] = 0; n--; }
          }
          contarCob();
        }
      }
    }

    /** siembra una pincelada. El COLOR lo decide el host: si no se paso `colorAt`,
        se usa el colorFn del pincel (en el estudio = la seccion COLOR). */
    function sembrar(x, y, dx, dy) {
      if (!colorAt) {                       // host con su propio sistema de color
        TRAZO.spawn(x, y, dx, dy, 1, { auto: true });
        emitidas++;
        return;
      }
      const prev = TRAZO.R.colorFn;
      TRAZO.R.colorFn = (i, px, py) => colorAt(px, py);
      try { TRAZO.spawn(x, y, dx, dy, 1, { auto: true }); emitidas++; }
      finally { TRAZO.R.colorFn = prev; }
    }

    // ---------- EDITAR el campo a mano ----------
    // Con MODIFICAR encendido, arrastrar sobre el lienzo reescribe las celdas que
    // pasan bajo el puntero: toman la direccion del arrastre (con caida radial, asi
    // el borde se mezcla y no queda un parche duro).
    function pintarCampo(x, y, dx, dy, radioPx) {
      sincronizar();
      if (!GRID) return;
      const R = Math.max(0, radioPx === undefined ? 150 : radioPx);
      const ang = (Math.abs(dx) + Math.abs(dy) > 0.001) ? Math.atan2(dy, dx) : null;

      // OJO con la ESCALA: lo que se VE en un pixel es la celda del campo que resulta de
      // aplicar el zoom ->  u = (uv-0.5)/escala + 0.5. Si se escribe la celda "de pantalla"
      // el cambio aparece corrido cuando escala != 1. Por eso aca se recorre el campo en su
      // propia uv escalada y se mide la distancia EN PIXELES DE PANTALLA.
      const uv = uvDe(x, y);
      const cu = (uv.u - 0.5) / (st.escala || 1) + 0.5;
      const cv = (uv.v - 0.5) / (st.escala || 1) + 0.5;
      const esc = st.escala || 1;
      // pixeles de pantalla por unidad de uv (encuadre cover del cuadro)
      const kx = (geo.iw * geo.k) * esc;
      const ky = (geo.ih * geo.k) * esc;

      // ventana de celdas candidatas (con margen)
      const margenU = R / Math.max(1e-6, kx);
      const margenV = R / Math.max(1e-6, ky);
      const i0 = Math.max(0, Math.floor((cu - margenU) * GRID.cols));
      const i1 = Math.min(GRID.cols - 1, Math.ceil((cu + margenU) * GRID.cols));
      const j0 = Math.max(0, Math.floor((cv - margenV) * GRID.rows));
      const j1 = Math.min(GRID.rows - 1, Math.ceil((cv + margenV) * GRID.rows));

      if (R <= 0.001) {
        // radio 0: se edita SOLO la celda que esta bajo el puntero
        const i = Math.max(0, Math.min(GRID.cols - 1, Math.floor(cu * GRID.cols)));
        const j = Math.max(0, Math.min(GRID.rows - 1, Math.floor(cv * GRID.rows)));
        const id = j * GRID.cols + i;
        if (ang !== null) GRID.angles[id] = mezclaAngulo(GRID.angles[id], ang, 1);
        GRID.coh[id] = 1;
        return;
      }

      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const su = (i + 0.5) / GRID.cols, sv = (j + 0.5) / GRID.rows;
          const d = Math.hypot((su - cu) * kx, (sv - cv) * ky);
          if (d > R) continue;
          const w = Math.pow(1 - d / R, 1.25);
          const id = j * GRID.cols + i;
          if (ang !== null) GRID.angles[id] = mezclaAngulo(GRID.angles[id], ang, Math.min(1, w * 1.35));
          GRID.coh[id] = Math.max(GRID.coh[id], Math.min(1, w * 1.7));
        }
      }
    }

    // ---------- flowfields propios (guardar / cargar) ----------
    // viven en el SERVIDOR (COLAB.config), no en el navegador
    let MIS_CAMPOS = {};
    function leerGuardados() { return MIS_CAMPOS; }
    function listaGuardados() { return Object.keys(MIS_CAMPOS); }
    function persistirCampos() {
      if (window.COLAB && typeof window.COLAB.config === 'function') window.COLAB.config('flowfields', MIS_CAMPOS);
    }
    if (window.COLAB && typeof window.COLAB.onConfig === 'function') {
      window.COLAB.onConfig((clave, valor) => {
        if (clave === 'flowfields' && valor && typeof valor === 'object') MIS_CAMPOS = valor;
      });
    }
    function guardarCampo(nombre) {
      if (!nombre || !GRID) return false;
      MIS_CAMPOS[nombre] = {
        cols: GRID.cols, rows: GRID.rows,
        angles: Array.from(GRID.angles, v => +v.toFixed(3)),
        coh: Array.from(GRID.coh, v => +v.toFixed(2)),
        guardado: new Date().toISOString()
      };
      persistirCampos();
      return true;
    }
    function cargarGuardado(nombre) {
      const d = leerGuardados()[nombre];
      if (!d || !d.angles) return false;
      GRID = { cols: d.cols, rows: d.rows, angles: Float32Array.from(d.angles), coh: Float32Array.from(d.coh) };
      st.grilla = d.cols;
      return true;
    }
    function borrarGuardado(nombre) {
      if (!MIS_CAMPOS[nombre]) return false;
      delete MIS_CAMPOS[nombre];
      persistirCampos();
      return true;
    }
    function campoOriginal() { construirGrilla(st.grilla); }

    // ---------- dibujo del campo ----------
    function dibujar() {
      if (!gOv) return;
      sincronizar();
      gOv.clearRect(0, 0, CW, CH);

      // ---------- grilla de cobertura ----------
      if (st.verCob) {
        // 1 pixel por celda en un canvas aparte y se escala: dibujar 140.000
        // rectangulitos por frame (grilla a 500 de ancho) es imposible
        const W = COB_NX, H = COB_NY;
        if (!cobCv || cobCv.width !== W || cobCv.height !== H) {
          cobCv = document.createElement('canvas');
          cobCv.width = W; cobCv.height = H;
          cobG = cobCv.getContext('2d');
          cobImg = cobG.createImageData(W, H);
        }
        const d = cobImg.data;
        for (let k = 0; k < cob.length; k++) {
          const o = k * 4;
          if (cob[k]) { d[o] = 245; d[o + 1] = 197; d[o + 2] = 24; d[o + 3] = 120; }
          else { d[o] = 10; d[o + 1] = 12; d[o + 2] = 20; d[o + 3] = 160; }
        }
        cobG.putImageData(cobImg, 0, 0);
        gOv.imageSmoothingEnabled = false;
        gOv.drawImage(cobCv, 0, 0, CW, CH);
        if (COB_NX <= 80) {           // con grilla fina las líneas ya no se leen
          const cw = CW / COB_NX, ch = CH / COB_NY;
          gOv.strokeStyle = 'rgba(120,124,140,0.22)';
          gOv.lineWidth = 1;
          for (let i = 0; i <= COB_NX; i++) {
            gOv.beginPath(); gOv.moveTo(i * cw, 0); gOv.lineTo(i * cw, CH); gOv.stroke();
          }
          for (let j = 0; j <= COB_NY; j++) {
            gOv.beginPath(); gOv.moveTo(0, j * ch); gOv.lineTo(CW, j * ch); gOv.stroke();
          }
        }
      }

      const G = GRID;
      if (!G || !st.campo) return;
      const cw = CW / G.cols, ch = CH / G.rows;
      gOv.lineWidth = Math.max(1, Math.min(2.4, 240 / G.cols));
      gOv.lineCap = 'round';
      for (let j = 0; j < G.rows; j++) {
        for (let i = 0; i < G.cols; i++) {
          const cx = (i + 0.5) * cw, cy = (j + 0.5) * ch;
          const a = direccion(cx, cy, 0);
          const k = Math.min(1, G.coh[j * G.cols + i] * 1.8);
          const l = 0.42 * Math.min(cw, ch) * (0.45 + 0.7 * k);
          const hue = ((a * 180 / Math.PI) + 360) % 360;
          gOv.strokeStyle = 'hsla(' + hue.toFixed(0) + ',92%,63%,' + (0.14 + 0.5 * k).toFixed(2) + ')';
          gOv.beginPath();
          gOv.moveTo(cx - Math.cos(a) * l, cy - Math.sin(a) * l);
          gOv.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
          gOv.stroke();
        }
      }
      if (st.editar && dedo.dentro) {
        // blanco: se lee sobre cualquier color del campo y no se confunde con los vectores
        gOv.strokeStyle = 'rgba(255,255,255,0.95)';
        gOv.lineWidth = 2;
        gOv.beginPath(); gOv.arc(dedo.x, dedo.y, st.radioEdit, 0, 6.2832); gOv.stroke();
        gOv.strokeStyle = 'rgba(255,255,255,0.35)';
        gOv.lineWidth = 1;
        gOv.beginPath(); gOv.arc(dedo.x, dedo.y, st.radioEdit * 0.55, 0, 6.2832); gOv.stroke();
        // cruz en el centro exacto
        gOv.strokeStyle = 'rgba(255,255,255,0.9)';
        gOv.lineWidth = 2;
        gOv.beginPath();
        gOv.moveTo(dedo.x - 10, dedo.y); gOv.lineTo(dedo.x + 10, dedo.y);
        gOv.moveTo(dedo.x, dedo.y - 10); gOv.lineTo(dedo.x, dedo.y + 10);
        gOv.stroke();
      }
      if (st.smart && st.auto && smPendiente) { armarSmart(); smPendiente = false; }
      if (st.smart && st.auto) {
        const g = sesgoSmart(x, y);
        if (g !== null) {
          // El CAMINANTE se va hacia los huecos (fuerte); la PINCELADA apenas se inclina, así
          // sigue leyéndose el remolino de la obra mientras el recorrido cubre todo.
          const pintada = cob[celdaDe(x, y)] === 1;
          const k = kSmart === undefined ? 1 : kSmart;
          const sF = Math.max(0, Math.min(100, st.smartF)) / 100;
          a = mezclaAngulo(a, g, (pintada ? sF : sF * 0.33) * k);
        }
      }
      if (st.interactivo && dedo.dentro) {
        const g = gOv.createRadialGradient(dedo.x, dedo.y, 8, dedo.x, dedo.y, st.radio);
        g.addColorStop(0, 'rgba(245,197,24,0.22)');
        g.addColorStop(1, 'rgba(245,197,24,0)');
        gOv.fillStyle = g;
        gOv.beginPath(); gOv.arc(dedo.x, dedo.y, st.radio, 0, 6.2832); gOv.fill();
      }
    }

    // ---------- carga ----------
    function cargar(url) {
      if (!url) { listo = false; return Promise.resolve(false); }
      return fetch(url + (url.indexOf('?') < 0 ? '?v=' + Date.now() : ''))
        .then(r => r.json())
        .then(d => {
          FIELD = d;
          construirGrilla(st.grilla);
          listo = true;
          reiniciar();
          onMsg('Campo cargado: ' + d.cols + '×' + d.rows + ' celdas');
          return true;
        })
        .catch(e => { listo = false; onMsg('No pude cargar el campo'); return false; });
    }

    return {
      st, dedo,
      cargar, update, dibujar, reiniciar, ajustarCantidad, construirGrilla,
      pintarCampo, campoPuro, armarCob, rearmarSmart, listaGuardados, guardarCampo, cargarGuardado, borrarGuardado, campoOriginal, sincronizar,
      direccion, angleAt, uvDe, setCuadro,
      get grid() { return GRID; },
      get field() { return FIELD; },
      get listo() { return listo; },
      stats() {
        let pintadas = 0;
        for (let i = 0; i < cob.length; i++) if (cob[i]) pintadas++;
        return {
          emitidas, caminantes: caminantes.length,
          grilla: GRID ? GRID.cols + '×' + GRID.rows : '—',
          cob: { nx: COB_NX, ny: COB_NY, pintadas: pintadas, total: cob.length,
                 pct: cob.length ? Math.round(100 * pintadas / cob.length) : 0 }
        };
      }
    };
  }

  global.VGFflow = { crear };
})(typeof window !== 'undefined' ? window : globalThis);
