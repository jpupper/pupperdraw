/* =====================================================================
   pinceles.js — registro de pinceles: DOS MOTORES, dos entradas.
   motor "trazo" = pinceladas Van Gogh (trazo.js, por defecto)
   motor "tip"   = pincel continuo original de Vervette
   Las variantes (empaste, arremolinado, etc.) NO son pinceles: son presets
   (ver FABRICAS en presets.js), porque son el mismo motor con otros números.
   ===================================================================== */
(function (global) {
  'use strict';

  const PINCELES = [
    {
      id: 'vangogh',
      label: 'Van Gogh · pinceladas',
      motor: 'trazo',
      desc: 'El puntero siembra pinceladas de hoja: punta, cuerpo con vetas de cerda y cola.',
      trazo: {
        len: 78, wid: 15, spacing: 0.34, perPass: 1, jitter: 0.20, bend: 0.35,
        speed: 10, taper: 0.9, soft: 0.35, bristle: 1, stretch: 3.2, spread: 0.95,
        opacVar: 0.12, lenVar: 0.32, widVar: 0.30, dwell: true
      }
    },
    {
      id: 'vervette',
      label: 'Vervette · trazo continuo',
      motor: 'tip',
      desc: 'El pincel original del motor: una cápsula continua con fluido (sin pinceladas).',
      tip: {
        size: 60, soft: 50, opacity: 255, matter: 50,
        noiseScale: 15, noiseContrast: 75, noiseBrightness: 20,
        sizeDynamic: false, speedSize: true   // el grosor por velocidad se prende/apaga en el panel
      }
    }
  ];

  function byId(id) { return PINCELES.find(p => p.id === id) || PINCELES[0]; }

  global.VGPinceles = { PINCELES, byId, DEFAULT: 'vervette' };
})(typeof window !== 'undefined' ? window : globalThis);
