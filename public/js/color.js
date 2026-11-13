/* =====================================================================
   color.js — modos de color del pincel.
   MANUAL      : 3 casilleros de color (SLOT 1/2/3, como el Vervette
                 original). El activo es el que pinta; `base` apunta a el.
   RANDOM HUE  : el tono gira con el tiempo (comportamiento original).
   LERPTOWHITE : cada carga de pincel toma el color base y lo interpola a
                 blanco y a negro con ruido, tal como en el shader:
                   c = mix(vec3(1.0), base, noise(idx));
                   c = mix(vec3(0.0), c,    noise(idx + 15343512));
                 `lerpSpeed` corre el indice de ruido: 1 = cambia en cada
                 carga; N = el color tarda N cargas en recorrer el mismo
                 tramo (el lerp va mas lento sin cortarse).
   PALETTE     : pinta SOLO con los colores de una paleta sacada de un
                 cuadro de Van Gogh (VGPALETAS). `palCycle` = cuantos
                 colores de la paleta avanza por carga, `palVar` = cuanto
                 varia el valor de cada pincelada (para que no quede plana).
   IMAGE       : el color de cada carga es el PIXEL del cuadro en el lugar
                 donde cae la pincelada (VGImagenes): pintando se va
                 descubriendo la imagen, sin verla de fondo.
   ===================================================================== */
