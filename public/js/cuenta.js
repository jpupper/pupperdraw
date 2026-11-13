/* =====================================================================
   cuenta.js — CUENTA del ecosistema FSC + PERFIL + QR de la sala
   · Login unificado (JPCONNECT): el botón lleva al login del ecosistema y
     vuelve con ?token=. Sin sesión dice LOGIN y nada más (no inventa
     identidad, no redirige solo).
   · Perfil: tus DIBUJOS (snapshots del lienzo) y tus IMÁGENES (las que
     subís), guardados en el backend de PUPPERDRAW con tu sesión.
   · QR: el link de la sala en un código para escanear desde el celular.
   ===================================================================== */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const cfg = window.CONFIG || {};
  // API (VPS, incluye /api) y portal humano (login.html) NO son la misma URL
  const API = (cfg.JPCONNECT_API || 'https://vps-4455523-x.dattaweb.com/jpconnect/api');
  const PORTAL = (cfg.JPCONNECT_URL || 'https://fullscreencode.com/jpconnect');
  const APP = '/pupperdraw';
  const CLAVES = ['token', 'username', 'userId', 'role'];
  const PROPIAS = ['pupperdraw_token', 'pupperdraw_user'];

  const S = { user: null, token: null, dibujos: [], imagenes: [], pestana: 'dibujos' };

  const ui = {
    boton: $('btnCuenta'),
    perfil: $('perfil'),
    cerrar: $('perfilCerrar'),
    quien: $('perfilQuien'),
    avatar: $('perfilAvatar'),
    nombre: $('perfilNombre'),
    mail: $('perfilMail'),
    salir: $('perfilSalir'),
    grilla: $('perfilGrilla'),
    msg: $('perfilMsg'),
    guardar: $('perfilGuardarDibujo'),
    subir: $('perfilSubirImagen'),
    file: $('perfilFile'),
    tabs: document.querySelectorAll('[data-perfil-tab]'),
    qr: $('qrPanel'),
    qrImg: $('qrImg'),
    qrLink: $('qrLink'),
    qrCerrar: $('qrCerrar'),
    botQR: $('btnQR')
  };

  // ------------------------------------------------------------
  // sesión
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // sesión — en COOKIE, no en localStorage (la configuración y la
  // identidad se guardan del lado del navegador solo como cookie)
  // ------------------------------------------------------------
  const DIAS = 60 * 60 * 24 * 30;
  function leerCookie(k) {
    try {
      const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + k + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function ponerCookie(k, v) {
    try { document.cookie = k + '=' + encodeURIComponent(v) + '; path=/; max-age=' + DIAS + '; SameSite=Lax'; } catch (e) {}
  }
  function borrarCookie(k) {
    try { document.cookie = k + '=; path=/; max-age=0; SameSite=Lax'; } catch (e) {}
  }
  function leerToken() {
    // la propia (cookie) o la del login central del ecosistema (jpconnect), que es
    // la sesión compartida de las demás apps — solo se LEE, nunca se escribe acá
    return leerCookie('pupperdraw_token') || leerCookie('token') || (function () {
      try { return localStorage.getItem('token') || null; } catch (e) { return null; }
    })();
  }
  function guardarSesion(tok, username, userId) {
    ponerCookie('pupperdraw_token', tok);
    if (username) ponerCookie('pupperdraw_user', username);
    if (userId) ponerCookie('pupperdraw_id', userId);
  }
  function limpiarSesion() {
    borrarCookie('pupperdraw_token');
    borrarCookie('pupperdraw_user');
    borrarCookie('pupperdraw_id');
    S.user = null; S.token = null; S.dibujos = []; S.imagenes = [];
  }

  // el login vuelve con ?token=&username=&userId= : se guarda y se limpia la URL
  (function capturarRetorno() {
    const q = new URLSearchParams(location.search);
    const tok = q.get('token');
    if (!tok) return;
    guardarSesion(tok, q.get('username'), q.get('userId'));
    ['token', 'username', 'userId'].forEach(k => q.delete(k));
    const s = q.toString();
    try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '')); } catch (e) {}
  })();

  const haySesion = () => !!leerToken();

  function api(ruta, opciones) {
    opciones = opciones || {};
    const tok = leerToken();
    opciones.headers = Object.assign({}, opciones.headers || {}, tok ? { Authorization: 'Bearer ' + tok } : {});
    return fetch(API_API() + ruta, opciones).then(r => {
      if (r.status === 401) { limpiarSesion(); pintarBoton(); throw new Error('sesión vencida'); }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  // el API de identidad vive en JPCONNECT; los dibujos en el server de pupperdraw
  function API_API() { return API; }
  function API_APP() { return (cfg.API_URL || (APP)) + '/api'; }

  function entrar() {
    const volver = location.href.replace(/([?&])(token|username|userId)=[^&]*/g, '$1').replace(/[?&]$/, '');
    location.href = PORTAL + '/login.html?redirect=' + encodeURIComponent(volver) + '&origin=pupperdraw';
  }

  function salir() {
    const tok = leerToken();
    if (tok) {
      // el logout del centralizador revoca el token: se avisa ANTES de borrarlo
      try {
        fetch(API + '/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, keepalive: true });
      } catch (e) {}
    }
    limpiarSesion();
    pintarBoton();
    cerrarPerfil();
    if (window.PPD && window.PPD.aviso) window.PPD.aviso('sesión cerrada');
  }

  // ------------------------------------------------------------
  // botón de la barra
  // ------------------------------------------------------------
  function pintarBoton() {
    if (!ui.boton) return;
    const u = S.user;
    const hay = !!u;
    ui.boton.classList.toggle('con-sesion', hay);
    ui.boton.textContent = '';
    if (hay) {
      if (u.avatar) {
        const img = document.createElement('img');
        img.src = u.avatar;
        img.alt = '';
        ui.boton.appendChild(img);
      }
      const span = document.createElement('span');
      span.textContent = u.displayName || u.username || 'cuenta';
      ui.boton.appendChild(span);
    } else {
      ui.boton.textContent = 'LOGIN';
    }
    ui.boton.title = hay ? 'tu perfil y tus dibujos' : 'entrar con tu cuenta Fullscreen';
  }

  function traerPerfil() {
    if (!haySesion()) { S.user = null; pintarBoton(); return Promise.resolve(); }
    return api('/auth/profile').then(d => {
      const u = (d && d.user) || d || {};
      S.user = {
        username: u.username || '',
        displayName: u.displayName || u.username || '',
        email: u.email || '',
        avatar: u.avatar || '',
        role: u.role || 'USER'
      };
      // las claves del ecosistema se mantienen al día
      guardarSesion(leerToken(), S.user.username, u.id);
      pintarBoton();
    }).catch(() => { pintarBoton(); });
  }

  // ------------------------------------------------------------
  // perfil: dibujos e imágenes
  // ------------------------------------------------------------
  // la imagen viaja al VPS (el /pupperdraw/api del FTP no proxea), así que la
  // URL se arma con CONFIG.API_URL, no con la ruta relativa de la página
  function urlImg(archivo, thumb) {
    const base = (cfg.API_URL || '').replace(/\/$/, '');
    return base + '/api/perfil/img/' + archivo + (thumb ? '-t' : '') + '.png';
  }

  function abrirPerfil() {
    if (!haySesion()) { entrar(); return; }
    ui_perfil(true);
    if (!S.user) { traerPerfil().then(() => { pintarCabecera(); cargarGrilla(); }); }
    else { pintarCabecera(); cargarGrilla(); }
  }
  function cerrarPerfil() { ui_perfil(false); }
  function ui_perfil(v) {
    if (!ui.perfil) return;
    ui.perfil.hidden = !v;
    if (v && window.PPDURL) window.PPDURL.escribir('perfil', null);
  }

  function pintarCabecera() {
    const u = S.user || {};
    if (ui.quien) ui.quien.textContent = u.displayName || u.username || '';
    if (ui.nombre) ui.nombre.textContent = u.displayName || u.username || '';
    if (ui.mail) ui.mail.textContent = u.email ? u.email + ' · ' + (u.role || 'USER') : '';
    if (ui.avatar) {
      if (u.avatar) { ui.avatar.src = u.avatar; ui.avatar.style.display = ''; }
      else ui.avatar.style.display = 'none';
    }
  }

  function msg(t) { if (ui.msg) ui.msg.textContent = t || ''; }

  function cargarGrilla() {
    if (!ui.grilla) return;
    msg('cargando…');
    fetch(API_APP() + '/perfil', { headers: { Authorization: 'Bearer ' + (leerToken() || '') } })
      .then(r => { if (r.status === 401) throw new Error('sesión'); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        S.dibujos = d.dibujos || [];
        S.imagenes = d.imagenes || [];
        pintarGrilla();
        msg('');
      })
      .catch(e => {
        msg(('' + e.message) === 'sesión' ? 'tu sesión venció: volvé a entrar' : 'no pude traer tus cosas (' + e.message + ')');
        pintarGrilla();
      });
  }

  function pintarGrilla() {
    if (!ui.grilla) return;
    const lista = S.pestana === 'dibujos' ? S.dibujos : S.imagenes;
    ui.grilla.textContent = '';
    if (!lista.length) {
      const p = document.createElement('p');
      p.className = 'perfil-vacio';
      p.textContent = S.pestana === 'dibujos'
        ? 'Todavía no guardaste ningún dibujo. Pintá algo y apretá GUARDAR.'
        : 'Todavía no subiste imágenes. Usá SUBIR IMAGEN.';
      ui.grilla.appendChild(p);
      return;
    }
    lista.forEach(it => {
      const c = document.createElement('div');
      c.className = 'perfil-item';
      const img = document.createElement('img');
      img.src = urlImg(it.archivo, true);
      img.alt = it.nombre || '';
      img.loading = 'lazy';
      const pie = document.createElement('div');
      pie.className = 'perfil-pie';
      const nom = document.createElement('span');
      nom.textContent = it.nombre || 'sin nombre';
      nom.title = it.nombre || '';
      pie.appendChild(nom);

      const bajar = document.createElement('a');
      bajar.href = urlImg(it.archivo, false);
      bajar.download = (it.nombre || 'pupperdraw') + '.png';
      bajar.textContent = '⤓';
      bajar.title = 'descargar';
      pie.appendChild(bajar);

      if (it.mio !== false) {
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = '✕';
        del.title = 'borrar';
        del.addEventListener('click', () => borrar(it, del));
        pie.appendChild(del);
      }

      c.appendChild(img);
      c.appendChild(pie);
      ui.grilla.appendChild(c);
    });
  }

  // borrar en DOS PASOS en el mismo botón (nunca confirm del navegador):
  // primer click lo pone en "¿?", segundo click borra; a los 3 s vuelve solo.
  function borrar(it, btn) {
    if (!btn || btn.dataset.confirm !== '1') {
      if (btn) {
        btn.dataset.confirm = '1';
        btn.textContent = '¿?';
        btn.title = 'click de nuevo para borrar';
        btn.classList.add('confirmar');
        setTimeout(() => {
          if (!btn.isConnected) return;
          btn.dataset.confirm = '';
          btn.textContent = '✕';
          btn.title = 'borrar';
          btn.classList.remove('confirmar');
        }, 3000);
      }
      return;
    }
    const tipo = it.tipo === 'imagen' ? 'imagenes' : 'dibujos';
    fetch(API_APP() + '/perfil/' + tipo + '/' + it.id, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + (leerToken() || '') }
    }).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      msg('borrado');
      cargarGrilla();
    }).catch(e => msg('no pude borrar (' + e.message + ')'));
  }

  // guardar el lienzo actual como PNG (+ miniatura)
  function snapshot(mini) {
    const lienzo = document.getElementById('lienzo');
    if (!lienzo) return null;
    if (!mini) return lienzo.toDataURL('image/png');
    const w = 360, h = Math.round(360 * lienzo.height / lienzo.width);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(lienzo, 0, 0, w, h);
    return c.toDataURL('image/png');
  }

  function guardarDibujo() {
    if (!haySesion()) { entrar(); return; }
    // el nombre se escribe en el campo del perfil (sin prompt del navegador)
    const campo = $('perfilNombreDibujo');
    const nombre = ((campo && campo.value) || '').trim() ||
      ('dibujo ' + new Date().toLocaleString('es-AR'));
    if (campo) campo.value = '';
    msg('guardando…');
    fetch(API_APP() + '/perfil/dibujos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (leerToken() || '') },
      body: JSON.stringify({
        nombre: nombre.slice(0, 60),
        png: snapshot(false),
        thumb: snapshot(true),
        sala: (window.COLAB && window.COLAB.sala) || 'principal'
      })
    }).then(r => {
      if (r.status === 401) throw new Error('sesión');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(() => { msg('dibujo guardado'); cargarGrilla(); })
      .catch(e => msg('no pude guardar (' + e.message + ')'));
  }

  // subir una imagen propia (queda en el perfil; el panel de color la usa aparte)
  function subirImagen(file) {
    if (!file) return;
    msg('subiendo…');
    const fr = new FileReader();
    fr.onload = () => {
      const dataUrl = fr.result;
      fetch(API_APP() + '/perfil/imagenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (leerToken() || '') },
        body: JSON.stringify({ nombre: file.name.slice(0, 60), png: dataUrl })
      }).then(r => {
        if (r.status === 401) throw new Error('sesión');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(() => { msg('imagen subida'); cargarGrilla(); })
        .catch(e => msg('no pude subir (' + e.message + ')'));
    };
    fr.readAsDataURL(file);
  }

  // ------------------------------------------------------------
  // QR de la sala
  // ------------------------------------------------------------
  function linkSala() {
    // link LIMPIO para compartir: sólo la sala (sin panel=, chat= ni nada de la UI)
    const sala = (window.COLAB && window.COLAB.sala) || 'principal';
    return location.origin + location.pathname + '?sala=' + encodeURIComponent(sala);
  }

  function abrirQR() {
    if (!ui.qr) return;
    const link = linkSala();
    if (ui.qrLink) ui.qrLink.textContent = link;
    ui.qr.hidden = false;
    if (window.PPDURL) window.PPDURL.escribir('qr', null);
    if (ui.qrImg) {
      ui.qrImg.textContent = '';
      if (typeof qrcode === 'function') {
        const qr = qrcode(0, 'M');
        qr.addData(link);
        qr.make();
        // el QR se dibuja como SVG: nítido en cualquier pantalla
        ui.qrImg.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 12, scalable: true });
      } else {
        ui.qrImg.textContent = link;
      }
    }
  }
  function cerrarQR() { if (ui.qr) ui.qr.hidden = true; }

  // ------------------------------------------------------------
  // enganches
  // ------------------------------------------------------------
  if (ui.boton) {
    ui.boton.addEventListener('click', () => { if (haySesion()) abrirPerfil(); else entrar(); });
  }
  if (ui.botQR) ui.botQR.addEventListener('click', abrirQR);
  if (ui.qrCerrar) ui.qrCerrar.addEventListener('click', cerrarQR);
  if (ui.cerrar) ui.cerrar.addEventListener('click', cerrarPerfil);
  if (ui.salir) ui.salir.addEventListener('click', salir);
  if (ui.guardar) ui.guardar.addEventListener('click', guardarDibujo);
  if (ui.subir) ui.subir.addEventListener('click', () => ui.file && ui.file.click());
  if (ui.file) {
    ui.file.addEventListener('change', () => {
      const f = ui.file.files && ui.file.files[0];
      ui.file.value = '';
      if (f) subirImagen(f);
    });
  }
  ui.tabs.forEach(b => {
    b.addEventListener('click', () => {
      S.pestana = b.dataset.perfilTab === 'imagenes' ? 'imagenes' : 'dibujos';
      ui.tabs.forEach(o => o.classList.toggle('on', o === b));
      cargarGrilla();      // trae lo último del server (otra pestaña pudo cambiar algo)
    });
  });

  // scrim: click afuera cierra
  [ui.perfil, ui.qr].forEach(p => {
    if (!p) return;
    p.addEventListener('click', (ev) => { if (ev.target === p) { if (p === ui.qr) cerrarQR(); else cerrarPerfil(); } });
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { if (ui.qr && !ui.qr.hidden) cerrarQR(); else if (ui.perfil && !ui.perfil.hidden) cerrarPerfil(); }
  });

  window.PPDCuenta = {
    entrar, salir, abrirPerfil, abrirQR,
    guardarDibujo,
    user: () => S.user,
    haySesion
  };

  // arranque
  pintarBoton();
  if (haySesion()) traerPerfil();
  if (window.PPDURL && window.PPDURL.leer('perfil', '0') === '1') setTimeout(abrirPerfil, 600);
  if (window.PPDURL && window.PPDURL.leer('qr', '0') === '1') setTimeout(abrirQR, 600);
})();
