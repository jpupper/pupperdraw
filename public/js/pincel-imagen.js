/* ============================================================================
   PUPPERDRAW · PINCEL CON IMAGEN
   ----------------------------------------------------------------------------
   Subís una imagen (se recorta a 200x200 en el navegador), queda en la lista y
   se usa como sello del pincel. La imagen se guarda en el servidor, así que
   TODOS los clientes la bajan y la pincelada se ve igual en todas las pantallas:
   el id de la imagen viaja dentro del estilo de cada pincelada (e.im).
   ========================================================================== */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const LADO = 200;
  const API = (window.CONFIG && CONFIG.API_URL) || (location.origin + '/pupperdraw');

  const cajaLista = $('listaPinceles');
  const estadoTxt = $('imgPincelEstado');
  const input = $('inputImagenPincel');
  const btn = $('btnSubirImagen');
  if (!cajaLista || !input) return;

  let lista = [];
  let sel = null;

  function aviso(t) {
    if (estadoTxt) estadoTxt.textContent = t;
    if (window.PPD && PPD.aviso) PPD.aviso(t);
  }

  function cargarImagen(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('no carga'));
      img.src = url;
    });
  }

  async function registrar(p) {
    if (!p || !p.id) return false;
    if (!window.ENGINE || !ENGINE.setImagenPincel) return false;
    if (ENGINE.tieneImagenPincel && ENGINE.tieneImagenPincel(p.id)) return true;
    try {
      const img = await cargarImagen(API + '/api/pincel/img/' + p.id + '.png');
      ENGINE.setImagenPincel(p.id, img);
      return true;
    } catch (e) { return false; }
  }

  function pintarLista() {
    cajaLista.textContent = '';
    lista.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'muestra img-pincel' + (sel === p.id ? ' on' : '');
      b.title = (p.nombre || 'imagen') + ' — tocá para pintar con esta imagen';
      b.setAttribute('aria-pressed', sel === p.id ? 'true' : 'false');

      const im = document.createElement('img');
      im.alt = p.nombre || 'pincel';
      im.src = API + '/api/pincel/img/' + p.id + '.png';
      im.loading = 'lazy';
      b.appendChild(im);

      b.addEventListener('click', () => elegir(sel === p.id ? null : p.id, p.nombre));
      cajaLista.appendChild(b);
    });
    if (!lista.length) {
      const v = document.createElement('span');
      v.className = 'img-pincel-vacio';
      v.textContent = 'todavía no subiste ninguna';
      cajaLista.appendChild(v);
    }
  }

  function elegir(id, nombre) {
    sel = id || null;
    if (window.PPD && PPD.imagenPincel) PPD.imagenPincel(sel);
    pintarLista();
    if (!sel) { aviso('pincel normal'); return; }
    const p = lista.find(x => x.id === sel);
    aviso('pincel: ' + ((p && p.nombre) || nombre || sel));
  }

  async function traerLista() {
    try {
      const r = await fetch(API + '/api/pinceles', { cache: 'no-store' });
      const d = await r.json();
      lista = (d && d.pinceles) || [];
    } catch (e) { lista = []; }
    pintarLista();
    // precarga: las pinceladas remotas necesitan la textura antes de llegar
    for (const p of lista) registrar(p);
  }

  function leerArchivo(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error('no es una imagen'));
        img.src = fr.result;
      };
      fr.onerror = () => rej(new Error('no pude leer el archivo'));
      fr.readAsDataURL(file);
    });
  }

  // recorte central cuadrado a 200x200 (lo que viaja y se guarda)
  function recortar200(img) {
    const c = document.createElement('canvas');
    c.width = LADO; c.height = LADO;
    const g = c.getContext('2d');
    const lado = Math.min(img.width || img.naturalWidth, img.height || img.naturalHeight);
    const sx = ((img.width || img.naturalWidth) - lado) / 2;
    const sy = ((img.height || img.naturalHeight) - lado) / 2;
    g.drawImage(img, sx, sy, lado, lado, 0, 0, LADO, LADO);
    return c.toDataURL('image/png');
  }

  async function subir(file) {
    if (!file) return;
    aviso('preparando la imagen…');
    let png;
    try {
      const img = await leerArchivo(file);
      png = recortar200(img);
    } catch (e) { aviso('no pude leer esa imagen'); return; }

    try {
      const r = await fetch(API + '/api/pinceles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: (file.name || 'imagen').slice(0, 40), png: png })
      });
      const d = await r.json();
      if (!d || !d.ok) { aviso('no pude subir la imagen' + (d && d.error ? ': ' + d.error : '')); return; }
      await registrar(d.pincel);
      lista.unshift(d.pincel);
      pintarLista();
      elegir(d.pincel.id, d.pincel.nombre);
    } catch (e) {
      aviso('no pude subir la imagen (sin conexión con el servidor)');
    }
  }

  if (btn && input) btn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    subir(input.files && input.files[0]);
    input.value = '';   // poder volver a elegir el mismo archivo
  });

  // API para la colaboración: asegura la textura de una imagen remota
  window.PPDImagenPincel = function (id) {
    if (!id) return;
    if (window.ENGINE && ENGINE.tieneImagenPincel && ENGINE.tieneImagenPincel(id)) return;
    registrar({ id: String(id) });
  };

  window.PPDPinceles = {
    lista: () => lista.slice(),
    elegido: () => sel,
    recargar: traerLista,
    elegir: elegir
  };

  traerLista();
})();
