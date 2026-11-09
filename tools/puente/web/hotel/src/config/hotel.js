// Constantes del cliente de CV Hotel (medidas del dibujo y decoracion por defecto).
// Las reglas que comparte con el servidor estan en contrato.js y motor.js.

// Medidas del mundo (las mismas de PawHotel): baldosa de 92x46, pared de 118 de alto.
export const TILE_W = 92;
export const TILE_H = 46;
export const WALL_H = 118;
export const WALL_THICK = 7;
// El mundo se arma sobre un ancho fijo; la camara (src/ui/vista.js) lo acomoda a la pantalla.
export const MUNDO_W = 1440;
export const MUNDO_OFFSET_Y = 235;

// Tema de las salas (colores base antes de la decoracion de cada sala).
export const TEMA_BASE = Object.freeze({
  bg1: '#0b0b10', bg2: '#000000',
  floorA: '#878c58', floorB: '#878c58', floorEdge: '#5a5e38',
  wallA: '#8a96a8', wallB: '#9eaab8', wallTop: '#c8d0d8',
});

// Decoracion por defecto (el catalogo del servidor la puede reemplazar con su campo decoracion).
export const PATRONES_PARED = Object.freeze([
  { id: 'plain', name: 'Lisa' },
  { id: 'brick', name: 'Ladrillo' },
  { id: 'brick_sm', name: 'Ladrillo fino' },
  { id: 'stripe', name: 'Rayas' },
  { id: 'diamond', name: 'Rombos' },
]);
export const PATRONES_PISO = Object.freeze([
  { id: 'solid', name: 'Liso' },
  { id: 'checker', name: 'Tablero' },
  { id: 'tile', name: 'Mosaico' },
  { id: 'tile_sm', name: 'Mosaico fino' },
  { id: 'iso_brick', name: 'Tablones' },
  { id: 'brick_floor', name: 'Ladrillo chico' },
  { id: 'stripe_h', name: 'Rayas' },
  { id: 'parquet', name: 'Parquet' },
]);
export const COLORES_DECO = Object.freeze([
  { name: 'Blanco', hex: '#e8e8e8', id: 'white' },
  { name: 'Gris', hex: '#8a96a8', id: 'gray' },
  { name: 'Azul', hex: '#4a7ab5', id: 'blue' },
  { name: 'Verde', hex: '#4a8a5a', id: 'green' },
  { name: 'Rojo', hex: '#b54a4a', id: 'red' },
  { name: 'Amarillo', hex: '#c8a030', id: 'yellow' },
  { name: 'Violeta', hex: '#7a4ab5', id: 'violet' },
  { name: 'Naranja', hex: '#c8682a', id: 'orange' },
  { name: 'Rosa', hex: '#c86090', id: 'pink' },
  { name: 'Marrón', hex: '#7a5030', id: 'brown' },
]);

// Formas de sala que puede elegir la gente (contrato.FORMAS) con su nombre.
export const NOMBRES_FORMA = Object.freeze({ small: 'Chica (8×8)', rect: 'Rectangular (10×14)', l_shape: 'En L (12×10)', hex: 'Recortada (12×10)' });
export const CAPACIDADES = Object.freeze([5, 10, 15, 20, 25]);

// Lo que se guarda en el navegador (solo comodidades de esta persona).
export const LS = Object.freeze({ zoom: 'cvhotel.zoom', pestanaSalas: 'cvhotel.salas' });

export const GESTOS_TXT = Object.freeze({ saludo: '👋', aplauso: '👏', risa: '😂', baile: '💃', pensar: '🤔', si: '👍', no: '👎' });
export const GESTOS_NOMBRE = Object.freeze({ saludo: 'Saludar', aplauso: 'Aplaudir', risa: 'Reírse', baile: 'Bailar', pensar: 'Pensar', si: 'Sí', no: 'No' });
