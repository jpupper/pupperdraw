/* Configuración FSC de PUPPERDRAW (nombres obligatorios: BASE, API_URL, FSCAUTH_URL)
   Dual-hosting: el FRONT se sirve desde el FTP (fullscreencode.com/pupperdraw/) y el
   BACKEND de sockets vive en el VPS. El navegador nunca "navega" al VPS: el socket es
   una conexión técnica (README §0.4). */
(function () {
  const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const PUERTO = 5124;
  const VPS = 'https://vps-4455523-x.dattaweb.com';
  window.CONFIG = {
    BASE: '/pupperdraw',
    API_URL: LOCAL ? 'http://localhost:' + PUERTO + '/pupperdraw' : VPS + '/pupperdraw',
    SOCKET_URL: LOCAL ? 'http://localhost:' + PUERTO : VPS,
    FSCAUTH_URL: 'https://fullscreencode.com/fscauth'
  };

  /* ------------------------------------------------------------------
     ESTADO DE LA INTERFAZ EN LA URL
     Cada panel que se abre o se cierra queda escrito en el link, así el
     estado viaja con la URL y se puede compartir tal cual:
       panel=simple | todos | global | off   (panel del pincel / global)
       chat=1                                (panel de chat)
     No toca los parámetros que ya existen (sala, user, p, preset…):
     los respeta y reescribe sólo el suyo.
     ------------------------------------------------------------------ */
  function leer(k, def) {
    const v = new URLSearchParams(location.search).get(k);
    return v === null ? def : v;
  }
  function escribir(k, v) {
    const qs = new URLSearchParams(location.search);
    if (v === null || v === undefined || v === '') qs.delete(k);
    else qs.set(k, String(v));
    const s = qs.toString();
    const url = location.pathname + (s ? '?' + s : '') + location.hash;
    try { history.replaceState(null, '', url); } catch (e) { /* file:// o similar */ }
    return s;
  }
  function link(k, v) {
    // link absoluto con el estado actual + un cambio (para compartir)
    const qs = new URLSearchParams(location.search);
    if (v === null || v === undefined) qs.delete(k); else qs.set(k, String(v));
    const s = qs.toString();
    return location.origin + location.pathname + (s ? '?' + s : '');
  }

  window.PPDURL = { leer: leer, escribir: escribir, link: link };
})();
