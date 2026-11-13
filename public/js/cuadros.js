/* =====================================================================
   cuadros.js — GENERADO por tools/make_cuadros.py. No editar a mano.
   Las cinco obras que el estudio puede usar como imagen: fuente de color
   (modo IMAGE) y textura de materia / refraccion.
   ===================================================================== */
(function (global) {
  'use strict';
  const CUADROS = [
    { id: "noche", label: "NOCHE ESTRELLADA", obra: "La noche estrellada (1889)", src: "img/cuadros/noche.jpg", w: 1600, h: 1267 },
    { id: "girasoles", label: "GIRASOLES", obra: "Los girasoles (1888)", src: "img/cuadros/girasoles.jpg", w: 1221, h: 1600 },
    { id: "lirios", label: "LIRIOS", obra: "Los lirios (1889)", src: "img/cuadros/lirios.jpg", w: 1600, h: 1236 },
    { id: "dormitorio", label: "EL DORMITORIO", obra: "El dormitorio en Arles (1888)", src: "img/cuadros/dormitorio.jpg", w: 1600, h: 1240 },
    { id: "trigal", label: "TRIGAL Y CIPRES", obra: "Trigal con cipreses (1889)", src: "img/cuadros/trigal.jpg", w: 1600, h: 1064 },
  ];
  function byId(id) { return CUADROS.find(c => c.id === id) || CUADROS[0]; }
  global.VGCUADROS = { CUADROS, byId, DEFAULT: CUADROS[0].id };
})(typeof window !== 'undefined' ? window : globalThis);
