/* ============================================================================
   PUPPERDRAW · QR EN PANTALLA + MODO PANTALLA
   ----------------------------------------------------------------------------
   El QR de la sala ya no es un modal: se prende desde el menú (sección QR) y
   queda flotando sobre el lienzo, con posición X, Y y escala.

   El botón ⛶ PANTALLA oculta TODA la interfaz y deja sólo el dibujo y el QR,
   para proyectar: la gente escanea y entra a pintar desde el celular.
   Se sale con Esc o con la ✕ que aparece al pasar el mouse por arriba a la derecha.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var qr = $('qrFlotante');
  var btnOn = $('btnQrOn');
  var btnPantalla = $('btnPantalla');
  var btnSalir = $('btnSalirPantalla');
  if (!qr) return;

  var slX = $('qrX'), slY = $('qrY'), slE = $('qrEscala');
  var numX = $('qrXNum'), numY = $('qrYNum'), numE = $('qrEscalaNum');

  var st = { on: false, x: 82, y: 18, escala: 100 };

  function linkSala() {
    var sala = (window.COLAB && window.COLAB.sala) || 'principal';
    return location.origin + location.pathname + '?sala=' + encodeURIComponent(sala);
  }

  function pintarQR() {
    if (!qr) return;
    var link = linkSala();
    qr.textContent = '';
    if (typeof qrcode === 'function') {
      try {
        var q = qrcode(0, 'M');
        q.addData(link);
        q.make();
        qr.innerHTML = q.createSvgTag({ cellSize: 6, margin: 10, scalable: true });
        var svg = qr.querySelector('svg');
        if (svg) { svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.display = 'block'; }
      } catch (e) {
        qr.textContent = link;
      }
    } else {
      qr.textContent = link;
    }
  }

  function ubicar() {
    if (!qr) return;
    var vmin = Math.min(window.innerWidth, window.innerHeight);
    var lado = Math.max(90, Math.round(vmin * 0.28 * (st.escala / 100)));
    qr.style.width = lado + 'px';
    qr.style.left = st.x + '%';
    qr.style.top = st.y + '%';
    qr.style.transform = 'translate(-50%, -50%)';
  }

  function sincronizarControles() {
    if (slX) slX.value = st.x;
    if (slY) slY.value = st.y;
    if (slE) slE.value = st.escala;
    if (numX) numX.value = st.x;
    if (numY) numY.value = st.y;
    if (numE) numE.value = st.escala;
  }

  function aplicar() {
    qr.hidden = !st.on;
    if (btnOn) {
      btnOn.classList.toggle('on', st.on);
      btnOn.setAttribute('aria-pressed', st.on ? 'true' : 'false');
    }
    if (st.on) { pintarQR(); ubicar(); }
  }

  /* ---------- controles del menú ---------- */
  if (btnOn) {
    btnOn.addEventListener('click', function (ev) {
      ev.preventDefault();
      st.on = !st.on;
      aplicar();
    });
  }

  function engancharSlider(sl, num, clave) {
    if (!sl) return;
    sl.addEventListener('input', function () {
      st[clave] = parseFloat(sl.value) || 0;
      if (num) num.value = st[clave];
      ubicar();
    });
    if (num) {
      num.addEventListener('change', function () {
        var v = parseFloat(num.value);
        if (!isFinite(v)) { num.value = st[clave]; return; }
        var min = parseFloat(sl.min), max = parseFloat(sl.max);
        v = Math.max(min, Math.min(max, v));
        st[clave] = v;
        sl.value = v;
        num.value = v;
        ubicar();
      });
    }
  }
  engancharSlider(slX, numX, 'x');
  engancharSlider(slY, numY, 'y');
  engancharSlider(slE, numE, 'escala');

  /* ---------- modo pantalla ---------- */
  function estaPantalla() { return document.body.classList.contains('modo-pantalla'); }

  function entrarPantalla() {
    document.body.classList.add('modo-pantalla');
    if (btnSalir) btnSalir.hidden = false;
    // si el QR estaba apagado, se prende: es la gracia del modo
    if (!st.on) { st.on = true; sincronizarControles(); aplicar(); }
    ubicar();
    if (btnPantalla) btnPantalla.setAttribute('aria-pressed', 'true');
    // pantalla completa real cuando el navegador lo permite
    var el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen().catch(function () { });
      }
    } catch (e) { }
  }

  function salirPantalla() {
    document.body.classList.remove('modo-pantalla');
    if (btnSalir) btnSalir.hidden = true;
    if (btnPantalla) btnPantalla.setAttribute('aria-pressed', 'false');
    try {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () { });
    } catch (e) { }
  }

  if (btnPantalla) {
    btnPantalla.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (estaPantalla()) salirPantalla(); else entrarPantalla();
    });
  }
  if (btnSalir) btnSalir.addEventListener('click', salirPantalla);

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && estaPantalla()) salirPantalla();
  });

  // si el navegador sale de fullscreen (F11, Esc del sistema), se restaura la UI
  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && estaPantalla()) {
      document.body.classList.remove('modo-pantalla');
      if (btnSalir) btnSalir.hidden = true;
      if (btnPantalla) btnPantalla.setAttribute('aria-pressed', 'false');
    }
  });

  window.addEventListener('resize', function () { if (st.on) ubicar(); });

  /* ---------- API para otras partes / pruebas ---------- */
  window.PPDQR = {
    estado: function () { return { on: st.on, x: st.x, y: st.y, escala: st.escala, pantalla: estaPantalla(), lado: qr.style.width }; },
    prender: function (v) { st.on = (v === undefined) ? !st.on : !!v; aplicar(); return st.on; },
    poner: function (p) {
      if (!p) return st;
      if (p.x !== undefined) st.x = p.x;
      if (p.y !== undefined) st.y = p.y;
      if (p.escala !== undefined) st.escala = p.escala;
      sincronizarControles(); ubicar();
      return st;
    },
    pantalla: function (v) { if (v === false) salirPantalla(); else entrarPantalla(); }
  };

  sincronizarControles();
  aplicar();
})();
