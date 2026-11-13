/* =====================================================================
   nombres.js — nombres por defecto de la sala
   Mismo sistema que pizarraia: ANIMAL + ADJETIVO + COLOR con semilla, así
   el nombre es estable para la misma conexión y no se repite entre gente.
   Listas de animales autóctonos de Sudamérica.
   ===================================================================== */
(function (global) {
  'use strict';

  const animales = [
    'Jaguar', 'Puma', 'Cóndor', 'Guanaco', 'Vicuña', 'Llama', 'Alpaca',
    'Capibara', 'Carpincho', 'Tapir', 'Oso Hormiguero', 'Tucán', 'Guacamayo',
    'Yacaré', 'Anaconda', 'Ñandú', 'Armadillo', 'Tatú', 'Coatí', 'Aguará Guazú',
    'Yaguareté', 'Ocelote', 'Margay', 'Huemul', 'Pudú', 'Vizcacha', 'Chinchilla',
    'Flamenco Andino', 'Pingüino de Magallanes', 'Nutria Gigante', 'Delfín Rosado',
    'Perezoso', 'Mono Aullador', 'Mono Tití', 'Boa', 'Caimán', 'Tortuga Mata Mata',
    'Guacamayo Azul', 'Colibrí', 'Loro', 'Cacatúa', 'Piraña', 'Cuy'
  ];

  const adjetivos = [
    'Valiente', 'Audaz', 'Veloz', 'Sabio', 'Fuerte', 'Ágil', 'Brillante',
    'Misterioso', 'Salvaje', 'Sereno', 'Feroz', 'Astuto', 'Noble', 'Leal',
    'Curioso', 'Intrépido', 'Radiante', 'Silencioso', 'Poderoso', 'Gentil',
    'Rebelde', 'Pacífico', 'Creativo', 'Ingenioso', 'Elegante', 'Rápido',
    'Tranquilo', 'Explosivo', 'Místico', 'Épico', 'Legendario', 'Cósmico',
    'Eterno', 'Infinito', 'Supremo', 'Divino', 'Celestial', 'Mágico',
    'Heroico', 'Majestuoso', 'Glorioso', 'Invencible', 'Imparable', 'Libre'
  ];

  const colores = [
    'Rojo', 'Azul', 'Verde', 'Amarillo', 'Naranja', 'Morado', 'Rosa',
    'Negro', 'Blanco', 'Gris', 'Dorado', 'Plateado', 'Bronce', 'Turquesa',
    'Coral', 'Índigo', 'Violeta', 'Carmesí', 'Esmeralda', 'Zafiro', 'Rubí',
    'Ámbar', 'Jade', 'Perla', 'Marfil', 'Ébano', 'Celeste', 'Magenta',
    'Cian', 'Lavanda', 'Fucsia', 'Escarlata', 'Cereza', 'Limón'
  ];

  function hashDe(semilla) {
    let hash = 0;
    for (let i = 0; i < semilla.length; i++) {
      hash = ((hash << 5) - hash) + semilla.charCodeAt(i);
      hash = hash & hash;
    }
    return hash;
  }

  /** nombre largo: "Jaguar Valiente Dorado" (estable si le pasás una semilla) */
  function aleatorio(semilla) {
    if (semilla) {
      const h = hashDe(String(semilla));
      return animales[Math.abs(h) % animales.length] + ' ' +
             adjetivos[Math.abs(h >> 8) % adjetivos.length] + ' ' +
             colores[Math.abs(h >> 16) % colores.length];
    }
    return animales[Math.floor(Math.random() * animales.length)] + ' ' +
           adjetivos[Math.floor(Math.random() * adjetivos.length)] + ' ' +
           colores[Math.floor(Math.random() * colores.length)];
  }

  /** nombre corto: "Dorado Jaguar" */
  function corto(semilla) {
    if (semilla) {
      const h = hashDe(String(semilla));
      return colores[Math.abs(h) % colores.length] + ' ' + animales[Math.abs(h >> 8) % animales.length];
    }
    return colores[Math.floor(Math.random() * colores.length)] + ' ' + animales[Math.floor(Math.random() * animales.length)];
  }

  global.VGNombres = { aleatorio: aleatorio, corto: corto, animales: animales, adjetivos: adjetivos, colores: colores };
})(typeof window !== 'undefined' ? window : globalThis);
