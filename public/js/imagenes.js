/* =====================================================================
   imagenes.js — el banco de cuadros del estudio.
   Una sola fuente para las tres cosas que usan imagen:
     · modo de color IMAGE  -> color() toma el color del pixel
     · MATERIAL IMAGE       -> textura de materia de la pintura
     · REFRACTION IMAGE     -> imagen que la pintura refracta
   Los cinco cuadros vienen de VGCUADROS (cuadros.js, generado). Además se
   puede SU subir una imagen propia: queda en memoria (no se persiste, es
   un dataURL grande) y se usa igual que las otras.

   El muestreo replica exactamente el encuadre del CSS `background-size:
   cover`: la imagen cubre el lienzo centrada y recorta lo que sobra. Así
   el color que toma la pincelada es el del pixel que se ve detrás.
   ===================================================================== */
(function (global) {
  'use strict';

  const cache = new Map();      // id -> { img, w, h, src }
  const subidos = [];           // imagenes que sube el usuario
  let muestra = null;           // { id, w, h, data } pixeles ya encuadrados
  let lienzoMuestra = null;

  function lista() {
    const base = (global.VGCUADROS && VGCUADROS.CUADROS) ? VGCUADROS.CUADROS : [];
    return base.concat(subidos);
  }
  function byId(id) {
    return lista().find(c => c.id === id) || null;
  }

  /* carga (y cachea) una imagen del banco */
  function cargar(id) {
    const c = byId(id);
    if (!c) return Promise.reject(new Error('cuadro desconocido: ' + id));
    const hit = cache.get(id);
    if (hit) return Promise.resolve(hit);
    return new Promise((res, rej) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const o = { img: img, w: img.naturalWidth, h: img.naturalHeight, src: c.src };
        cache.set(id, o);
        res(o);
      };
      img.onerror = () => rej(new Error('no se pudo cargar ' + c.src));
      img.src = c.src;
    });
  }

  /* sube una imagen del disco del usuario */
  function subir(file) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('no es una imagen'));
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const nombre = (file.name || 'imagen').replace(/\.[a-z0-9]+$/i, '');
          const id = 'subido-' + (subidos.length + 1);
          const reg = {
            id: id,
            label: nombre.toUpperCase().slice(0, 24),
            obra: 'imagen subida',
            src: fr.result,
            w: img.naturalWidth,
            h: img.naturalHeight,
            subido: true
          };
          cache.set(id, { img: img, w: reg.w, h: reg.h, src: reg.src });
          subidos.push(reg);
          res(reg);
        };
        img.onerror = () => rej(new Error('la imagen no se pudo leer'));
        img.src = fr.result;
      };
      fr.onerror = () => rej(new Error('no se pudo leer el archivo'));
      fr.readAsDataURL(file);
    });
  }

  /* encuadra la imagen al tamaño del lienzo (cover) y guarda los pixeles */
  function preparar(id, cw, ch) {
    return cargar(id).then(o => {
      if (muestra && muestra.id === id && muestra.w === cw && muestra.h === ch) return muestra;
      if (!lienzoMuestra) lienzoMuestra = document.createElement('canvas');
      lienzoMuestra.width = cw; lienzoMuestra.height = ch;
      const ctx = lienzoMuestra.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cw, ch);
      const k = Math.max(cw / o.w, ch / o.h);
      const dw = o.w * k, dh = o.h * k;
      ctx.drawImage(o.img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      muestra = { id: id, w: cw, h: ch, data: ctx.getImageData(0, 0, cw, ch).data };
      return muestra;
    });
  }

  function hayMuestra(id) {
    return !!(muestra && muestra.id === id);
  }

  /* color del pixel (x,y en px del lienzo). radio = promedio en px (0 = exacto) */
  function color(x, y, radio) {
    if (!muestra) return null;
    const w = muestra.w, h = muestra.h, d = muestra.data;
    const px0 = Math.max(0, Math.min(w - 1, Math.round(x)));
    const py0 = Math.max(0, Math.min(h - 1, Math.round(y)));
    const r = Math.max(0, Math.min(30, Math.round(radio || 0)));
    if (r < 1) {
      const i = (py0 * w + px0) * 4;
      return [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
    }
    const paso = Math.max(1, r >> 2);
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let yy = -r; yy <= r; yy += paso) {
      const py = Math.max(0, Math.min(h - 1, py0 + yy));
      for (let xx = -r; xx <= r; xx += paso) {
        const px = Math.max(0, Math.min(w - 1, px0 + xx));
        const i = (py * w + px) * 4;
        sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++;
      }
    }
    return [sr / n / 255, sg / n / 255, sb / n / 255];
  }

  /* url para el fondo del lienzo (ver la imagen mientras se pinta) */
  function urlFondo(id) {
    const c = byId(id);
    return c ? c.src : null;
  }

  global.VGImagenes = { lista, byId, cargar, subir, preparar, color, urlFondo, hayMuestra };
})(typeof window !== 'undefined' ? window : globalThis);
