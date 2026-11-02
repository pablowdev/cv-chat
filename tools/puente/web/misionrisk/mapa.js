// GlobalSiege (antes MissionRisk), de Doug Burner, GNU GPL v3: https://github.com/labarks/globalsiege
// El mapa del juego original (Mask4.frm: LoadAllCountryData y LoadContinents): los 42 paises
// con su lugar en el mapa (x, y, ancho, alto, sobre mapa.jpg de 944x650), su recorte en la
// hoja de siluetas (paises.png, armada por tools/misionrisk/armar-arte.js), sus vecinos y donde
// va el numero de tropas (con la regla de impresion: L izquierda, R derecha, M centro, W blanco).
// Lo usan el servidor (misionrisk-motor.js) y la pagina (juego.js).
(function (root) {
  'use strict';
  // [id, x, y, ancho, alto, nombre, vecinos, numeroX, numeroY, regla, xHoja, yHoja]
  const P = [
    [1, 27, 112, 84, 105, 'Alaska', [2, 4, 38], 71, 155, 'M', 7, 1],
    [2, 103, 73, 102, 107, 'Territorio del Noroeste', [1, 3, 4, 5], 142, 150, 'M', 92, 1],
    [3, 191, 70, 148, 119, 'Groenlandia', [2, 5, 6, 14], 297, 120, 'M', 195, 1],
    [4, 106, 165, 71, 77, 'Columbia Británica', [1, 2, 5, 7], 143, 207, 'M', 1, 107],
    [5, 170, 173, 85, 93, 'Ontario', [2, 3, 4, 6, 7, 8], 203, 226, 'M', 318, 269],
    [6, 239, 188, 82, 76, 'Quebec', [3, 5, 8], 264, 226, 'M', 149, 121],
    [7, 120, 233, 67, 78, 'Estados Unidos Oeste', [4, 5, 8, 9], 152, 269, 'M', 232, 121],
    [8, 181, 235, 106, 98, 'Estados Unidos Este', [5, 6, 7, 9], 208, 278, 'M', 300, 121],
    [9, 136, 299, 105, 98, 'México', [7, 8, 10], 178, 363, 'RW', 1, 201],
    [10, 206, 378, 86, 44, 'Colombia', [9, 11, 12], 238, 394, 'L', 107, 201],
    [11, 203, 418, 84, 92, 'Perú', [10, 12, 13], 253, 472, 'M', 107, 246],
    [12, 239, 399, 100, 126, 'Brasil', [10, 11, 13, 21], 278, 437, 'M', 1, 300],
    [13, 244, 497, 43, 110, 'Argentina', [11, 12], 260, 533, 'M', 344, 1],
    [14, 338, 183, 44, 36, 'Islandia', [3, 15, 16], 355, 176, 'W', 1, 427],
    [15, 371, 229, 41, 52, 'Gran Bretaña', [14, 16, 17, 18], 377, 244, 'RW', 1, 464],
    [16, 413, 169, 51, 78, 'Escandinavia', [14, 15, 17, 20], 433, 175, 'RW', 46, 427],
    [17, 413, 230, 70, 55, 'Germania', [15, 16, 18, 19, 20], 454, 261, 'M', 1, 517],
    [18, 377, 272, 55, 60, 'España', [15, 17, 19, 21], 405, 296, 'M', 102, 339],
    [19, 424, 271, 74, 56, 'Mediterráneo', [17, 18, 20, 21, 22, 27], 459, 285, 'M', 194, 200],
    [20, 448, 169, 120, 142, 'Prusia', [16, 17, 19, 27, 28, 32], 515, 246, 'M', 407, 1],
    [21, 349, 330, 95, 106, 'Argelia', [12, 18, 19, 22, 23, 24], 389, 384, 'M', 407, 144],
    [22, 422, 333, 79, 54, 'Egipto', [19, 21, 23, 27], 454, 360, 'M', 255, 581],
    [23, 436, 377, 94, 106, 'Etiopía', [21, 22, 24, 25, 26, 27], 476, 406, 'M', 102, 400],
    [24, 414, 411, 58, 60, 'Congo', [21, 23, 25], 439, 444, 'M', 158, 339],
    [25, 418, 459, 77, 90, 'Sudáfrica', [23, 24, 26], 449, 497, 'M', 197, 400],
    [26, 507, 458, 29, 62, 'Madagascar', [23, 25], 535, 471, 'LW', 192, 257],
    [27, 473, 276, 95, 119, 'Arabia Saudita', [19, 20, 22, 23, 28, 29], 515, 353, 'M', 222, 269],
    [28, 548, 253, 73, 96, 'Afganistán', [20, 27, 29, 32, 33], 579, 297, 'M', 275, 389],
    [29, 562, 306, 81, 108, 'India', [27, 28, 30, 33], 600, 350, 'M', 595, 261],
    [30, 634, 345, 71, 81, 'Camboya', [29, 33, 39], 675, 374, 'M', 73, 109],
    [31, 638, 124, 113, 155, 'Siberia', [32, 33, 34, 35, 36], 682, 201, 'M', 528, 1],
    [32, 558, 83, 131, 200, 'Krasnoyarsk', [20, 28, 31, 33], 603, 199, 'M', 463, 251],
    [33, 606, 266, 134, 108, 'China', [28, 29, 30, 31, 32, 34], 669, 315, 'M', 349, 452],
    [34, 679, 257, 92, 67, 'Corea', [31, 33, 35, 37, 38], 731, 279, 'M', 349, 378],
    [35, 706, 184, 87, 83, 'Magadán', [31, 34, 36, 38], 741, 227, 'M', 503, 157],
    [36, 727, 126, 137, 89, 'Chukotka', [31, 35, 38], 796, 162, 'M', 197, 491],
    [37, 773, 252, 56, 69, 'Japón', [34, 38], 805, 312, 'LW', 72, 507],
    [38, 762, 131, 164, 150, 'Kamchatka', [1, 34, 35, 36, 37], 865, 179, 'M', 484, 452],
    [39, 679, 404, 103, 67, 'Indonesia', [30, 40, 41], 733, 426, 'M', 1, 577],
    [40, 754, 473, 78, 86, 'Australia Occidental', [39, 41, 42], 789, 515, 'M', 335, 561],
    [41, 790, 418, 86, 34, 'Nueva Guinea', [39, 40, 42], 825, 412, 'MW', 484, 603],
    [42, 821, 473, 90, 103, 'Australia Oriental y NZ', [40, 41], 836, 518, 'M', 595, 157],
  ];
  const paises = [null];
  for (const [id, x, y, w, h, nombre, vecinos, nx, ny, regla, sx, sy] of P) paises[id] = { id, x, y, w, h, nombre, vecinos, nx, ny, regla, sx, sy };
  // Continentes: del primero al ultimo pais, sus tropas extra (las del juego de fabrica:
  // Default War.mrk) y sus "puertas" (los paises por donde se entra, para la compu)
  const continentes = [
    { id: 1, nombre: 'América del Norte', de: 1, a: 9, extra: 5, puertas: [1, 3, 9] },
    { id: 2, nombre: 'América del Sur', de: 10, a: 13, extra: 2, puertas: [10, 12] },
    { id: 3, nombre: 'Europa', de: 14, a: 20, extra: 5, puertas: [14, 18, 19, 20] },
    { id: 4, nombre: 'África', de: 21, a: 26, extra: 3, puertas: [21, 22, 23] },
    { id: 5, nombre: 'Asia', de: 27, a: 38, extra: 7, puertas: [27, 28, 30, 32, 38] },
    { id: 6, nombre: 'Australia', de: 39, a: 42, extra: 2, puertas: [39] },
  ];
  const continenteDe = (p) => continentes.find(c => p >= c.de && p <= c.a);
  // Los ejercitos, con los colores del original (lngColor de Default War.mrk)
  const ejercitos = [null,
    { id: 1, nombre: 'Ejército Rojo', corto: 'Rojo', color: '#e01b1b' },
    { id: 2, nombre: 'Ejército Verde', corto: 'Verde', color: '#18a018' },
    { id: 3, nombre: 'Ejército Azul', corto: 'Azul', color: '#2d5be3' },
    { id: 4, nombre: 'Ejército Amarillo', corto: 'Amarillo', color: '#f2d21b' },
    { id: 5, nombre: 'Ejército Violeta', corto: 'Violeta', color: '#b02cc8' },
    { id: 6, nombre: 'Ejército Gris', corto: 'Gris', color: '#9a9a9a' },
  ];
  const M = { ANCHO: 944, ALTO: 650, paises, continentes, continenteDe, ejercitos };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.MRMapa = M;
})(typeof window !== 'undefined' ? window : this);
