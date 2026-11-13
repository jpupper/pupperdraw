/* =====================================================================
   paletas.js — GENERADO por tools/extract_palettes.py. No editar a mano.
   Cinco paletas sacadas de los cuadros de Van Gogh (k-means sobre el
   original, 6 colores ordenados de oscuro a claro).
   ===================================================================== */
(function (global) {
  'use strict';
  const PALETAS = [
    { id: "noche", label: "NOCHE ESTRELLADA", obra: "La noche estrellada (1889)",
      fuente: "art/paintings/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
      colores: ["#202943", "#466598", "#738da1", "#a99b32", "#b0b9a8", "#f2c53a"] },
    { id: "girasoles", label: "GIRASOLES", obra: "Los girasoles (1888)",
      fuente: "art/paintings/Vincent_van_Gogh_-_Sunflowers_-_VGM_F458.jpg",
      colores: ["#3d5c21", "#69741a", "#a98412", "#c8a415", "#e3b429", "#d3c338"] },
    { id: "lirios", label: "LIRIOS", obra: "Los lirios (1889)",
      fuente: "art/paintings/Vincent_van_Gogh_-_Irises_(1889).jpg",
      colores: ["#344465", "#83623c", "#6d7e4e", "#90974b", "#d7c94a", "#c3c8a7"] },
    { id: "dormitorio", label: "EL DORMITORIO", obra: "El dormitorio en Arles (1888)",
      fuente: "art/paintings/Vincent_van_Gogh_-_Van_Gogh's_Bedroom_in_Arles_-_Google_Art_Project.jpg",
      colores: ["#755c36", "#8193bc", "#a39788", "#b8af4d", "#e5bd3c", "#d3d2a6"] },
    { id: "trigal", label: "TRIGAL Y CIPRES", obra: "Trigal con cipreses (1889)",
      fuente: "art/paintings/Wheat_Field_with_Cypresses_MET_LC-EP_1993_132_suppl_CH-001.jpg",
      colores: ["#3c3122", "#8b622b", "#8e7f50", "#a5a68c", "#dcb83c", "#b5cad1"] },
  ];
  function byId(id) { return PALETAS.find(p => p.id === id) || PALETAS[0]; }
  global.VGPALETAS = { PALETAS, byId, DEFAULT: PALETAS[0].id };
})(typeof window !== 'undefined' ? window : globalThis);