(function (global) {
  'use strict';

  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const mix = (a, b, t) => a + (b - a) * t;

  // hash 1D -> [0,1)
  function h1(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  // value noise 1D con smoothstep (equivalente al noise() del shader)
  function noise(x) {
    const i = Math.floor(x), f = x - i;
    const u = f * f * (3 - 2 * f);
    return mix(h1(i), h1(i + 1), u);
  }

  function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r, g, b];
  }

  // Paleta por defecto: los colores del afiche de la Fiesta de la Animación
  // (violeta del título, rosa del borde, naranjas, rojo, verde de la enredadera,
  // rosa claro y el crema del papel). Se pueden agregar/cambiar con el "+" y el picker.
  const SLOTS_DEFECTO = [
    '#a83090', '#fc609c', '#fc9c3c', '#fcc000',
    '#d83c24', '#0c8454', '#fc9ca8', '#fce490'
  ];

  const VGColor = {
    mode: 'manual',           // manual | hue | lerpwhite | palette | image
    slots: [[0.85, 0.25, 0.12], [0.91, 0.70, 0.10], [0.14, 0.23, 0.42]],
    slotActivo: 0,
    base: [0.85, 0.25, 0.12], // = slots[slotActivo] (lo mantienen setActivo/setSlot)
    hue: 0.05,
    hueSpeed: 0.35,           // vueltas por minuto (aprox)
    noiseFreq: 0.42,          // frecuencia del ruido por carga de pincel
    lerpSpeed: 1,             // cada cuantas cargas avanza el lerp (1 = por carga)
    paleta: 'noche',
    palColors: [[0.85, 0.25, 0.12]],
    palCycle: 0.32,           // colores de paleta por carga
    palVar: 0.18,             // variacion de valor por pincelada (±)
    imagen: 'noche',          // cuadro del modo IMAGE
    imgRadio: 0,              // promedio del muestreo en px (0 = pixel exacto)
    _acc: 0,

    /* ---------- casilleros de color (MANUAL) ---------- */
    toRgb(c) { return typeof c === 'string' ? this.fromHex(c) : c; },
    setSlots(arr) {
      // la paleta puede crecer con el "+" del panel (hasta 12 casilleros)
      const a = (arr || []).map(c => this.toRgb(c)).filter(Boolean).slice(0, 12);
      if (!a.length) return;
      this.slots = a.map(c => [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])]);
      if (this.slotActivo >= this.slots.length) this.slotActivo = 0;
      this.base = this.slots[this.slotActivo];
      return this.slots;
    },
    setSlot(i, c) {
      const rgb = this.toRgb(c);
      if (!rgb || !this.slots[i]) return;
      this.slots[i] = [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];
      if (i === this.slotActivo) this.base = this.slots[i];
    },
    setActivo(i) {
      if (!this.slots[i]) return;
      this.slotActivo = i;
      this.base = this.slots[i];
    },
    slotsHex() { return this.slots.map(c => this.hexOf(c)); },

    /* ---------- color ---------- */
    setBase(rgb) { this.setSlot(this.slotActivo, rgb); },

    /* carga una paleta: hex o arrays rgb 0..1 */
    setPaleta(cols) {
      const arr = (cols || []).map(c => this.toRgb(c)).filter(Boolean);
      if (arr.length) this.palColors = arr.map(c => [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])]);
      return this.palColors;
    },

    /* true si el modo pinta un color distinto por carga de pincel */
    usesPerLoad() {
      return this.mode === 'lerpwhite' || this.mode === 'palette' || this.mode === 'image';
    },

    /* color de UNA carga de pincel (idx = carga; x,y = px del lienzo) */
    colorForLoad(idx, x, y) {
      const b = this.base;
      if (this.mode === 'lerpwhite') {
        const sp = this.lerpSpeed > 0 ? this.lerpSpeed : 1;
        const t = (idx / sp) * this.noiseFreq;   // sp > 1 => el lerp va mas lento
        const n1 = noise(t);
        const n2 = noise(t + 15343512);
        const c = [mix(1, b[0], n1), mix(1, b[1], n1), mix(1, b[2], n1)];
        return [mix(0, c[0], n2), mix(0, c[1], n2), mix(0, c[2], n2)];
      }
      if (this.mode === 'palette') {
        const cols = this.palColors;
        const n = cols.length;
        if (!n) return b.slice();
        // avance por la paleta + desvio de ±1 color: cicla sin ser mecanico
        const desvio = Math.round((h1(idx * 3.77 + 11.3) * 2 - 1) * 1.4);
        let i = (Math.floor(idx * this.palCycle) + desvio) % n;
        if (i < 0) i += n;
        let c = cols[i].slice();
        if (this.palVar > 0) {
          const k = 1 + (h1(idx * 7.31 + 2.17) * 2 - 1) * this.palVar * 0.5;
          c = [clamp01(c[0] * k), clamp01(c[1] * k), clamp01(c[2] * k)];
        }
        return c;
      }
      if (this.mode === 'image') {
        // el color sale del pixel del cuadro en la posicion de la pincelada
        if (global.VGImagenes && typeof x === 'number' && typeof y === 'number') {
          const c = VGImagenes.color(x, y, this.imgRadio);
          if (c) return c;
        }
        return b.slice();
      }
      if (this.mode === 'hue') return hslToRgb(this.hue, 0.85, 0.55);
      return b.slice();
    },

    /* avance temporal del modo hue (llamado por frame) */
    tick(dt) {
      if (this.mode !== 'hue') return null;
      this._acc += dt;
      if (this._acc > 0.05) {
        this.hue = (this.hue + 0.0009 * this.hueSpeed * this._acc * 60) % 1;
        this._acc = 0;
      }
      return hslToRgb(this.hue, 0.85, 0.55);
    },

    rgbCss(c) {
      const t = v => Math.round(clamp01(v) * 255);
      return 'rgb(' + t(c[0]) + ',' + t(c[1]) + ',' + t(c[2]) + ')';
    },
    hexOf(c) {
      const t = v => ('0' + Math.round(clamp01(v) * 255).toString(16)).slice(-2);
      return '#' + t(c[0]) + t(c[1]) + t(c[2]);
    },
    fromHex(hex) {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
      if (!m) return null;
      const n = parseInt(m[1], 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    },
    noise
  };

  VGColor.SLOTS_DEFECTO = SLOTS_DEFECTO;
  VGColor.setSlots(SLOTS_DEFECTO);

  global.VGColor = VGColor;
})(typeof window !== 'undefined' ? window : globalThis);
