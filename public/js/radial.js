/* =====================================================================
   radial.js — panel rápido del pincel
   Mantené apretado un segundo sobre el lienzo (sin mover) y se abre un
   panel flotante EN ese lugar, con lo que se toca todo el tiempo mientras
   pintás: tamaño, pincel y opacidad/fuerza del trazo.
   El panel se puede ARRASTRAR desde su barra de arriba y se cierra con la ✕
   (o con Escape). No roba el trazo: al abrirse corta el gesto en curso.
   ===================================================================== */
(function () {
  'use strict';

  const lienzo = document.getElementById('lienzo');
  const panel = document.getElementById('radial');
  if (!lienzo || !panel) return;

  const $ = (id) => document.getElementById(id);
  const cab = $('radialCab');
  const cuerpo = $('radialPinceles');
  const colores = $('radialColores');
  const otroColor = $('radialColor');
  const carga = $('radialCarga');
  const UMBRAL_MS = 520;    // cuánto hay que mantener apretado
  const UMBRAL_MOV = 14;    // px de movimiento que cancelan el long press
  const CARGA_DESDE = 90;   // ms antes de mostrar la carga circular (no parpadea en un click)

  let t = null, x0 = 0, y0 = 0, abierto = false, tCarga = null;

  // ---------- colores de la paleta ----------
  function pintarColores() {
    if (!colores) return;
    const PPD = window.PPD;
    if (!PPD || typeof PPD.paleta !== 'function') return;
    const lista = PPD.paleta();
    colores.textContent = '';
    lista.forEach((hex, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'radial-color';
      b.style.background = hex;
      b.dataset.slot = i;
      b.title = hex;
      b.setAttribute('aria-label', 'color ' + hex);
      colores.appendChild(b);
    });
    marcarColor();
  }

  function marcarColor() {
    const PPD = window.PPD;
    const S = PPD && PPD.estado ? PPD.estado() : null;
    if (!S) return;
    // la bolita se marca solo si el color activo es EXACTAMENTE ese
    const base = String(S['color.base'] || '').toLowerCase();
    document.querySelectorAll('.radial-color').forEach(b => {
      b.classList.toggle('on', String(b.title || '').toLowerCase() === base && window.VGColor && VGColor.mode === 'manual');
    });
    if (otroColor) otroColor.value = S['color.base'] || '#a83090';
  }

  // ---------- pinceles: un botón por pincel disponible ----------
  function pintarPinceles() {
    if (!cuerpo || !window.VGPinceles) return;
    cuerpo.textContent = '';
    VGPinceles.PINCELES.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'radial-pincel';
      b.dataset.pincel = p.id;
      b.textContent = p.label;
      b.title = p.desc || p.label;
      cuerpo.appendChild(b);
    });
  }

  function marcarPincel() {
    const S = window.PPD && window.PPD.estado ? window.PPD.estado() : null;
    const actual = S && S.pincel;
    document.querySelectorAll('.radial-pincel').forEach(b => {
      b.classList.toggle('on', b.dataset.pincel === actual);
    });
  }

  // ---------- abrir / cerrar ----------
  function abrir(x, y) {
    if (window.TRAZO) window.TRAZO.onUp();     // cortá el trazo que estaba naciendo
    ocultarCarga();
    abierto = true;
    panel.hidden = false;
    panel.style.left = '0px';
    panel.style.top = '0px';
    const r = panel.getBoundingClientRect();
    const px = Math.max(8, Math.min(window.innerWidth - r.width - 8, x - r.width / 2));
    const py = Math.max(8, Math.min(window.innerHeight - r.height - 8, y - r.height / 2));
    mover(px, py);
    pintarColores();
    pintarPinceles();
    marcarPincel();
    if (window.PPD && window.PPD.aviso) window.PPD.aviso('panel rápido del pincel');
  }

  // ---------- carga circular del long press ----------
  function mostrarCarga(x, y) {
    if (!carga) return;
    carga.style.left = Math.round(x) + 'px';
    carga.style.top = Math.round(y) + 'px';
    carga.hidden = false;
    carga.classList.remove('on');
    void carga.offsetWidth;                    // reinicia la animación
    carga.classList.add('on');
  }
  function ocultarCarga() {
    clearTimeout(tCarga); tCarga = null;
    if (!carga) return;
    carga.hidden = true;
    carga.classList.remove('on');
  }

  function mover(x, y) {
    panel.style.left = Math.round(x) + 'px';
    panel.style.top = Math.round(y) + 'px';
  }

  function cerrar() {
    abierto = false;
    panel.hidden = true;
    if (window.PPDURL) window.PPDURL.escribir('radial', null);
  }

  // ---------- rueda del mouse (click del medio) = abrir el panel acá mismo ----------
  // y sin el autoscroll que dispara el navegador con el botón del medio
  lienzo.addEventListener('mousedown', (ev) => { if (ev.button === 1) ev.preventDefault(); });
  lienzo.addEventListener('auxclick', (ev) => { if (ev.button === 1) ev.preventDefault(); });

  // ---------- long press sobre el lienzo ----------
  lienzo.addEventListener('pointerdown', (ev) => {
    // botón del medio (rueda): abre el panel rápido en ese punto; si ya está
    // abierto, lo lleva ahí (no arranca ningún trazo)
    if (ev.button === 1) {
      ev.preventDefault();
      clearTimeout(t); t = null;
      if (abierto) mover(ev.clientX, ev.clientY);
      else abrir(ev.clientX, ev.clientY);
      return;
    }
    if (ev.button !== 0) return;
    x0 = ev.clientX; y0 = ev.clientY;
    clearTimeout(t);
    ocultarCarga();
    // a los 90 ms aparece el aro que se va llenando mientras mantenés
    tCarga = setTimeout(() => mostrarCarga(x0, y0), CARGA_DESDE);
    t = setTimeout(() => { t = null; if (!abierto) abrir(x0, y0); }, UMBRAL_MS);
  });
  lienzo.addEventListener('pointermove', (ev) => {
    if (!t) return;
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > UMBRAL_MOV) {
      clearTimeout(t); t = null;
      ocultarCarga();
    }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => {
    lienzo.addEventListener(ev, () => { clearTimeout(t); t = null; ocultarCarga(); });
  });
  window.addEventListener('blur', () => { clearTimeout(t); t = null; ocultarCarga(); });

  if ($('radialCerrar')) $('radialCerrar').addEventListener('click', cerrar);
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && abierto) cerrar();
  });

  // ---------- arrastrar el panel ----------
  let drag = null;
  if (cab) {
    cab.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top };
      cab.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    cab.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      mover(
        Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, ev.clientX - drag.dx)),
        Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, ev.clientY - drag.dy))
      );
    });
    const soltar = () => { drag = null; };
    cab.addEventListener('pointerup', soltar);
    cab.addEventListener('pointercancel', soltar);
  }

  // ---------- controles: van por la API del estudio ----------
  function aplicar(el) {
    const cmd = el.dataset.cmd;
    if (!cmd || !window.PPD || !window.PPD.set) return;
    window.PPD.set(cmd, el.value);
  }
  panel.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.dataset.cmd) aplicar(el);
    if (el.dataset.out && el.type === 'text') {
      // el cuadradito de número escribe el valor del slider
      const s = panel.querySelector('input[type="range"][data-cmd="' + el.dataset.out + '"]');
      if (s) { s.value = el.value; aplicar(s); }
    }
  });
  panel.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.cmd) aplicar(el);
    if (el.dataset.out && el.type === 'text') {
      const s = panel.querySelector('input[type="range"][data-cmd="' + el.dataset.out + '"]');
      if (s) { s.value = el.value; aplicar(s); }
    }
  });
  panel.addEventListener('click', (ev) => {
    const c = ev.target.closest('.radial-color');
    if (c && window.PPD && window.PPD.colorSlot) {
      window.PPD.colorSlot(+c.dataset.slot);
      marcarColor();
      return;
    }
    const b = ev.target.closest('[data-pincel]');
    if (b && window.PPD && window.PPD.pincel) {
      window.PPD.pincel(b.dataset.pincel);
      marcarPincel();
    }
  });

  // el cuadradito de color: cualquier color, vuelve a modo MANUAL
  if (otroColor) {
    const elegir = () => {
      if (window.PPD && window.PPD.color) { window.PPD.color(otroColor.value); marcarColor(); }
    };
    otroColor.addEventListener('input', elegir);
    otroColor.addEventListener('change', elegir);
  }

  // estado inicial: que los sliders muestren lo que está puesto
  function sincronizar() {
    const S = window.PPD && window.PPD.estado ? window.PPD.estado() : null;
    if (!S) return;
    panel.querySelectorAll('[data-cmd]').forEach(el => {
      if (S[el.dataset.cmd] !== undefined) el.value = S[el.dataset.cmd];
      const out = panel.querySelector('[data-out="' + el.dataset.cmd + '"]');
      if (out) out.value = String(S[el.dataset.cmd]);
    });
    marcarColor();
    marcarPincel();
  }

  window.VGRadial = { abrir: abrir, cerrar: cerrar, sincronizar: sincronizar, abierto: () => abierto };
  sincronizar();
  pintarColores();

  // si el link trae ?radial=1, se abre en el centro
  if (window.PPDURL && window.PPDURL.leer('radial', '0') === '1') {
    setTimeout(() => abrir(window.innerWidth / 2, window.innerHeight / 2), 800);
  }
})();
