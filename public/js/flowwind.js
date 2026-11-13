/* =====================================================================
   flowwind.js — Simulador de corrientes de aire turbulentas (Kolmogorov K41 +
   intermitencia log-normal K62 / Castaing) basado en Aragón et al. (2006)
   "Turbulent luminance in impassioned van Gogh paintings" (arXiv:0606246v2).

   Modelo matemático implementado:
   - Rango inercial entre la escala de inyección L (remolino mayor, ~2000px en
     La Noche Estrellada) y la escala de disipación viscosa η.
   - Cascada de N octavas R_m = L * 2^-m (mientras R_m >= η), con función de
     corriente ψ_m(x,y,t) libre de divergencia (∇·v = 0 → remolinos reales).
   - Ley de similitud K41: S_2(R) ∝ (ε R)^(2/3) → velocidad v_m ∝ (ε R_m)^(1/3)
     y frecuencia de volteo de remolino ω_m ∝ ε^(1/3) R_m^(-2/3).
   - Intermitencia K62 / Castaing (1990): λ²(R) = λ_0² * max(0, ln(L / R)),
     modulando la energía local de forma log-normal:
       ε_loc = exp(λ(R_m) * G_m(x,y,t) - 0.5 * λ(R_m)²)
     produciendo ráfagas intermitentes de colas pesadas como en la Fig. 2 del PDF.
   ===================================================================== */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // Ángulos fijos irracionales por octava para evitar alineación de grilla
  const ANG_A = [0.41, 1.37, 2.29, 0.88, 1.93, 2.71];
  const ANG_B = [1.82, 2.64, 0.53, 2.15, 0.97, 1.49];

  function create(opts) {
    opts = opts || {};
    const canvas = opts.canvas;
    const overlay = opts.overlay || null;
    const octx = overlay ? overlay.getContext('2d') : null;

    const st = {
      activo: false,
      ver: false,
      fuerza: 0.65,     // acoplamiento a las pinceladas (0..1)
      epsilon: 0.45,    // tasa media de disipación ε (0.05..1.0)
      escalaL: 0.70,    // escala mayor L como fracción del alto del lienzo (0.20..1.20)
      eta: 18,          // escala de disipación viscosa η en px (6..80)
      octavas: 4,       // número de escalas en la cascada (1..6)
      lambda: 0.20,     // parámetro de intermitencia de Castaing λ_0 (0..0.50; 0.20 en Noche Estrellada)
      viento: 0.20,     // deriva/viento base (0..1)
      angulo: 15,       // dirección del viento base en grados (0..360)
      velocidad: 0.60   // velocidad de evolución temporal (0..2)
    };

    let t = 0;

    function update(dt) {
      if (!st.activo && !st.ver) return;
      t += (dt || 1) * 0.016 * st.velocidad;
    }

    /**
     * Evalúa el campo de velocidad turbulenta v(x, y, t) en px/frame.
     * Devuelve { vx, vy, strength } donde vx, vy ya incluyen st.fuerza.
     */
    function sample(x, y) {
      const H = (canvas && canvas.height) || 1080;
      const L = Math.max(40, st.escalaL * H);
      const eta = Math.max(4, st.eta * (H / 720));
      const eps = Math.max(0.01, st.epsilon);
      const epsCbrt = Math.cbrt(eps);
      const nOct = Math.max(1, Math.min(6, Math.round(st.octavas)));
      const lam0 = Math.max(0, st.lambda);

      let uSum = 0;
      let vSum = 0;
      let normSum = 0;

      for (let m = 0; m < nOct; m++) {
        const Rm = L * Math.pow(0.5, m);
        if (Rm < eta) break;

        const k = TAU / Rm;
        // K41: amplitud v_m ~ (ε * R_m)^(1/3), normalizada respecto a L
        const ampK41 = epsCbrt * Math.cbrt(Rm / L);
        // Frecuencia de volteo del remolino ω_m ~ ε^(1/3) R_m^(-2/3)
        const omega = 1.4 * epsCbrt * Math.pow(L / Rm, 2 / 3);
        const phase = t * omega;

        const a1 = ANG_A[m];
        const a2 = ANG_B[m];
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        const c2 = Math.cos(a2), s2 = Math.sin(a2);

        // Modo 1 (función de corriente ψ = sin(p1)*cos(q1) -> curl analítico)
        const p1 = k * (x * c1 + y * s1) + phase * 0.73 + m * 1.7;
        const q1 = k * (-x * s1 + y * c1) - phase * 0.51 + m * 2.3;
        const sp1 = Math.sin(p1), cp1 = Math.cos(p1);
        const sq1 = Math.sin(q1), cq1 = Math.cos(q1);
        // ∂ψ/∂x = k*(c1*cp1*cq1 + s1*sp1*sq1)
        // ∂ψ/∂y = k*(s1*cp1*cq1 - c1*sp1*sq1)
        const dpsi1_dx = c1 * cp1 * cq1 + s1 * sp1 * sq1;
        const dpsi1_dy = s1 * cp1 * cq1 - c1 * sp1 * sq1;

        // Modo 2 (rotado para romper simetrías)
        const p2 = k * (x * c2 + y * s2) - phase * 0.61 + m * 3.1;
        const q2 = k * (-x * s2 + y * c2) + phase * 0.87 + m * 0.9;
        const sp2 = Math.sin(p2), cp2 = Math.cos(p2);
        const sq2 = Math.sin(q2), cq2 = Math.cos(q2);
        const dpsi2_dx = c2 * cp2 * cq2 + s2 * sp2 * sq2;
        const dpsi2_dy = s2 * cp2 * cq2 - c2 * sp2 * sq2;

        // Curl 2D: u = -∂ψ/∂y, v = ∂ψ/∂x
        let ux = -0.5 * (dpsi1_dy + dpsi2_dy);
        let uy = 0.5 * (dpsi1_dx + dpsi2_dx);

        // K62 / Castaing (1990): λ²(R) = λ_0² * max(0, ln(L/R))
        let intermittency = 1.0;
        if (lam0 > 0.001) {
          const lnLR = Math.log(Math.max(1.0, L / Rm));
          const lamR = lam0 * Math.sqrt(Math.max(0.15, lnLR));
          // Campo gaussiano aproximado G_m(x,y,t) con varianza ~1
          const G = 0.7071 * (sp1 * cq2 + cp2 * sq1) * 1.4142;
          intermittency = Math.exp(clamp(lamR * G - 0.5 * lamR * lamR, -1.5, 1.5));
        }

        const w = ampK41 * intermittency;
        uSum += ux * w;
        vSum += uy * w;
        normSum += ampK41;
      }

      if (normSum > 0) {
        uSum /= normSum;
        vSum /= normSum;
      }

      // Viento base (deriva)
      const rad = (st.angulo * Math.PI) / 180;
      const baseVx = Math.cos(rad) * st.viento;
      const baseVy = Math.sin(rad) * st.viento;

      // Escala física a px/frame del pincel
      const pxScale = (3.4 * (H / 720)) * st.fuerza * (0.45 + 0.85 * eps);
      return {
        vx: (uSum + baseVx) * pxScale,
        vy: (vSum + baseVy) * pxScale,
        strength: st.fuerza
      };
    }

    /**
     * Dibuja las líneas/vectores de corriente de aire sobre el canvas overlay.
     * @param {boolean} additive - Si true, no limpia el overlay antes (convive con FLOWFIELD).
     */
    function dibujar(additive) {
      if (!octx || !overlay || !st.ver) return;
      const W = overlay.width, H = overlay.height;
      if (!additive) octx.clearRect(0, 0, W, H);

      const step = Math.max(36, Math.round(Math.min(W, H) / 22));
      octx.save();
      octx.lineWidth = 1.6;
      for (let y = step * 0.5; y < H; y += step) {
        for (let x = step * 0.5; x < W; x += step) {
          const w = sample(x, y);
          const mag = Math.hypot(w.vx, w.vy);
          if (mag < 0.02) continue;
          const len = Math.min(step * 0.85, 6 + mag * 7.5);
          const nx = w.vx / mag, ny = w.vy / mag;
          const x2 = x + nx * len, y2 = y + ny * len;
          const intensity = clamp(mag / 3.5, 0.2, 1.0);
          octx.strokeStyle = `rgba(92, 214, 255, ${(0.35 + 0.55 * intensity).toFixed(2)})`;
          octx.beginPath();
          octx.moveTo(x, y);
          octx.lineTo(x2, y2);
          // punta de flecha
          const ah = 4.5;
          octx.lineTo(x2 - nx * ah - ny * ah * 0.55, y2 - ny * ah + nx * ah * 0.55);
          octx.moveTo(x2, y2);
          octx.lineTo(x2 - nx * ah + ny * ah * 0.55, y2 - ny * ah - nx * ah * 0.55);
          octx.stroke();
        }
      }
      octx.restore();
    }

    return { st, update, sample, dibujar };
  }

  global.VGFlowWind = { create };
})(typeof window !== 'undefined' ? window : globalThis);

