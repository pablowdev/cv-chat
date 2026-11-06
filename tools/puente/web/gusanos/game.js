/* =====================================================================
   PROYECTO GUSANOS — motor de juego en JavaScript
   - Mapas de la comunidad en sus dimensiones nativas
   - Sprites y animaciones de gusanos por equipo
   - Reglas de partida: 200 HP, 30 s, CBA, terreno indestructible
   - Simulación fija a 50 Hz, cámara que encuadra el mapa completo
   ===================================================================== */
'use strict';
(function () {

// ─────────────────────────────────────────────────────────────────────
// Constantes del motor
// ─────────────────────────────────────────────────────────────────────
const PASO_MS = 20;                    // 50 Hz
const TICK = 0.02;
const GRAVEDAD = 15728 / 65536;        // 0.23999 px/frame²
const ROZAMIENTO = 62914 / 65536;      // 0.96
const VEL_MAX = 32;                    // velocidad máxima de proyectiles
const VEL_MAX_GUSANO = 32;             // tope de seguridad; WA no limita la soga a 16
const CAMINAR = 1.0; // WA: 1 px por tick = 50 px/s
// La mira de WA no sigue el mouse: está a una distancia corta fija y gira
// con las flechas arriba/abajo.
const DIST_MIRA = 74;
// Desplazamiento por frame del ciclo de caminata de WA (15 frames, 13 con
// movimiento, 3 ciclos/s). Se escala para conservar la velocidad media actual.
const PATRON_CAMINAR = [0.5, 0, 0.5, 0.5, 0.5, 0.5, 1.5, 1.75, 1.5, 1.25, 0.25, 0, 0.25, 0.25, 0.25];
const PASO_CAMINAR = 0.9; // 15 frames / (0.9 * 50 Hz) ≈ 3 ciclos/s
// La fase avanza 0,9 por tick: algunos frames se repiten. Se calcula la suma
// real de un segundo (50 ticks) para que la velocidad media sea 50 px/s.
const SUMA_PATRON_50 = (() => {
  let suma = 0, fase = 0;
  for (let i = 0; i < 50; i++) {
    suma += PATRON_CAMINAR[Math.floor(fase) % PATRON_CAMINAR.length];
    fase += PASO_CAMINAR;
  }
  return suma;
})();
const ESCALA_PATRON = CAMINAR * 50 / SUMA_PATRON_50;
// Trayectorias reales de W:A (parábolas de la comunidad, en píxeles):
// adelante 32 de alto y 72 de largo; atrás/arriba 40 de alto y 32 de largo;
// mortal 72 de alto y 21 de largo. Los valores de velocidad salen de esas
// parábolas con la gravedad del juego (0,24 px/tick²).
const SALTOS = {
  adelante: { vy: -4.04, vx: 2.20, roll: 0,        rollDur: 0 },
  atras:    { vy: -4.50, vx: 0.88, roll: 0,        rollDur: 0 },
  arriba:   { vy: -4.50, vx: 0,    roll: 0,        rollDur: 0 },
  mortal:   { vy: -6.00, vx: 0.43, roll: 1.00,     rollDur: 1.00 },
  mini:     { vy: -4.50, vx: 0.88, roll: 0.70,     rollDur: 0.70 },
};
const VENTANA_SALTO = 0.14; // doble toque, como el arranque de salto de WA
const VENTANA_MINI = 0.20;  // espera extra para el mini mortal (Backspace x2 + Enter)
const LARGO_SOGA_MAX = 464;            // 5 estrellas: 462–465 px
const LARGO_SOGA_MIN = 14;
const VEL_GARFIO = 18;
const ACORTAR = 3.2;
const ALARGAR = 4.4;
const HAMACAR = 0.16;                  // empuje lateral de la soga (antes 0.42: aceleraba de más)
const REBOTE_GUSANO = 0.6;             // rebote contra paredes, como Worms Armageddon
const PASO_ARRIBA = 8;                 // la caminata sube escalones de hasta 8 px
const PASO_ABAJO = 8;                  // y baja escalones de hasta 8 px
const ASENTAR_ABAJO = 16;              // al aterrizar, busca piso hasta 16 px
const VIDA = 200;
const TIEMPO_TURNO = 30;
const RETIRADA = 5;
const RETIRADA_SOGA = 10;
// Escala objetivo del zoom automático: el gusano mide ~44 px de alto,
// así que 0.72 lo deja en unos 32 px en pantalla.
const ESCALA_GUSANO = 0.72;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

const MUNDO = { w: 1920, h: 696, agua: 656 };

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const azar = (a, b) => a + Math.random() * (b - a);
const azarInt = (a, b) => Math.floor(azar(a, b + 1));
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const normAng = a => Math.atan2(Math.sin(a), Math.cos(a));
const DOS_PI = Math.PI * 2;

// La mira de Worms: arriba/abajo cambian la elevación y la dirección la da el
// lado hacia el que mira el gusano. Guardamos el ángulo del mundo (aim), pero
// lo pensamos como una elevación entre -90° (arriba) y +90° (abajo).
function elevacion(w) {
  if (w.mirando > 0) return clamp(normAng(w.aim), -Math.PI / 2, Math.PI / 2);
  let a = ((w.aim % DOS_PI) + DOS_PI) % DOS_PI;
  if (a < Math.PI / 2) a += DOS_PI;
  return clamp(Math.PI - a, -Math.PI / 2, Math.PI / 2);
}
function fijarElevacion(w, e) {
  e = clamp(e, -Math.PI / 2, Math.PI / 2);
  let a = w.mirando > 0 ? e : Math.PI - e;
  if (a > Math.PI) a -= DOS_PI;
  w.aim = a;
}
function ajustarMira(w, delta) {
  fijarElevacion(w, elevacion(w) + delta);
}
function mirarHacia(w, dir) {
  if (!dir || dir === w.mirando) return;
  const e = elevacion(w);
  w.mirando = dir;
  fijarElevacion(w, e);
}
function ejecutarSalto(w, tipo) {
  const def = SALTOS[tipo];
  if (!def || !w.enPiso || w.muerto) return;
  const dir = tipo === 'adelante' ? w.mirando : -w.mirando;
  w.vy = def.vy;
  w.vx = def.vx ? dir * def.vx : 0;
  w.enPiso = false;
  w.saltoT = 0;
  w.caminando = false;
  w.volteretaDur = def.rollDur || 0.55;
  w.voltereta = def.roll ? def.rollDur : 0;
  w.saltoPendiente = null;
  w.saltoPendienteT = 0;
  w.ultimoSalto = '';
  w.ultimoSaltoT = 0;
  sonido('walk-compress', 0.06, tipo === 'adelante' ? 1.4 : 1.25);
}

// WA distingue cuatro saltos según la secuencia de teclas. El primer toque
// queda en espera una fracción de segundo para ver si viene el segundo.
function presionarSalto(w, tecla) {
  if (!w.enPiso || w.muerto || w.soga.estado !== 'none') return;
  if (tecla === 'adelante') {
    if (w.ultimoSalto === 'adelante' && w.ultimoSaltoT > 0) {
      w.saltoPendiente = null;
      w.saltoPendienteT = 0;
      ejecutarSalto(w, 'atras');
      return;
    }
    if (w.saltoPendiente === 'arriba') {
      w.saltoPendiente = null;
      w.saltoPendienteT = 0;
      ejecutarSalto(w, 'atras');
      return;
    }
    if (w.saltoPendiente === 'mortal') {
      w.saltoPendiente = null;
      w.saltoPendienteT = 0;
      ejecutarSalto(w, 'mini');
      return;
    }
    if (!w.saltoPendiente) {
      w.saltoPendiente = 'adelante';
      w.saltoPendienteT = VENTANA_SALTO;
      w.ultimoSalto = 'adelante';
      w.ultimoSaltoT = VENTANA_SALTO;
    }
  } else {
    if (w.ultimoSalto === 'atras' && w.ultimoSaltoT > 0) {
      // Segundo Backspace: esperar un posible Enter para el mini mortal.
      w.saltoPendiente = 'mortal';
      w.saltoPendienteT = VENTANA_MINI;
      w.ultimoSalto = '';
      w.ultimoSaltoT = 0;
      return;
    }
    if (!w.saltoPendiente) {
      w.saltoPendiente = 'arriba';
      w.saltoPendienteT = VENTANA_SALTO;
      w.ultimoSalto = 'atras';
      w.ultimoSaltoT = VENTANA_SALTO;
    }
  }
}

function actualizarSalto(w) {
  if (w.ultimoSaltoT > 0) w.ultimoSaltoT = Math.max(0, w.ultimoSaltoT - TICK);
  if (w.saltoPendienteT <= 0) return;
  w.saltoPendienteT -= TICK;
  if (w.saltoPendienteT > 0) return;
  const tipo = w.saltoPendiente;
  w.saltoPendiente = null;
  w.saltoPendienteT = 0;
  if (tipo) ejecutarSalto(w, tipo);
}

// ─────────────────────────────────────────────────────────────────────
// Assets
// ─────────────────────────────────────────────────────────────────────
const MAPAS = window.MAPAS_PROYECTO || [];
const MASCARAS = window.MASCARAS || {};
const GUSANOS_SPRITES = window.GUSANOS_SPRITES || {};
const WEAPON_SPRITES = window.WEAPON_SPRITES || {};

const EQUIPOS_DEF = [
  { key: 'rojo',     nombre: 'Rojo',     color: '#e6564a' },
  { key: 'azul',     nombre: 'Azul',     color: '#4a8fe6' },
  { key: 'verde',    nombre: 'Verde',    color: '#48b96a' },
  { key: 'amarillo', nombre: 'Amarillo', color: '#e6c542' },
  { key: 'violeta',  nombre: 'Violeta',  color: '#a45fd6' },
  { key: 'naranja',  nombre: 'Naranja',  color: '#e68a3c' },
];

// En online cada equipo es una persona: el marcador y los avisos muestran su nombre.
function nombreEquipo(eq) {
  if (G.online && typeof ONLINE !== 'undefined' && ONLINE.jugadores && ONLINE.jugadores[eq]) {
    return ONLINE.jugadores[eq].nombre;
  }
  return 'Equipo ' + EQUIPOS_DEF[eq].nombre;
}

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let cssW = 1, cssH = 1, dpr = 1;

function ajustarLienzo() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cssW = cv.clientWidth || window.innerWidth;
  cssH = cv.clientHeight || window.innerHeight;
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  recalcularBase();
  limitarCamara();
}
window.addEventListener('resize', ajustarLienzo);

const IMGS = new Map();
function imagen(src) {
  let im = IMGS.get(src);
  if (!im) {
    im = new Image();
    im.src = src;
    IMGS.set(src, im);
  }
  return im;
}
function lista(im) { return im && im.complete && im.naturalWidth > 0; }
function sheetGusano(anim, key) {
  return imagen('assets/gusanos/' + anim + '_' + key + '.png');
}

// ─────────────────────────────────────────────────────────────────────
// Sonido (efectos de la partida)
// ─────────────────────────────────────────────────────────────────────
const SFX = {};
const SFX_NOMBRES = ['turno', 'soga-disparo', 'soga-impacto', 'splash', 'gusano-seleccion', 'explosion1',
  'explosion2', 'explosion3', 'fuse', 'cratepop', 'collect', 'throwrelease',
  'gusano-caida', 'walk-compress', 'walk-expand', 'crateimpact', 'cursorselect',
  'shotgun', 'shotgunreload', 'minigun', 'bow', 'bowimpact',
  'batswing', 'batimpact', 'dragonball', 'dragonballimpact', 'firepunch',
  'axe', 'axeimpact', 'flamethrower', 'cow', 'sheep', 'superoveja',
  'superoveja-vuelo', 'pigeon', 'oldwoman', 'skunk', 'holygrenade',
  'holygrenadeimpact', 'grenadeimpact', 'banana', 'minearm', 'mineimpact',
  'minetick', 'petrol', 'sizzle', 'ricochet', 'homing', 'crossimpact',
  'gusano-impacto', 'gusano-quemado', 'gusano-pop'];
function cargarSonidos() {
  for (const n of SFX_NOMBRES) {
    const a = new Audio('assets/sfx/' + n + '.wav');
    a.preload = 'auto';
    SFX[n] = a;
  }
}
function sonido(nombre, vol = 0.5, vel = 1) {
  const base = SFX[nombre];
  if (!base) return;
  try {
    const a = base.cloneNode(true);
    a.volume = clamp(vol, 0, 1);
    a.playbackRate = vel;
    a.play().catch(() => {});
  } catch (e) { /* sin audio */ }
}

// ─────────────────────────────────────────────────────────────────────
// Terreno (máscaras precalculadas en assets/maps/maps.js)
// ─────────────────────────────────────────────────────────────────────
class Terreno {
  constructor(meta) {
    this.meta = meta;
    this.w = meta.w;
    this.h = meta.h;
    this.filas = MASCARAS[meta.id] || [];
    this.img = imagen(meta.archivo);
  }
  solido(x, y) {
    if (y < 0) return false;
    if (x < 0 || x >= this.w) return true;
    if (y >= this.h) return false;
    const runs = this.filas[y | 0];
    if (!runs || !runs.length) return false;
    let lo = 0, hi = runs.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      const s = runs[m][0], l = runs[m][1];
      if (x < s) hi = m - 1;
      else if (x >= s + l) lo = m + 1;
      else return true;
    }
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Estado
// ─────────────────────────────────────────────────────────────────────
const G = {
  estado: 'menu',             // menu | jugando | pausa | fin
  fase: 'mover',              // mover | resolver | retirada
  mapa: null,
  terreno: null,
  mapaSel: 'crossing',
  equipos: [],
  gusanos: [],
  orden: [],
  turnoPtr: -1,
  activo: null,
  tiempo: TIEMPO_TURNO,
  retirada: 0,
  viento: 0,
  cajas: [],
  proyectiles: [],
  walkers: [],
  zonas: [],
  llamas: [],
  efectos: [],
  particulas: [],
  anillos: [],
  flotantes: [],
  cam: { x: 0, y: 0, zoom: 1, base: 1, auto: true, libre: 0 },
  armas: [],
  armaSel: 0,
  cba: true,
  cbaHecha: false,
  esquema: 'shopper',
  mecha: 3,
  panelArmas: true,
  online: false,
  usadoSoga: false,
  cargando: false,
  carga: 0,
  armaCargando: null,
  fuegoPrev: false,
  fuegoRaton: false,
  raton: { x: 0, y: 0, dentro: false },
  tactil: false,
  sacudir: 0,
  ayuda: true,
  msgTurno: 0,
  hudTick: 0,
  crateTimer: 5,
  config: { equipos: 2, gusanos: 3, hp: VIDA, turno: TIEMPO_TURNO },
};

// Online: el servidor administra la sala y los turnos. El que tiene el turno
// simula y manda snapshots; los demás solo los aplican y dibujan.
const ONLINE = {
  socket: null, enlazado: false, activo: false, id: null, miSeat: -1,
  turno: -1, esMiTurno: false, esperando: false, soyCreador: false,
  estado: 'lobby', sala: null, jugadores: [], mapa: 'crossing',
  listo: false, chat: [], revancha: [], viento: 0, ronda: 1,
  ultimoEnvio: 0, finEnviado: false, paso: 0, error: null,
  pendiente: null, cargando: false,
};
const teclas = {};

// ─────────────────────────────────────────────────────────────────────
// Gusano
// ─────────────────────────────────────────────────────────────────────
let idGusano = 0;
class Gusano {
  constructor(equipo, idx, x, y) {
    this.id = ++idGusano;
    this.equipo = equipo;
    this.idx = idx;
    this.nombre = 'Gusano ' + (idx + 1);
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.hp = G.config.hp;
    this.hpMax = G.config.hp;
    this.muerto = false;
    this.causa = null;
    this.muerteT = 0;
    this.hundiendo = 0;
    this.enPiso = false;
    this.mirando = 1;
    this.ultimaDir = 1;
    this.aim = -Math.PI / 2;
    this.paso = 0;
    this.saltoApretado = false;
    this.saltoT = 0;
    this.saltoPendiente = null;
    this.saltoPendienteT = 0;
    this.ultimoSalto = '';
    this.ultimoSaltoT = 0;
    this.volteretaApretada = false;
    this.caminando = false;
    this.animCaminar = 'wwalk';
    this.dirCaminar = 0;
    this.voltereta = 0;
    this.volteretaDur = 0.55;
    this.soga = { estado: 'none', ax: 0, ay: 0, hx: 0, hy: 0, dx: 0, dy: -1, recorrido: 0, len: 0, pivotes: [], bloqueada: false };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Colisiones y movimiento
// ─────────────────────────────────────────────────────────────────────
function chocaGusano(x, y) {
  const t = G.terreno;
  if (!t) return false;
  return t.solido(x, y - 9) || t.solido(x - 4, y - 6) || t.solido(x + 4, y - 6) ||
         t.solido(x - 5, y) || t.solido(x + 5, y) ||
         t.solido(x - 4, y + 6) || t.solido(x + 4, y + 6) || t.solido(x, y + 7);
}
function enPiso(x, y) {
  const t = G.terreno;
  if (!t) return false;
  return t.solido(x, y + 8) || t.solido(x - 4, y + 8) || t.solido(x + 4, y + 8);
}
// Distancia al piso más cercano por debajo del gusano, o 0 si no hay.
function buscarPiso(x, y, profundidad) {
  for (let d = 1; d <= profundidad; d++) if (enPiso(x, y + d)) return d;
  return 0;
}
// Al caminar, WA sigue el relieve: sube hasta 8 px y baja hasta 8 px.
function asentarPie(w, dir, profundidad) {
  if (enPiso(w.x, w.y)) return true;
  const d = buscarPiso(w.x + (dir || 0) * 2, w.y, profundidad);
  if (!d) return false;
  w.y += d;
  w.enPiso = true;
  return true;
}
// Al aterrizar, WA asienta el cuerpo con una sonda más profunda (16 px).
function asentarTrasCaer(w) {
  if (enPiso(w.x, w.y)) { w.enPiso = true; return true; }
  const d = buscarPiso(w.x + (w.ultimaDir || 0) * 2, w.y, ASENTAR_ABAJO);
  if (!d) return false;
  w.y += d;
  w.enPiso = true;
  return true;
}
function moverX(w, dx, modo) {
  modo = modo || 'aire';
  const signo = Math.sign(dx);
  let resto = Math.abs(dx);
  while (resto > 1e-6) {
    const p = Math.min(resto, 1) * signo;
    const nx = w.x + p;
    if (!chocaGusano(nx, w.y)) {
      w.x = nx;
      if (signo) w.ultimaDir = signo;
      if (modo === 'caminar') {
        // Bajar el escalón que quedó debajo; si no hay piso, empieza a caer.
        if (!enPiso(w.x, w.y)) asentarPie(w, signo, PASO_ABAJO);
        if (!enPiso(w.x, w.y)) w.enPiso = false;
      }
    } else {
      let libre = false;
      const maxSub = modo === 'caminar' ? PASO_ARRIBA : 1;
      for (let s = 1; s <= maxSub; s++) {
        if (!chocaGusano(nx, w.y - s) && !chocaGusano(w.x, w.y - s)) {
          w.y -= s; w.x = nx; libre = true;
          if (signo) w.ultimaDir = signo;
          if (modo !== 'caminar') w.vx *= 30 / 32;
          break;
        }
      }
      if (!libre && modo !== 'caminar') {
        // Paso diagonal hacia abajo: bajar un escalón sin frenar el impulso.
        if (!chocaGusano(nx, w.y + 1) && !chocaGusano(w.x, w.y + 1)) {
          w.y += 1; w.x = nx; libre = true;
          if (signo) w.ultimaDir = signo;
          w.vx *= 30 / 32;
        }
      }
      if (!libre) {
        if (modo === 'caminar') w.vx = 0;
        else { w.vx = -w.vx * REBOTE_GUSANO; if (Math.abs(w.vx) < 0.03) w.vx = 0; }
        return false;
      }
    }
    resto -= Math.min(resto, 1);
  }
  return true;
}
function moverY(w, dy, modo) {
  modo = modo || 'aire';
  const signo = Math.sign(dy);
  let resto = Math.abs(dy);
  while (resto > 1e-6) {
    const p = Math.min(resto, 1) * signo;
    const ny = w.y + p;
    if (!chocaGusano(w.x, ny)) {
      w.y = ny;
    } else {
      if (signo > 0) {
        const impacto = Math.abs(w.vy);
        w.vy = 0;
        if (!w.enPiso && impacto > 3) sonido('gusano-caida', 0.2, azar(0.95, 1.05));
        if (!w.enPiso && impacto > 10) {
          const d = Math.round((impacto - 10) * 5);
          if (d > 0) herir(w, d);
        }
        w.enPiso = true;
        asentarTrasCaer(w);
      } else {
        w.vy = 0;
      }
      return false;
    }
    resto -= Math.min(resto, 1);
  }
  return true;
}
// Altura de la superficie que hay debajo del gusano en esa columna.
function alturaPiso(x, y) {
  for (let d = 0; d <= 24; d++) if (G.terreno.solido(x, y + d)) return y + d;
  return null;
}
// WA elige cuerpo normal, cuesta arriba o cuesta abajo según el relieve.
function animCaminar(w, dir) {
  const y0 = alturaPiso(w.x, w.y);
  const y1 = alturaPiso(w.x + dir * 6, w.y);
  if (y0 == null || y1 == null) return 'wwalk';
  // wwalkd inclina la cola hacia abajo (cuesta arriba); wwalku la levanta
  // (cuesta abajo). Los sprites base miran a la izquierda y se espejan después.
  if (y1 < y0 - 1) return 'wwalkd';
  if (y1 > y0 + 1) return 'wwalku';
  return 'wwalk';
}
function movimientoNormal(w, control) {
  let dir = 0;
  if (control) dir = (teclas.izq ? -1 : 0) + (teclas.der ? 1 : 0);
  const caminaba = w.caminando;
  const dirAnterior = w.dirCaminar;
  w.caminando = false;
  if (dir) {
    // Shift + flecha: caminar de espaldas sin girar (moonwalk de WA).
    const moonwalk = !!(control && teclas.shift && dir === -w.mirando);
    if (!moonwalk) mirarHacia(w, dir);
    if (!caminaba || dir !== dirAnterior) w.paso = 0;
    w.dirCaminar = dir;
    const enPisoAntes = w.enPiso;
    const frame = ((Math.floor(w.paso) % 15) + 15) % 15;
    const paso = enPisoAntes ? PATRON_CAMINAR[frame] * ESCALA_PATRON : CAMINAR;
    moverX(w, dir * paso, enPisoAntes ? 'caminar' : 'aire');
    if (enPisoAntes && w.enPiso) {
      w.caminando = true;
      w.animCaminar = animCaminar(w, dir);
      w.paso += PASO_CAMINAR;
      if (Math.random() < 0.05) sonido('walk-expand', 0.035, azar(1.4, 1.7));
    }
  } else {
    if (caminaba) w.paso = 0;
    w.dirCaminar = 0;
    w.animCaminar = 'wwalk';
  }

  if (w.enPiso) {
    // En el piso no hace falta volver a integrar gravedad; sólo seguir el relieve.
    if (!dir) {
      w.vy += GRAVEDAD;
      moverY(w, w.vy, 'aire');
      asentarTrasCaer(w);
    }
    if (w.enPiso) {
      w.vx *= ROZAMIENTO;
      if (Math.abs(w.vx) < 0.05) w.vx = 0;
    }
  } else {
    w.vy += GRAVEDAD;
    if (w.vy > VEL_MAX_GUSANO) w.vy = VEL_MAX_GUSANO;
    if (Math.abs(w.vx) > 0.01) moverX(w, clamp(w.vx, -VEL_MAX_GUSANO, VEL_MAX_GUSANO), 'aire');
    moverY(w, w.vy, 'aire');
    if (!w.enPiso) {
      w.vx *= 0.999;
      w.saltoT += TICK;
    } else {
      asentarTrasCaer(w);
      w.vx *= ROZAMIENTO;
      if (Math.abs(w.vx) < 0.05) w.vx = 0;
    }
  }
  w.vx = clamp(w.vx, -VEL_MAX_GUSANO, VEL_MAX_GUSANO);
  if (w.enPiso && !enPiso(w.x, w.y)) w.enPiso = false;
}
// Saca al gusano del terreno por el lado más cercano. Es sólo un rescate:
// el movimiento normal ya resuelve los choques con la respuesta de WA.
function resolverColision(w) {
  if (!chocaGusano(w.x, w.y)) return false;
  let mejor = null;
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    for (let d = 1; d <= 24; d++) {
      if (!chocaGusano(w.x + dx * d, w.y + dy * d)) {
        if (!mejor || d < mejor.d) mejor = { d, dx, dy };
        break;
      }
    }
  }
  if (!mejor) { w.y -= 24; w.vy = 0; return true; }
  w.x += mejor.dx * mejor.d;
  w.y += mejor.dy * mejor.d;
  if (mejor.dy !== 0) w.vy = 0; else w.vx = 0;
  w.vx *= 0.6;
  w.vy *= 0.6;
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Daño / muerte / textos flotantes
// ─────────────────────────────────────────────────────────────────────
function flotante(x, y, texto, color) {
  G.flotantes.push({ x, y, texto, color, vida: 1.1, max: 1.1 });
}
function herir(w, dano) {
  if (w.muerto) return;
  dano = Math.round(dano);
  if (dano <= 0) return;
  w.hp -= dano;
  if (dano >= 3) flotante(w.x, w.y - 18, '-' + dano, '#ffd27a');
  if (w.hp <= 0) { w.hp = 0; matar(w, 'dano'); }
}
function matar(w, causa) {
  if (w.muerto) return;
  w.muerto = true;
  w.causa = causa || 'dano';
  w.muerteT = 0;
  w.saltoPendiente = null;
  w.saltoPendienteT = 0;
  w.ultimoSalto = '';
  w.ultimoSaltoT = 0;
  w.soga.estado = 'none';
  w.soga.pivotes = [];
  w.soga.bloqueada = false;
  if (causa === 'agua') {
    w.hundiendo = 0.001;
    sonido('splash', 0.55, azar(0.94, 1.06));
    flotante(w.x, MUNDO.agua - 16, 'SPLASH', '#8fd4ff');
  } else {
    sonido('gusano-pop', 0.45, azar(0.95, 1.05));
    sonido('explosion3', 0.12, azar(1.25, 1.4));
    for (let i = 0; i < 18; i++) {
      G.particulas.push({
        x: w.x, y: w.y, vx: azar(-4, 4), vy: azar(-6, 1),
        vida: azar(0.5, 1.1), max: 1.1, tam: azar(1.5, 3.5),
        color: i % 3 ? '#e9a7ad' : '#b9717a',
      });
    }
    flotante(w.x, w.y - 20, '¡MUERTO!', '#ff6b5a');
  }
  if (G.activo === w) {
    G.fase = 'resolver';
    G.cargando = false;
    G.carga = 0;
  }
}
function ahogar(w) {
  if (w.muerto) return;
  matar(w, 'agua');
}

// ─────────────────────────────────────────────────────────────────────
// Soga: garfio, péndulo y enrollado en el terreno
// ─────────────────────────────────────────────────────────────────────
function rutaSoga(s) {
  let px = s.ax, py = s.ay, usado = 0;
  for (const p of s.pivotes) {
    usado += Math.hypot(p.x - px, p.y - py);
    px = p.x; py = p.y;
  }
  return { px, py, usado, disponible: Math.max(0, s.len - usado) };
}
function lineaSogaLibre(x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(2, Math.ceil(d / 1.5));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (G.terreno.solido(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}
// Primer choque de un segmento contra el terreno. Devuelve el último punto libre
// (donde va el gancho o el pivote) y el punto ya dentro del terreno.
function primerChoqueSegmento(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) return null;
  const n = Math.max(2, Math.ceil(d / 0.75));
  let lo = 0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (G.terreno.solido(x1 + dx * t, y1 + dy * t)) {
      let hi = t;
      for (let k = 0; k < 7; k++) {
        const m = (lo + hi) / 2;
        if (G.terreno.solido(x1 + dx * m, y1 + dy * m)) hi = m; else lo = m;
      }
      return {
        x: x1 + dx * lo, y: y1 + dy * lo,
        hx: x1 + dx * hi, hy: y1 + dy * hi,
        ux: dx / d, uy: dy / d,
      };
    }
    lo = t;
  }
  return null;
}
function direccionSoga(w) {
  let dx = Math.cos(w.aim), dy = Math.sin(w.aim);
  // Con 5 estrellas se puede disparar hasta 90° respecto de la vertical:
  // nunca por debajo de la horizontal.
  if (dy > -0.015) {
    dy = -0.015;
    const n = Math.hypot(dx, dy) || 1;
    dx /= n; dy /= n;
  }
  return { dx, dy };
}
function dispararGarfio(w) {
  if (w.soga.estado !== 'none') return;
  const d = direccionSoga(w);
  w.soga = {
    estado: 'disparando', ax: 0, ay: 0,
    hx: w.x, hy: w.y - 2, dx: d.dx, dy: d.dy, recorrido: 0,
    len: 0, pivotes: [], bloqueada: false,
  };
  G.usadoSoga = true;
  sonido('soga-disparo', 0.42, azar(0.97, 1.03));
}
function avanzarGarfio(w) {
  const s = w.soga;
  for (let i = 0; i < VEL_GARFIO; i++) {
    const nx = s.hx + s.dx;
    const ny = s.hy + s.dy;
    const choque = primerChoqueSegmento(s.hx, s.hy, nx, ny);
    if (choque) {
      const d = Math.hypot(choque.x - w.x, choque.y - (w.y - 2));
      if (d < 20) { s.estado = 'none'; return; }
      // El ancla queda en el último píxel libre, nunca dentro de la pared.
      let ax = choque.x, ay = choque.y;
      for (let k = 0; k < 4 && G.terreno.solido(ax, ay); k++) { ax -= s.dx; ay -= s.dy; }
      if (G.terreno.solido(ax, ay) || !lineaSogaLibre(w.x, w.y - 2, ax, ay)) {
        s.estado = 'none';
        return;
      }
      s.estado = 'atada';
      s.ax = ax; s.ay = ay;
      s.hx = ax; s.hy = ay;
      s.len = clamp(d, LARGO_SOGA_MIN, LARGO_SOGA_MAX);
      s.pivotes = [];
      s.bloqueada = false;
      sonido('soga-impacto', 0.5, azar(0.98, 1.04));
      return;
    }
    s.hx = nx; s.hy = ny;
    s.recorrido += 1;
    if (s.recorrido >= LARGO_SOGA_MAX || s.hx < -60 || s.hx > MUNDO.w + 60 || s.hy < -300) {
      s.estado = 'none';
      return;
    }
  }
}
function soltarSoga(w) {
  if (w.soga.estado === 'none') return;
  w.soga.estado = 'none';
  w.soga.pivotes = [];
  w.soga.bloqueada = false;
  sonido('throwrelease', 0.28, azar(0.95, 1.1));
}
function toggleSoga(w) {
  if (w.soga.estado === 'none' || w.soga.estado === 'atada') {
    if (w.soga.estado === 'atada') soltarSoga(w);
    else dispararGarfio(w);
  } else {
    w.soga.estado = 'none';
  }
}
// Acortar la soga tira del gusano, pero nunca lo arrastra dentro del terreno.
function caminoGusanoLibre(w, tx, ty) {
  const dx = tx - w.x, dy = ty - w.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return true;
  const n = Math.ceil(d);
  for (let i = 1; i <= n; i++) {
    if (chocaGusano(w.x + dx * i / n, w.y + dy * i / n)) return false;
  }
  return true;
}
function acortarSoga(w) {
  const s = w.soga;
  const nuevo = Math.max(LARGO_SOGA_MIN, s.len - ACORTAR);
  if (nuevo >= s.len - 1e-4) return;
  const r = rutaSoga(s);
  const disp = Math.max(0, nuevo - r.usado);
  const dx = w.x - r.px, dy = w.y - r.py;
  const d = Math.hypot(dx, dy);
  if (d > disp + 0.01) {
    const nx = dx / d, ny = dy / d;
    const tx = r.px + nx * disp, ty = r.py + ny * disp;
    if (!caminoGusanoLibre(w, tx, ty)) return;
    w.x = tx; w.y = ty;
    const vr = w.vx * nx + w.vy * ny;
    if (vr > 0) { w.vx -= nx * vr; w.vy -= ny * vr; }
  }
  s.len = nuevo;
}
function alargarSoga(w) {
  w.soga.len = Math.min(LARGO_SOGA_MAX, w.soga.len + ALARGAR);
}
function podarPivotes(w) {
  const s = w.soga;
  while (s.pivotes.length) {
    const prev = s.pivotes.length > 1 ? s.pivotes[s.pivotes.length - 2] : { x: s.ax, y: s.ay };
    if (lineaSogaLibre(w.x, w.y, prev.x, prev.y)) s.pivotes.pop();
    else break;
  }
}
function cercaDeTerreno(x, y, r) {
  for (let d = 1; d <= r; d++) {
    if (G.terreno.solido(x + d, y) || G.terreno.solido(x - d, y) ||
        G.terreno.solido(x, y + d) || G.terreno.solido(x, y - d) ||
        G.terreno.solido(x + d, y + d) || G.terreno.solido(x - d, y + d) ||
        G.terreno.solido(x + d, y - d) || G.terreno.solido(x - d, y - d)) return true;
  }
  return false;
}
// La primera cara de la pared no sirve como pivote: hay que enganchar en el
// vértice desde donde el gusano queda visible. Probamos puntos libres cerca del
// primer choque y nos quedamos con el camino más corto que no cruce terreno.
function buscarPivote(w, r, choque) {
  const R = 200, paso = 5;
  const x0 = Math.max(0, Math.floor(choque.x - R));
  const x1 = Math.min(MUNDO.w - 1, Math.ceil(choque.x + R));
  const y0 = Math.max(0, Math.floor(choque.y - R));
  const y1 = Math.min(MUNDO.h - 1, Math.ceil(choque.y + R));
  let mejor = null;
  const probar = (x, y) => {
    if (G.terreno.solido(x, y) || !cercaDeTerreno(x, y, 6)) return;
    if (Math.hypot(x - w.x, y - w.y) < 10) return;
    if (Math.hypot(x - r.px, y - r.py) < 8) return;
    const ultimo = w.soga.pivotes[w.soga.pivotes.length - 1];
    if (ultimo && Math.hypot(x - ultimo.x, y - ultimo.y) < 8) return;
    if (!lineaSogaLibre(r.px, r.py, x, y)) return;
    if (!lineaSogaLibre(x, y, w.x, w.y)) return;
    const total = Math.hypot(x - r.px, y - r.py) + Math.hypot(x - w.x, y - w.y);
    if (!mejor || total < mejor.total) mejor = { x, y, total };
  };
  for (let x = x0; x <= x1; x += paso) {
    for (let y = y0; y <= y1; y += paso) probar(x, y);
  }
  // Afinar alrededor del mejor punto para que la soga quede pegada al vértice.
  if (mejor) {
    const bx = mejor.x, by = mejor.y;
    for (let x = Math.max(x0, bx - paso); x <= Math.min(x1, bx + paso); x++) {
      for (let y = Math.max(y0, by - paso); y <= Math.min(y1, by + paso); y++) probar(x, y);
    }
  }
  return mejor;
}
function actualizarPivotes(w) {
  const s = w.soga;
  podarPivotes(w);
  s.bloqueada = false;
  // Si no hay camino posible, no repetir la búsqueda en cada tick mientras
  // el gusano casi no se movió.
  if (s.sinPivote && Math.hypot(w.x - s.sinPivote.x, w.y - s.sinPivote.y) < 6) {
    s.bloqueada = true;
    return;
  }
  for (let i = 0; i < 4; i++) {
    const r = rutaSoga(s);
    if (lineaSogaLibre(r.px, r.py, w.x, w.y)) { s.sinPivote = null; break; }
    const choque = primerChoqueSegmento(r.px, r.py, w.x, w.y);
    if (!choque) { s.sinPivote = null; break; }
    const p = buscarPivote(w, r, choque);
    if (!p) { s.bloqueada = true; s.sinPivote = { x: w.x, y: w.y }; break; }
    s.sinPivote = null;
    s.pivotes.push({ x: p.x, y: p.y });
  }
}
function restringirSoga(w) {
  const s = w.soga;
  const r = rutaSoga(s);
  if (s.bloqueada && !lineaSogaLibre(r.px, r.py, w.x, w.y)) return;
  const dx = w.x - r.px, dy = w.y - r.py;
  const d = Math.hypot(dx, dy);
  if (d <= r.disponible + 0.01 || d < 1e-4) return;
  const nd = Math.max(0, r.disponible);
  let nx = dx / d, ny = dy / d;
  let tx = r.px + nx * nd, ty = r.py + ny * nd;
  // Si la posición tensa cae dentro del terreno, buscar el ángulo libre más
  // cercano alrededor del pivote (la soga se desliza por el borde).
  if (!caminoGusanoLibre(w, tx, ty)) {
    const base = Math.atan2(ny, nx);
    let libre = null;
    for (let k = 1; k <= 16 && !libre; k++) {
      for (const sg of [-1, 1]) {
        const a = base + sg * k * 0.035;
        const x = r.px + Math.cos(a) * nd, y = r.py + Math.sin(a) * nd;
        if (caminoGusanoLibre(w, x, y)) { libre = { x, y, nx: Math.cos(a), ny: Math.sin(a) }; break; }
      }
    }
    if (!libre) return;
    tx = libre.x; ty = libre.y; nx = libre.nx; ny = libre.ny;
  }
  w.x = tx; w.y = ty;
  if (w.enPiso && !enPiso(w.x, w.y)) w.enPiso = false;
  const vr = w.vx * nx + w.vy * ny;
  if (vr > 0) { w.vx -= nx * vr; w.vy -= ny * vr; }
}
function fisicaSoga(w, control) {
  const s = w.soga;
  if (!s || s.estado !== 'atada') return;
  if (control) {
    if (teclas.arriba) acortarSoga(w);
    if (teclas.abajo) alargarSoga(w);
    const dir = (teclas.izq ? -1 : 0) + (teclas.der ? 1 : 0);
    if (dir) {
      const r = rutaSoga(s);
      const dx = w.x - r.px, dy = w.y - r.py;
      const d = Math.hypot(dx, dy) || 1;
      let tx = -dy / d, ty = dx / d;
      if (tx * dir < 0) { tx = -tx; ty = -ty; }
      w.vx += tx * HAMACAR;
      w.vy += ty * HAMACAR;
    }
  }

  w.vy += GRAVEDAD;
  w.vx = clamp(w.vx, -VEL_MAX_GUSANO, VEL_MAX_GUSANO);
  w.vy = clamp(w.vy, -VEL_MAX_GUSANO, VEL_MAX_GUSANO);

  const sub = Math.max(1, Math.ceil(Math.max(Math.abs(w.vx), Math.abs(w.vy))));
  for (let k = 0; k < sub; k++) {
    moverX(w, w.vx / sub, 'aire');
    moverY(w, w.vy / sub, 'aire');
    actualizarPivotes(w);
    restringirSoga(w);
  }
  if (w.enPiso) {
    if (!enPiso(w.x, w.y)) w.enPiso = false;
    else {
      w.vx *= ROZAMIENTO;
      if (Math.abs(w.vx) < 0.05) w.vx = 0;
    }
  }
  if (w.y > MUNDO.agua + 2) ahogar(w);
}

// ─────────────────────────────────────────────────────────────────────
// Armas
// ─────────────────────────────────────────────────────────────────────
const DEF_ARMAS = {
  bazooka:    { nombre: 'Bazooka',            clase: 'proyectil', sprite: 'missile',    radio: 46, dano: 46, empuje: 15, vmin: 5,  vmax: 15, viento: 0.0008, carga: true, infinito: true },
  granada:    { nombre: 'Granada',            clase: 'proyectil', sprite: 'grenade',    radio: 40, dano: 42, empuje: 13, vmin: 6,  vmax: 14, mecha: 3, rebote: 0.42, viento: 0.0004, carga: true },
  cluster:    { nombre: 'Bomba de racimo',    clase: 'proyectil', sprite: 'cluster',    radio: 36, dano: 30, empuje: 11, vmin: 6,  vmax: 14, mecha: 3, rebote: 0.40, split: 5, splitSprite: 'cluster', viento: 0.0004, carga: true },
  mortero:    { nombre: 'Mortero',            clase: 'proyectil', sprite: 'mortar',     radio: 46, dano: 48, empuje: 15, vmin: 8,  vmax: 16, viento: 0.0004, carga: true },
  misil:      { nombre: 'Misil',              clase: 'proyectil', sprite: 'missile',    radio: 44, dano: 42, empuje: 14, vmin: 3,  vmax: 8,  hongea: true, viento: 0.0002, carga: true },
  zorrino:    { nombre: 'Zorrino',            clase: 'walker',    sprite: 'skunk1',     radio: 42, dano: 35, empuje: 12, mecha: 4, velocidad: 1.1, gas: true },
  nafta:      { nombre: 'Bomba de nafta',     clase: 'proyectil', sprite: 'petrolbm',   radio: 38, dano: 35, empuje: 11, vmin: 6,  vmax: 14, mecha: 2.5, rebote: 0.40, fuego: true, carga: true },
  banana:     { nombre: 'Bomba de banana',    clase: 'proyectil', sprite: 'banana',     radio: 34, dano: 28, empuje: 10, vmin: 6,  vmax: 14, mecha: 3, rebote: 0.40, split: 5, splitSprite: 'sbanana', viento: 0.0004, carga: true },
  escopeta:   { nombre: 'Escopeta',           clase: 'hitscan',   disparos: 2, dano: 24, alcance: 420, dispersion: 0.008 },
  minigun:    { nombre: 'Ametralladora',      clase: 'hitscan',   disparos: 6, dano: 7,  alcance: 520, dispersion: 0.06 },
  arco:       { nombre: 'Arco largo',         clase: 'proyectil', sprite: 'arrow',      directo: 35, vmin: 10, vmax: 18, viento: 0.0012, rotar: true, carga: true },
  mina:       { nombre: 'Mina',               clase: 'colocada',  sprite: 'mineon',     radio: 40, dano: 48, empuje: 12 },
  punofuego:  { nombre: 'Puño de fuego',      clase: 'melee',     alcance: 34, dano: 30, empuje: 12, avance: 10, fuego: true },
  boladragon: { nombre: 'Bola de dragón',     clase: 'melee',     alcance: 48, dano: 32, empuje: 18, fuego: true },
  hacha:      { nombre: 'Hacha de guerra',    clase: 'melee',     alcance: 32, dano: 30, empuje: 10 },
  dinamita:   { nombre: 'Dynamita',           clase: 'colocada',  sprite: 'dynamite',   radio: 72, dano: 75, empuje: 22, mecha: 5 },
  oveja:      { nombre: 'Oveja',              clase: 'walker',    sprite: 'sheepwlk',   radio: 46, dano: 50, empuje: 16, mecha: 5, velocidad: 1.35 },
  bate:       { nombre: 'Bate de béisbol',    clase: 'melee',     alcance: 32, dano: 28, empuje: 22 },
  lanzallamas:{ nombre: 'Lanzallamas',        clase: 'llama',     duracion: 0.9 },
  paloma:     { nombre: 'Paloma mensajera',   clase: 'proyectil', sprite: 'pigeonr0',   radio: 36, dano: 35, empuje: 12, vmin: 5, vmax: 10, hongea: true },
  vaca:       { nombre: 'Vaca loca',          clase: 'walker',    sprite: 'cowwalk',    radio: 60, dano: 65, empuje: 20, mecha: 6, velocidad: 1.1 },
  sagrada:    { nombre: 'Granada sagrada',    clase: 'proyectil', sprite: 'hgrenade',   radio: 88, dano: 80, empuje: 24, vmin: 5, vmax: 13, mecha: 3, rebote: 0.40, carga: true },
  viejita:    { nombre: 'Viejita',            clase: 'walker',    sprite: 'woman',      radio: 42, dano: 45, empuje: 14, mecha: 5, velocidad: 0.9 },
  lanzovejas: { nombre: 'Lanzadora de ovejas',clase: 'proyectil', sprite: 'sheeplau',   radio: 42, dano: 45, empuje: 16, vmin: 8, vmax: 16, viento: 0.0008, carga: true },
  superoveja: { nombre: 'Superoveja',         clase: 'proyectil', sprite: 'spsheep1',   radio: 52, dano: 55, empuje: 18, vmin: 4, vmax: 8, hongea: true, carga: true },
};
for (const [id, def] of Object.entries(DEF_ARMAS)) def.id = id;

// Tabla de armas de las cajas (24 armas, suma 78)
const TABLA_CAJA = [
  ['misil', 3], ['mortero', 2], ['granada', 4], ['cluster', 4], ['zorrino', 1],
  ['nafta', 3], ['banana', 1], ['escopeta', 4], ['minigun', 4], ['arco', 4],
  ['mina', 4], ['punofuego', 4], ['boladragon', 4], ['hacha', 3], ['dinamita', 3],
  ['oveja', 4], ['bate', 4], ['lanzallamas', 4], ['paloma', 3], ['vaca', 2],
  ['sagrada', 3], ['viejita', 3], ['lanzovejas', 4], ['superoveja', 3],
];
const ORDEN_ARMAS = TABLA_CAJA.map(x => x[0]);
const CANTIDAD_CAJA = { granada: 2, escopeta: 2, mina: 2, cluster: 1, banana: 1 };

function armaDeCaja() {
  let r = Math.random() * 78;
  for (const [id, peso] of TABLA_CAJA) {
    r -= peso;
    if (r <= 0) return id;
  }
  return TABLA_CAJA[0][0];
}

function gusanoEn(x, y, r) {
  for (const w of G.gusanos) {
    if (!w.muerto && dist(x, y, w.x, w.y - 2) < r) return w;
  }
  return null;
}
function ejecutarArma(id, potencia) {
  const w = G.activo;
  if (!w || w.muerto) return;
  const def = DEF_ARMAS[id];
  if (!def) return;
  if (!def.infinito) {
    const eq = G.equipos[w.equipo];
    eq.municion[id] = Math.max(0, (eq.municion[id] || 0) - 1);
  }
  switch (def.clase) {
    case 'proyectil': lanzarProyectil(w, def, potencia); break;
    case 'colocada': colocarCarga(w, def); break;
    case 'walker': crearWalker(w, def); break;
    case 'hitscan': disparoHitscan(w, def); break;
    case 'melee': golpeMelee(w, def); break;
    case 'llama': lanzarLlamas(w, def); break;
  }
  atacarHecho();
  if (!def.infinito) actualizarArmas();
}
function lanzarProyectil(w, def, potencia) {
  const ang = w.aim;
  const v = def.vmin + (def.vmax - def.vmin) * clamp(potencia, 0, 1);
  const x = w.x + Math.cos(ang) * 12;
  const y = w.y + Math.sin(ang) * 12 - 2;
  const mecha = def.mecha != null && def.rebote ? G.mecha : (def.mecha != null ? def.mecha : null);
  G.proyectiles.push({
    def, dueno: w.equipo, x, y,
    vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
    edad: 0,
    mecha,
    rebote: def.rebote || 0,
    hongea: !!def.hongea,
    sprite: def.sprite,
    frame: 0,
    quieto: false,
    rot: ang,
    sub: false,
  });
  if (def.id === 'arco') sonido('bow', 0.5, azar(0.97, 1.03));
  else if (def.id === 'sagrada') sonido('holygrenade', 0.5, azar(0.97, 1.03));
  else if (def.id === 'superoveja') {
    sonido('superoveja', 0.5, azar(0.97, 1.03));
    sonido('superoveja-vuelo', 0.32, azar(0.95, 1.05));
  } else if (def.id === 'lanzovejas') {
    sonido('throwrelease', 0.42, azar(0.95, 1.05));
    sonido('sheep', 0.26, azar(1.08, 1.18));
  } else if (def.id === 'paloma') {
    sonido('throwrelease', 0.4, azar(0.95, 1.05));
    sonido('pigeon', 0.34, azar(0.98, 1.05));
  } else sonido('throwrelease', 0.45, azar(0.95, 1.05));
  if (def.hongea) sonido('homing', 0.2, azar(1.0, 1.08));
}
function colocarCarga(w, def) {
  if (def.id === 'mina') {
    G.proyectiles.push({
      def, dueno: w.equipo, x: w.x, y: w.y + 4, vx: 0, vy: 0,
      edad: 0, mecha: null, rebote: 0, quieto: true, armada: false,
      sprite: 'mineon', frame: 0, rot: 0, sub: false,
    });
  } else {
    G.proyectiles.push({
      def, dueno: w.equipo, x: w.x, y: w.y + 3, vx: 0, vy: 0,
      edad: 0, mecha: def.mecha, rebote: 0, quieto: true, armada: true,
      sprite: 'dynamite', frame: 0, rot: 0, sub: false,
    });
  }
  sonido(def.id === 'mina' ? 'minearm' : 'fuse', def.id === 'mina' ? 0.45 : 0.4);
}
function disparoHitscan(w, def) {
  const n = def.disparos || 1;
  let impactos = 0;
  for (let i = 0; i < n; i++) {
    const ang = w.aim + azar(-1, 1) * (def.dispersion || 0.01);
    const max = def.alcance || 400;
    const x0 = w.x + Math.cos(ang) * 10;
    const y0 = w.y + Math.sin(ang) * 10 - 2;
    let x = x0, y = y0, hit = null;
    for (let d = 0; d < max; d += 2) {
      const nx = x + Math.cos(ang) * 2;
      const ny = y + Math.sin(ang) * 2;
      if (G.terreno.solido(nx, ny)) break;
      x = nx; y = ny;
      const g = gusanoEn(x, y, 7);
      if (g) { hit = g; break; }
    }
    G.efectos.push({ tipo: 'linea', x1: x0, y1: y0, x2: x, y2: y, vida: 0.12, max: 0.12, color: '#ffe9a8' });
    if (hit) {
      herir(hit, def.dano);
      impactos++;
      hit.vx += Math.cos(ang) * 1.2;
      hit.vy += Math.sin(ang) * 0.6 - 0.5;
      hit.enPiso = false;
    }
  }
  if (def.id === 'escopeta') {
    sonido('shotgun', 0.55, azar(0.97, 1.03));
    setTimeout(() => sonido('shotgunreload', 0.22, azar(1.0, 1.06)), 280);
  } else if (def.id === 'minigun') {
    sonido('minigun', 0.45, azar(0.98, 1.04));
  } else {
    sonido('explosion3', 0.16, 1.9);
  }
  if (impactos) sonido('gusano-impacto', 0.3, azar(0.96, 1.04));
}
function golpeMelee(w, def) {
  const ang = w.aim;
  const alcance = def.alcance || 32;
  const x = w.x + Math.cos(ang) * alcance * 0.7;
  const y = w.y + Math.sin(ang) * alcance * 0.7;
  G.efectos.push({ tipo: 'golpe', x, y, r: alcance * 0.75, vida: 0.28, max: 0.28, color: def.fuego ? '#ff9a3c' : '#ffe9a8' });
  for (let i = 0; i < 12; i++) {
    const a = ang + azar(-0.7, 0.7);
    G.particulas.push({
      x, y, vx: Math.cos(a) * azar(1, 5), vy: Math.sin(a) * azar(1, 5) - 1,
      vida: azar(0.2, 0.5), max: 0.5, tam: azar(1.5, 3.5),
      color: def.fuego ? (i % 2 ? '#ffcf6a' : '#ff7a3c') : '#fff0c0',
    });
  }
  let golpeo = false;
  for (const o of G.gusanos) {
    if (o === w || o.muerto) continue;
    const dx = o.x - w.x, dy = o.y - w.y;
    if (Math.hypot(dx, dy) > alcance + 8) continue;
    if (Math.abs(normAng(Math.atan2(dy, dx) - ang)) > 1.05) continue;
    herir(o, def.dano);
    golpeo = true;
    o.vx += Math.cos(ang) * def.empuje;
    o.vy += Math.sin(ang) * def.empuje - 2.5;
    o.enPiso = false;
  }
  if (def.avance) moverX(w, Math.cos(ang) * def.avance);
  if (def.id === 'bate') {
    sonido('batswing', 0.5, azar(0.97, 1.03));
    if (golpeo) sonido('batimpact', 0.55, azar(0.96, 1.04));
  } else if (def.id === 'hacha') {
    sonido('axe', 0.5, azar(0.97, 1.03));
    if (golpeo) sonido('axeimpact', 0.55, azar(0.96, 1.04));
  } else if (def.id === 'boladragon') {
    sonido('dragonball', 0.5, azar(0.97, 1.03));
    if (golpeo) sonido('dragonballimpact', 0.55, azar(0.96, 1.04));
  } else if (def.id === 'punofuego') {
    if (golpeo) sonido('firepunch', 0.55, azar(0.97, 1.03));
    else sonido('throwrelease', 0.3, 1.2);
  } else {
    sonido('explosion3', 0.22, 1.6);
  }
}
function lanzarLlamas(w, def) {
  G.llamas.push({
    emisor: true,
    x: w.x + Math.cos(w.aim) * 10,
    y: w.y + Math.sin(w.aim) * 10 - 2,
    ang: w.aim,
    t: def.duracion || 0.9,
  });
  sonido('flamethrower', 0.5, azar(0.97, 1.03));
}
function crearWalker(w, def) {
  const dir = w.mirando;
  G.walkers.push({
    def, dueno: w.equipo,
    x: w.x + dir * 12, y: w.y,
    vx: 0, vy: 0, dir,
    vida: def.mecha || 5, edad: 0, frame: 0, gasT: 0.4, sub: false,
  });
  if (def.id === 'oveja') sonido('sheep', 0.45, azar(0.98, 1.05));
  else if (def.id === 'vaca') sonido('cow', 0.5, azar(0.95, 1.02));
  else if (def.id === 'viejita') sonido('oldwoman', 0.5, azar(0.97, 1.03));
  else if (def.id === 'zorrino') sonido('skunk', 0.45, azar(1.0, 1.1));
  else sonido('throwrelease', 0.4, 1.1);
}
function chocaWalker(x, y) {
  const t = G.terreno;
  return t.solido(x - 6, y + 7) || t.solido(x + 6, y + 7) ||
         t.solido(x, y - 6) || t.solido(x - 6, y) || t.solido(x + 6, y);
}

// ─────────────────────────────────────────────────────────────────────
// Explosiones, fuego y gas
// ─────────────────────────────────────────────────────────────────────
function explotar(x, y, radio, dano, empuje, color) {
  if (radio <= 0) return;
  sonido('explosion' + azarInt(1, 3), 0.55, azar(0.94, 1.06));
  G.sacudir = Math.max(G.sacudir, Math.min(22, radio * 0.25));
  G.anillos.push({ x, y, r: 6, max: radio * 1.15, vida: 1, color: color || '#ffd27a' });
  for (let i = 0; i < Math.min(42, Math.round(radio)); i++) {
    const a = azar(0, Math.PI * 2), v = azar(2, radio * 0.18);
    G.particulas.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5,
      vida: azar(0.35, 0.9), max: 0.9, tam: azar(1.5, 4),
      color: i % 4 === 0 ? '#fff2b0' : i % 3 === 0 ? '#ff9a3c' : '#d8503f',
    });
  }
  for (const w of G.gusanos) {
    if (w.muerto) continue;
    const d = dist(x, y, w.x, w.y);
    if (d >= radio) continue;
    const k = 1 - d / radio;
    const dm = Math.max(1, Math.round(dano * Math.pow(k, 1.05)));
    herir(w, dm);
    const a = Math.atan2(w.y - y, w.x - x);
    const f = empuje * k;
    w.vx += Math.cos(a) * f;
    w.vy += Math.sin(a) * f - 1.5;
    w.enPiso = false;
  }
}
function crearZona(x, y, r, vida, tipo, dps) {
  G.zonas.push({
    x, y: clamp(y, 10, MUNDO.agua - 6), r, vida, max: vida,
    tipo, dps, tick: 0.25, semilla: azar(0, 10),
  });
}
function explotarProyectil(p) {
  const def = p.def;
  if (def.id === 'banana') sonido('banana', 0.45, azar(0.97, 1.05));
  else if (def.id === 'nafta') sonido('petrol', 0.5, azar(0.97, 1.03));
  else if (def.id === 'sagrada') sonido('holygrenadeimpact', 0.55, azar(0.97, 1.03));
  if (def.split && !p.sub) {
    sonido('explosion1', 0.4, 1.2);
    const n = def.split;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.55 + azar(-0.12, 0.12);
      const v = azar(2.5, 4.5);
      G.proyectiles.push({
        def: Object.assign({}, def, {
          sub: true, split: 0, mecha: azar(0.4, 0.75),
          radio: (def.radio || 36) * 0.78,
          dano: (def.dano || 30) * 0.8,
          empuje: (def.empuje || 10) * 0.9,
          sprite: def.splitSprite || def.sprite,
        }),
        dueno: p.dueno,
        x: p.x, y: p.y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5,
        edad: 0, mecha: azar(0.4, 0.75), rebote: 0.45,
        hongea: false, sprite: def.splitSprite || def.sprite,
        frame: 0, quieto: false, rot: a, sub: true,
      });
    }
    return;
  }
  explotar(p.x, p.y, def.radio || 0, def.dano || 0, def.empuje || 0);
  if (def.fuego) {
    sonido('sizzle', 0.28, azar(0.95, 1.05));
    for (let i = 0; i < 3; i++) crearZona(p.x + azar(-36, 36), p.y, 34, 7, 'fuego', 13);
  }
  if (def.gas) crearZona(p.x, p.y, 70, 9, 'gas', 9);
}
function actualizarProyectiles() {
  for (let i = G.proyectiles.length - 1; i >= 0; i--) {
    const p = G.proyectiles[i];
    p.edad += TICK;

    if (p.quieto) {
      if (p.def.id === 'mina') {
        if (!p.armada && p.edad > 2) {
          p.armada = true;
          sonido('minearm', 0.35, 1.15);
        }
        if (p.armada && p.edad > 2.2) {
          p.bip = (p.bip == null ? 0.9 : p.bip) - TICK;
          if (p.bip <= 0) { p.bip = 1.15; sonido('minetick', 0.1); }
          let cerca = false;
          for (const w of G.gusanos) {
            if (!w.muerto && dist(p.x, p.y, w.x, w.y) < 24) { cerca = true; break; }
          }
          if (cerca) {
            sonido('mineimpact', 0.5, azar(0.97, 1.03));
            explotar(p.x, p.y, p.def.radio, p.def.dano, p.def.empuje);
            G.proyectiles.splice(i, 1);
          }
        }
      } else if (p.mecha != null) {
        p.mecha -= TICK;
        if (p.mecha <= 0) {
          explotar(p.x, p.y, p.def.radio, p.def.dano, p.def.empuje);
          G.proyectiles.splice(i, 1);
        }
      }
      continue;
    }

    if (p.mecha != null) {
      p.mecha -= TICK;
      if (p.mecha <= 0) {
        explotarProyectil(p);
        G.proyectiles.splice(i, 1);
        continue;
      }
    }

    if (p.hongea && p.edad > 0.25) {
      let objetivo = null, mejor = 900;
      for (const w of G.gusanos) {
        if (w.muerto || w.equipo === p.dueno) continue;
        const d = dist(p.x, p.y, w.x, w.y);
        if (d < mejor) { mejor = d; objetivo = w; }
      }
      if (objetivo) {
        const cur = Math.atan2(p.vy, p.vx);
        const des = Math.atan2(objetivo.y - p.y, objetivo.x - p.x);
        const na = cur + clamp(normAng(des - cur), -0.09, 0.09);
        const sp = Math.max(2.5, Math.hypot(p.vx, p.vy));
        p.vx = Math.cos(na) * sp;
        p.vy = Math.sin(na) * sp;
      }
    }

    p.vy += GRAVEDAD * (p.hongea ? 0.2 : 1);
    p.vx += G.viento * (p.def.viento || 0);
    p.vx *= 0.999;
    p.vy *= 0.999;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > VEL_MAX) { p.vx *= VEL_MAX / sp; p.vy *= VEL_MAX / sp; }
    if (p.def.rotar) p.rot = Math.atan2(p.vy, p.vx) + Math.PI / 2;

    const n = Math.max(1, Math.ceil(sp / 4));
    let choco = false;
    let directo = null;
    for (let k = 0; k < n; k++) {
      const nx = p.x + p.vx / n;
      const ny = p.y + p.vy / n;
      const sx = G.terreno.solido(nx, p.y);
      const sy = G.terreno.solido(p.x, ny);
      if (sx || sy) {
        if (p.rebote > 0) {
          if (sx) p.vx *= -p.rebote;
          if (sy) {
            p.vy *= -p.rebote;
            p.vx *= 0.9;
            if (Math.abs(p.vy) > 2) sonido('grenadeimpact', 0.16, azar(0.98, 1.08));
          }
        } else {
          choco = true;
          break;
        }
      } else {
        p.x = nx; p.y = ny;
      }
      const v = gusanoEn(p.x, p.y, 8);
      if (v && p.rebote <= 0) {
        if (p.def.directo) { directo = v; break; }
        choco = true;
        break;
      }
    }

    if (directo) {
      herir(directo, p.def.directo);
      if (p.def.id === 'arco') sonido('bowimpact', 0.5, azar(0.97, 1.03));
      else sonido('gusano-impacto', 0.35, azar(0.96, 1.04));
      directo.vx += Math.cos(Math.atan2(p.vy, p.vx)) * 2;
      directo.enPiso = false;
      G.proyectiles.splice(i, 1);
      continue;
    }
    if (choco) {
      if (p.def.id === 'arco') sonido('bowimpact', 0.42, azar(0.97, 1.03));
      explotarProyectil(p);
      G.proyectiles.splice(i, 1);
      continue;
    }
    if (p.y > MUNDO.agua + 4) {
      sonido('splash', 0.38, azar(0.94, 1.06));
      G.anillos.push({ x: p.x, y: MUNDO.agua, r: 3, max: 16, vida: 0.65, color: '#9fd6ff' });
      G.proyectiles.splice(i, 1);
      continue;
    }
    if (p.x < -180 || p.x > MUNDO.w + 180 || p.y > MUNDO.h + 160) {
      G.proyectiles.splice(i, 1);
    }
  }
}
function actualizarWalkers() {
  for (let i = G.walkers.length - 1; i >= 0; i--) {
    const e = G.walkers[i];
    e.edad += TICK;
    e.vida -= TICK;
    if (e.vida <= 0) {
      explotar(e.x, e.y, e.def.radio, e.def.dano, e.def.empuje);
      G.walkers.splice(i, 1);
      continue;
    }
    e.vy = Math.min(12, e.vy + GRAVEDAD);
    const nx = e.x + e.dir * e.def.velocidad;
    if (!chocaWalker(nx, e.y)) e.x = nx;
    else e.dir *= -1;
    const ny = e.y + e.vy;
    if (!chocaWalker(e.x, ny)) {
      e.y = ny;
    } else {
      if (e.vy > 0) {
        let s = 0;
        while (s < 12 && chocaWalker(e.x, e.y - s)) s++;
        e.y -= s;
      }
      e.vy = 0;
    }
    e.frame += e.def.velocidad * 0.35;
    if (e.def.gas) {
      e.gasT -= TICK;
      if (e.gasT <= 0) {
        e.gasT = 0.45;
        crearZona(e.x, e.y, 26, 5, 'gas', 8);
      }
    }
    if (e.y > MUNDO.agua + 4) {
      sonido('splash', 0.4, azar(0.95, 1.05));
      G.walkers.splice(i, 1);
    }
  }
}
function actualizarZonas() {
  for (let i = G.zonas.length - 1; i >= 0; i--) {
    const z = G.zonas[i];
    z.vida -= TICK;
    if (z.vida <= 0) { G.zonas.splice(i, 1); continue; }
    z.tick -= TICK;
    if (z.tick <= 0) {
      z.tick = 0.5;
      for (const w of G.gusanos) {
        if (!w.muerto && dist(z.x, z.y, w.x, w.y) < z.r) {
          herir(w, z.dps * 0.5);
        }
      }
    }
  }
}
function actualizarLlamas() {
  for (let i = G.llamas.length - 1; i >= 0; i--) {
    const p = G.llamas[i];
    if (p.emisor) {
      p.t -= TICK;
      for (let k = 0; k < 3; k++) {
        const a = p.ang + azar(-0.22, 0.22);
        G.llamas.push({
          x: p.x, y: p.y,
          vx: Math.cos(a) * azar(3, 6),
          vy: Math.sin(a) * azar(3, 6) - 0.4,
          vida: 0.5, max: 0.5, tam: azar(4, 9),
        });
      }
      if (p.t <= 0) G.llamas.splice(i, 1);
      continue;
    }
    p.vida -= TICK;
    if (p.vida <= 0) { G.llamas.splice(i, 1); continue; }
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.94;
    p.vy *= 0.94;
    if (G.terreno.solido(p.x, p.y)) p.vida = 0;
  }
  const golpes = new Map();
  for (const p of G.llamas) {
    if (p.emisor) continue;
    for (const w of G.gusanos) {
      if (!w.muerto && dist(p.x, p.y, w.x, w.y) < 13) {
        golpes.set(w, (golpes.get(w) || 0) + 0.12);
      }
    }
  }
  for (const [w, d] of golpes) if (d >= 0.4) herir(w, d);
}

// ─────────────────────────────────────────────────────────────────────
// Cajas (armamento)
// ─────────────────────────────────────────────────────────────────────
function soltarCaja() {
  const pts = (G.mapa && G.mapa.puntos) ? G.mapa.puntos.filter(p => p[1] < MUNDO.agua - 40) : [];
  if (!pts.length) return;
  const p = pts[azarInt(0, pts.length - 1)];
  let y = p[1] - 42;
  if (G.terreno.solido(p[0], y)) y = p[1] - 22;
  G.cajas.push({
    x: p[0], y, vy: 0, enPiso: false, edad: 0, sonado: false,
    giro: azar(-0.04, 0.04),
  });
}
function actualizarCajas() {
  for (let i = G.cajas.length - 1; i >= 0; i--) {
    const c = G.cajas[i];
    c.edad += TICK;
    if (!c.enPiso) {
      c.vy = Math.min(9, c.vy + GRAVEDAD * 1.8);
      c.y += c.vy;
      if (G.terreno.solido(c.x, c.y + 8)) {
        let s = 0;
        while (s < 24 && G.terreno.solido(c.x, c.y + 8 - s)) s++;
        c.y -= s;
        c.vy = 0;
        c.enPiso = true;
        if (!c.sonado) { sonido('crateimpact', 0.25, azar(0.9, 1.05)); c.sonado = true; }
      }
    }
    const w = G.activo;
    if (w && !w.muerto && dist(c.x, c.y, w.x, w.y) < 18) {
      recogerCaja(w);
      G.cajas.splice(i, 1);
      continue;
    }
    if (c.y > MUNDO.agua) G.cajas.splice(i, 1);
  }
}
function recogerCaja(w) {
  const id = armaDeCaja();
  const eq = G.equipos[w.equipo];
  const n = CANTIDAD_CAJA[id] || 1;
  eq.municion[id] = (eq.municion[id] || 0) + n;
  G.cbaHecha = true;
  sonido('collect', 0.55);
  sonido('cratepop', 0.32, azar(1, 1.1));
  flotante(w.x, w.y - 22, '+ ' + DEF_ARMAS[id].nombre, '#f2c14e');
  if (w === G.activo) { actualizarArmas(); actualizarHUD(); }
}

// ─────────────────────────────────────────────────────────────────────
// Turnos
// ─────────────────────────────────────────────────────────────────────
function contarEquiposVivos() {
  const s = new Set();
  for (const w of G.gusanos) if (!w.muerto) s.add(w.equipo);
  return s.size;
}
function sinPendientes() {
  return G.proyectiles.length === 0 && G.walkers.length === 0 && G.llamas.length === 0;
}
function atacarHecho() {
  G.fase = 'resolver';
  G.cargando = false;
  G.carga = 0;
  G.armaCargando = null;
}
function iniciarTurno(w, onlineTurno) {
  G.activo = w;
  G.fase = 'mover';
  G.tiempo = TIEMPO_TURNO;
  G.retirada = 0;
  G.cbaHecha = false;
  G.usadoSoga = false;
  G.cargando = false;
  G.carga = 0;
  G.armaCargando = null;
  G.cargaOrigen = null;
  G.armaSel = 0;
  w.soga.estado = 'none';
  w.soga.pivotes = [];
  w.soga.bloqueada = false;
  w.saltoPendiente = null;
  w.saltoPendienteT = 0;
  w.ultimoSalto = '';
  w.ultimoSaltoT = 0;
  w.saltoApretado = false;
  w.volteretaApretada = false;
  w.vx = 0;
  w.vy = 0;
  G.msgTurno = 1.5;
  if (!onlineTurno) {
    G.viento = azarInt(-70, 70);
    if (G.cajas.length < 3) soltarCaja();
  }
  actualizarArmas();
  actualizarHUD();
  if (!onlineTurno) toast('Turno de ' + nombreEquipo(w.equipo), 1300);
  avisarTurno();
  centrarCamara(true);
}
// En WA el inicio de turno se anuncia con el sonido de selección y el resorte
// del gusano. En online suena sólo cuando el turno es del jugador local.
function avisarTurno() {
  if (G.online && !ONLINE.esMiTurno) return;
  sonido('gusano-seleccion', 0.5);
  sonido('turno', 0.45);
}
function terminarTurno() {
  if (G.estado !== 'jugando') return;
  if (G.activo) {
    G.activo.soga.estado = 'none';
    G.activo.soga.pivotes = [];
    G.activo.soga.bloqueada = false;
    G.activo.saltoPendiente = null;
    G.activo.saltoPendienteT = 0;
    G.activo.ultimoSalto = '';
    G.activo.ultimoSaltoT = 0;
  }
  G.cargando = false;
  G.carga = 0;
  if (G.online) { enviarFinTurno(); return; }
  if (contarEquiposVivos() <= 1) { fin(); return; }
  for (let k = 1; k <= G.orden.length; k++) {
    const idx = (G.turnoPtr + k) % G.orden.length;
    const w = G.orden[idx];
    if (!w.muerto) {
      G.turnoPtr = idx;
      iniciarTurno(w);
      return;
    }
  }
  fin();
}
function actualizarTurno() {
  if (G.estado !== 'jugando') return;
  const w = G.activo;
  if (!w) return;

  if (G.fase === 'mover') {
    G.tiempo -= TICK;
    if (G.tiempo <= 0) {
      G.tiempo = 0;
      if (w.muerto) { terminarTurno(); return; }
      G.fase = 'retirada';
      G.retirada = G.usadoSoga ? RETIRADA_SOGA : RETIRADA;
      toast('RETIRADA · ' + Math.round(G.retirada) + 's', 1000);
      return;
    }
  } else if (G.fase === 'resolver') {
    if (!sinPendientes()) return;
    if (contarEquiposVivos() <= 1) { if (G.online) terminarTurno(); else fin(); return; }
    if (w.muerto) { terminarTurno(); return; }
    G.fase = 'retirada';
    G.retirada = G.usadoSoga ? RETIRADA_SOGA : RETIRADA;
    toast('RETIRADA · ' + Math.round(G.retirada) + 's', 900);
  } else if (G.fase === 'retirada') {
    G.retirada -= TICK;
    if (w.muerto) { terminarTurno(); return; }
    if (G.retirada <= 0) {
      if (contarEquiposVivos() <= 1) { if (G.online) terminarTurno(); else fin(); } else terminarTurno();
    }
  }
}
function fin() {
  if (G.estado === 'fin') return;
  G.estado = 'fin';
  const t = q('tactil');
  if (t) t.classList.add('hidden');
  const vivos = G.gusanos.filter(w => !w.muerto);
  const eq = vivos.length ? vivos[0].equipo : -1;
  const el = q('finTitulo'), txt = q('finTexto');
  if (eq >= 0) {
    el.textContent = 'GANÓ ' + nombreEquipo(eq).toUpperCase();
    el.style.color = EQUIPOS_DEF[eq].color;
    txt.textContent = 'Quedaron ' + vivos.length + ' gusano(s) en pie.';
  } else {
    el.textContent = 'EMPATE';
    el.style.color = '#ddd';
    txt.textContent = 'No quedó nadie vivo.';
  }
  q('fin').classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────────────
// Arsenal / HUD
// ─────────────────────────────────────────────────────────────────────
function actualizarArmas() {
  const w = G.activo;
  // Shopper no tiene bazooka infinita: las armas salen de las cajas. La soga es la
  // herramienta de movilidad y no se gasta.
  G.armas = [
    { id: 'soga', nombre: 'Soga', inf: true },
  ];
  if (w) {
    const eq = G.equipos[w.equipo];
    for (const id of ORDEN_ARMAS) {
      const n = eq.municion[id] || 0;
      if (n > 0) G.armas.push({ id, nombre: DEF_ARMAS[id].nombre, n });
    }
  }
  G.armaSel = clamp(G.armaSel, 0, G.armas.length - 1);
  refrescarArsenal();
}
function seleccionarArma(i) {
  if (i < 0 || i >= G.armas.length) return;
  G.armaSel = i;
  refrescarArsenal();
  sonido('cursorselect', 0.25);
}

// ─────────────────────────────────────────────────────────────────────
// Disparo
// ─────────────────────────────────────────────────────────────────────
function alPresionarFuego(origen) {
  if (G.estado !== 'jugando' || G.fase !== 'mover') return;
  const w = G.activo;
  if (!w || w.muerto) return;
  const item = G.armas[G.armaSel];
  if (!item) return;
  if (G.cargando) return;
  if (item.id === 'soga') { toggleSoga(w); return; }
  if (G.cba && !G.cbaHecha) {
    toast('CBA · recogé una caja antes de atacar', 1500);
    sonido('cursorselect', 0.3);
    return;
  }
  const def = DEF_ARMAS[item.id];
  if (!def) return;
  if (!def.infinito && (G.equipos[w.equipo].municion[item.id] || 0) <= 0) {
    toast('Sin ' + def.nombre.toLowerCase(), 1200);
    return;
  }
  if (def.carga) {
    G.cargando = true;
    G.carga = 0;
    G.armaCargando = item.id;
    G.cargaOrigen = origen || 'fuego';
  } else {
    ejecutarArma(item.id, 1);
  }
}
function alSoltarFuego() {
  if (!G.cargando) return;
  const id = G.armaCargando;
  G.cargando = false;
  G.armaCargando = null;
  G.cargaOrigen = null;
  if (!id) return;
  if (G.estado !== 'jugando' || G.fase !== 'mover' || !G.activo || G.activo.muerto) {
    G.carga = 0;
    return;
  }
  const pot = 0.1 + 0.9 * G.carga;
  G.carga = 0;
  ejecutarArma(id, pot);
}

// ─────────────────────────────────────────────────────────────────────
// Entrada
// ─────────────────────────────────────────────────────────────────────
const MAPA_TECLAS = {
  ArrowLeft: 'izq',
  ArrowRight: 'der',
  ArrowUp: 'arriba',
  ArrowDown: 'abajo',
  Enter: 'salto',
  Backspace: 'voltereta',
  Space: 'fuego',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
};
function alternarArsenal(forzar) {
  G.panelArmas = forzar == null ? !G.panelArmas : !!forzar;
  document.body.classList.toggle('sinArsenal', !G.panelArmas);
}
function ciclarArma(dir) {
  if (!G.armas.length) return;
  seleccionarArma((G.armaSel + dir + G.armas.length) % G.armas.length);
}
function cambiarGusanoEquipo() {
  if (!controlable()) return;
  const eq = G.equipos[G.activo.equipo];
  const vivos = eq.gusanos.filter(g => !g.muerto);
  if (vivos.length < 2) { toast('Tu equipo tiene un solo gusano', 1200); return; }
  const i = vivos.indexOf(G.activo);
  const next = vivos[(i + 1) % vivos.length];
  if (G.activo.soga.estado !== 'none') soltarSoga(G.activo);
  G.activo = next;
  const p = G.orden.indexOf(next);
  if (p >= 0) G.turnoPtr = p;
  actualizarArmas();
  actualizarHUD();
  actualizarBotonSoga();
  centrarCamara(true);
  toast('Gusano ' + (next.idx + 1) + ' de ' + nombreEquipo(next.equipo), 1000);
}
window.addEventListener('keydown', e => {
  const k = MAPA_TECLAS[e.code];
  if (k) {
    teclas[k] = true;
    if (G.estado === 'jugando') e.preventDefault();
  }

  if (G.estado === 'jugando') {
    if (e.code === 'Tab') { e.preventDefault(); cambiarGusanoEquipo(); return; }
    if (e.code === 'Escape') { pausar(); return; }
    if (e.code === 'KeyQ') { ciclarArma(-1); return; }
    if (e.code === 'KeyE') { ciclarArma(1); return; }
    if (e.code === 'KeyZ') { restablecerZoomAuto(); return; }
    if (e.code === 'KeyT') { terminarTurno(); return; }
    if (e.code === 'KeyR') {
      if ((G.fase === 'mover' || G.fase === 'retirada') && G.activo && !G.activo.muerto) toggleSoga(G.activo);
      return;
    }
    if (e.code.startsWith('Digit')) {
      const n = +e.code.slice(5);
      if (n >= 1 && n <= 5) { G.mecha = n; toast('Mecha: ' + n + ' s', 900); }
    }
  } else if (G.estado === 'menu' && e.code === 'Enter') {
    q('btnStart').click();
  } else if (G.estado === 'fin' && e.code === 'Enter') {
    location.reload();
  }
});
window.addEventListener('keyup', e => {
  const k = MAPA_TECLAS[e.code];
  if (k) teclas[k] = false;
  // Enter también suelta la carga cuando se disparó desde la soga/aire.
  if (e.code === 'Enter' && G.cargando && G.cargaOrigen === 'salto') alSoltarFuego();
});
window.addEventListener('blur', soltarBotonesTactiles);

cv.addEventListener('mousemove', e => {
  if (G.tactil) return;
  const r = cv.getBoundingClientRect();
  G.raton.x = e.clientX - r.left;
  G.raton.y = e.clientY - r.top;
  G.raton.dentro = true;
});
cv.addEventListener('mouseleave', () => { G.raton.dentro = false; });
cv.addEventListener('mousedown', e => {
  if (G.tactil || performance.now() < ignorarRatonHasta) return;
  if (e.button === 0) {
    e.preventDefault();
    G.fuegoRaton = true;
    G.raton.dentro = true;
  }
});
window.addEventListener('mouseup', e => { if (e.button === 0) G.fuegoRaton = false; });
cv.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (G.estado === 'jugando' && !G.tactil) alternarArsenal();
});
cv.addEventListener('wheel', e => {
  if (G.estado !== 'jugando') return;
  e.preventDefault();
  G.cam.auto = false;
  G.cam.zoom = clamp(G.cam.zoom * (e.deltaY < 0 ? 1.12 : 0.89), ZOOM_MIN, ZOOM_MAX);
  limitarCamara();
}, { passive: false });

// ─────────────────────────────────────────────────────────────────────
// Controles táctiles (solo se muestran en pantallas táctiles)
// ─────────────────────────────────────────────────────────────────────
let punteroFuego = null;
let ignorarRatonHasta = 0;
let finTactilTimer = 0;
let pistaTactilTimer = 0;

function activarTactil() {
  if (!G.tactil) {
    G.tactil = true;
    document.body.classList.add('tactil');
  }
  if (G.estado === 'jugando') {
    const t = q('tactil');
    if (t) t.classList.remove('hidden');
  }
}

function cancelarCargaTactil() {
  G.cargando = false;
  G.carga = 0;
  G.armaCargando = null;
  G.cargaOrigen = null;
}

function soltarBotonesTactiles() {
  for (const k in teclas) teclas[k] = false;
  const cont = q('tactil');
  if (!cont) return;
  for (const b of cont.querySelectorAll('.activo')) b.classList.remove('activo');
}

function actualizarBotonSoga() {
  const b = q('btnSogaTactil');
  if (!b) return;
  const activa = !!(G.activo && G.activo.soga.estado !== 'none');
  b.classList.toggle('activo', activa);
  b.textContent = activa ? 'SOLTAR' : 'SOGA';
}

function resetFinTactil() {
  clearTimeout(finTactilTimer);
  const b = q('btnFinTactil');
  if (!b) return;
  b.classList.remove('confirmar');
  b.textContent = 'FIN';
}

function mostrarPistaTactil() {
  const p = q('tactilPista');
  if (!p || !G.tactil) return;
  p.classList.add('visible');
  clearTimeout(pistaTactilTimer);
  pistaTactilTimer = setTimeout(() => p.classList.remove('visible'), 6000);
}

function prepararTactil() {
  const cont = q('tactil');
  if (!cont) return;
  cont.addEventListener('contextmenu', e => e.preventDefault());

  for (const b of cont.querySelectorAll('[data-tecla]')) {
    const k = b.dataset.tecla;
    const soltar = e => {
      if (e && e.pointerId != null && b.hasPointerCapture && b.hasPointerCapture(e.pointerId)) {
        try { b.releasePointerCapture(e.pointerId); } catch (err) { /* ya soltado */ }
      }
      teclas[k] = false;
      b.classList.remove('activo');
    };
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      activarTactil();
      ignorarRatonHasta = performance.now() + 700;
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
      teclas[k] = true;
      b.classList.add('activo');
    });
    b.addEventListener('pointerup', soltar);
    b.addEventListener('pointercancel', soltar);
    b.addEventListener('lostpointercapture', soltar);
  }

  const btnSoga = q('btnSogaTactil');
  if (btnSoga) btnSoga.addEventListener('click', () => {
    if (G.estado === 'jugando' && (G.fase === 'mover' || G.fase === 'retirada') &&
        G.activo && !G.activo.muerto) {
      toggleSoga(G.activo);
      actualizarBotonSoga();
    }
    btnSoga.blur();
  });

  const btnFin = q('btnFinTactil');
  if (btnFin) btnFin.addEventListener('click', () => {
    if (G.estado !== 'jugando') return;
    if (!btnFin.classList.contains('confirmar')) {
      btnFin.classList.add('confirmar');
      btnFin.textContent = '¿FIN?';
      clearTimeout(finTactilTimer);
      finTactilTimer = setTimeout(resetFinTactil, 2200);
      return;
    }
    resetFinTactil();
    terminarTurno();
  });

  const btnFuego = q('btnFuegoTactil');
  if (btnFuego) {
    btnFuego.addEventListener('pointerdown', e => {
      if (punteroFuego != null) return;
      e.preventDefault();
      activarTactil();
      ignorarRatonHasta = performance.now() + 700;
      punteroFuego = e.pointerId;
      try { btnFuego.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
      btnFuego.classList.add('activo');
      alPresionarFuego();
      actualizarBotonSoga();
    });
    const soltarFuego = e => {
      if (punteroFuego == null || (e && e.pointerId !== punteroFuego)) return;
      punteroFuego = null;
      ignorarRatonHasta = performance.now() + 700;
      btnFuego.classList.remove('activo');
      alSoltarFuego();
    };
    btnFuego.addEventListener('pointerup', soltarFuego);
    btnFuego.addEventListener('pointercancel', e => {
      if (punteroFuego !== e.pointerId) return;
      punteroFuego = null;
      btnFuego.classList.remove('activo');
      cancelarCargaTactil();
    });
    btnFuego.addEventListener('lostpointercapture', e => {
      if (punteroFuego === e.pointerId) soltarFuego(e);
    });
  }

  // En móvil se apunta sólo con las flechas arriba/abajo. El canvas no
  // intercepta toques para la mira: así los botones no se pisan entre sí.

  try {
    if (matchMedia('(pointer: coarse)').matches) activarTactil();
  } catch (err) { /* sin matchMedia */ }
  if (new URLSearchParams(location.search).has('tactil')) activarTactil();
  window.addEventListener('touchstart', activarTactil, { passive: true, once: true });
}

function controlable() {
  return G.estado === 'jugando' && G.activo && !G.activo.muerto &&
         (G.fase === 'mover' || G.fase === 'retirada') &&
         (!G.online || (ONLINE.esMiTurno && !ONLINE.esperando));
}
function pausar() {
  if (G.estado !== 'jugando') return;
  G.estado = 'pausa';
  soltarBotonesTactiles();
  G.fuegoRaton = false;
  punteroFuego = null;
  cancelarCargaTactil();
  const bf = q('btnFuegoTactil');
  if (bf) bf.classList.remove('activo');
  const t = q('tactil');
  if (t) t.classList.add('hidden');
  q('pausa').classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────────────
// Efectos
// ─────────────────────────────────────────────────────────────────────
function actualizarEfectos() {
  for (let i = G.efectos.length - 1; i >= 0; i--) {
    G.efectos[i].vida -= TICK;
    if (G.efectos[i].vida <= 0) G.efectos.splice(i, 1);
  }
  for (let i = G.anillos.length - 1; i >= 0; i--) {
    const a = G.anillos[i];
    a.r += (a.max - a.r) * 0.26;
    a.vida -= 0.07;
    if (a.vida <= 0) G.anillos.splice(i, 1);
  }
  for (let i = G.particulas.length - 1; i >= 0; i--) {
    const p = G.particulas[i];
    p.vida -= TICK;
    if (p.vida <= 0) { G.particulas.splice(i, 1); continue; }
    p.vy += 0.12;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
  }
  for (let i = G.flotantes.length - 1; i >= 0; i--) {
    const f = G.flotantes[i];
    f.y -= 0.45;
    f.vida -= TICK;
    if (f.vida <= 0) G.flotantes.splice(i, 1);
  }
  if (G.sacudir > 0.2) G.sacudir *= 0.88;
}

// ─────────────────────────────────────────────────────────────────────
// Paso lógico (50 Hz)
// ─────────────────────────────────────────────────────────────────────
function paso() {
  if (G.estado !== 'jugando') return;
  if (G.online && !ONLINE.esMiTurno) {
    // No es mi turno: el que juega manda snapshots. Acá solo se mueve la vista
    // y se dejan correr los efectos para que la escena no quede congelada.
    actualizarEfectos();
    panPorRaton();
    actualizarCamara();
    if ((G.hudTick = (G.hudTick + 1) % 5) === 0) actualizarHUD();
    return;
  }
  const w = G.activo;

  const fuego = !!(teclas.fuego || G.fuegoRaton);
  if (fuego && !G.fuegoPrev) alPresionarFuego('fuego');
  if (!fuego && G.fuegoPrev) alSoltarFuego();
  G.fuegoPrev = fuego;
  if (G.cargando) G.carga = Math.min(1, G.carga + TICK / 0.9);

  for (const g of G.gusanos) {
    if (g.voltereta > 0) g.voltereta = Math.max(0, g.voltereta - TICK);
    if (g.muerto) {
      g.muerteT += TICK;
      if (g.causa === 'agua') { g.hundiendo += TICK; g.y += 0.35; }
      continue;
    }
    const control = controlable() && g === G.activo;
    if (control) {
      actualizarSalto(g);
      if (g.soga.estado === 'none') {
        // Worms Armageddon mueve la mira 0x200 por tick (~2,8°).
        if (teclas.arriba) ajustarMira(g, -2.8 * Math.PI / 180);
        if (teclas.abajo) ajustarMira(g, 2.8 * Math.PI / 180);
      }
      if (teclas.salto && !g.saltoApretado) {
        // Como WA: Enter desde la soga dispara el arma seleccionada; en el
        // piso es el salto adelante (o el segundo toque del salto atrás).
        if (g.soga.estado === 'atada' || g.soga.estado === 'disparando') alPresionarFuego('salto');
        else presionarSalto(g, 'adelante');
        g.saltoApretado = true;
      }
      if (!teclas.salto) {
        g.saltoApretado = false;
        if (G.cargando && G.cargaOrigen === 'salto') alSoltarFuego();
      }
      if (teclas.voltereta && !g.volteretaApretada) {
        presionarSalto(g, 'atras');
        g.volteretaApretada = true;
      }
      if (!teclas.voltereta) g.volteretaApretada = false;
    }
    if (g.soga.estado === 'disparando') {
      avanzarGarfio(g);
      movimientoNormal(g, false);
    } else if (g.soga.estado === 'atada') {
      fisicaSoga(g, control);
    } else {
      movimientoNormal(g, control);
    }
    if (!g.muerto && g.y > MUNDO.agua + 2) ahogar(g);
  }

  actualizarProyectiles();
  actualizarWalkers();
  actualizarZonas();
  actualizarLlamas();
  actualizarCajas();
  G.crateTimer -= TICK;
  if (G.crateTimer <= 0) {
    if (G.cajas.length < 4) soltarCaja();
    G.crateTimer = azar(5, 8);
  }
  actualizarEfectos();
  actualizarTurno();
  panPorRaton();
  actualizarCamara();
  if ((G.hudTick = (G.hudTick + 1) % 5) === 0) actualizarHUD();
  if (G.msgTurno > 0) G.msgTurno -= TICK;
  if (G.online && ONLINE.esMiTurno && !ONLINE.esperando && G.fase !== 'esperando') {
    ONLINE.paso = (ONLINE.paso + 1) % 4;
    if (ONLINE.paso === 0) enviarSnapshot();
  }
}

// ─────────────────────────────────────────────────────────────────────
// Cámara
// ─────────────────────────────────────────────────────────────────────
function q(id) { return document.getElementById(id); }

function zoomAutomatico() {
  const b = Math.max(0.0001, G.cam.base);
  return clamp(ESCALA_GUSANO / b, ZOOM_MIN, ZOOM_MAX);
}

function recalcularBase() {
  const m = G.mapa;
  if (!m) { G.cam.base = Math.min(cssW / 1920, cssH / 696); return; }
  G.cam.base = Math.min(cssW / m.w, cssH / m.h) * 0.995;
  if (G.cam.auto) G.cam.zoom = zoomAutomatico();
}

function restablecerZoomAuto() {
  G.cam.auto = true;
  G.cam.zoom = zoomAutomatico();
  limitarCamara();
}

function limitarCamara() {
  const m = G.mapa;
  if (!m) return;
  const esc = G.cam.base * G.cam.zoom;
  const vw = cssW / esc;
  const vh = cssH / esc;
  G.cam.x = vw >= m.w ? (m.w - vw) / 2 : clamp(G.cam.x, 0, m.w - vw);
  G.cam.y = vh >= m.h ? (m.h - vh) / 2 : clamp(G.cam.y, 0, m.h - vh);
}

function centrarCamara() {
  const m = G.mapa;
  if (!m) return;
  G.cam.libre = 0;
  const esc = G.cam.base * G.cam.zoom;
  const vw = cssW / esc;
  const vh = cssH / esc;
  const obj = (G.activo && !G.activo.muerto) ? G.activo : (G.proyectiles[0] || G.walkers[0]);
  let x = m.w / 2, y = m.h / 2;
  if (obj && G.cam.zoom > 1.02) { x = obj.x; y = obj.y - 10; }
  G.cam.x = x - vw / 2;
  G.cam.y = y - vh / 2;
  limitarCamara();
}

// En Worms Armageddon el mouse no apunta: lleva la vista cuando se acerca a un borde.
function panPorRaton() {
  if (G.tactil || G.estado !== 'jugando' || !G.raton.dentro || !G.mapa) return;
  const m = 46;
  let dx = 0, dy = 0;
  if (G.raton.x < m) dx = -1;
  else if (G.raton.x > cssW - m) dx = 1;
  if (G.raton.y < m) dy = -1;
  else if (G.raton.y > cssH - m) dy = 1;
  if (!dx && !dy) return;
  G.cam.libre = 0.9;
  const esc = Math.max(0.0001, G.cam.base * G.cam.zoom);
  G.cam.x += dx * 15 / esc;
  G.cam.y += dy * 15 / esc;
  limitarCamara();
}

function actualizarCamara() {
  const m = G.mapa;
  if (!m) return;
  if (G.cam.libre > 0) { G.cam.libre = Math.max(0, G.cam.libre - TICK); return; }
  const esc = G.cam.base * G.cam.zoom;
  const vw = cssW / esc;
  const vh = cssH / esc;
  let obj = G.proyectiles.length ? G.proyectiles[G.proyectiles.length - 1] : null;
  if (!obj && G.walkers.length) obj = G.walkers[G.walkers.length - 1];
  if (!obj) obj = (G.activo && !G.activo.muerto) ? G.activo : null;
  if (!obj) obj = { x: m.w / 2, y: m.h / 2 };
  const tx = obj.x - vw / 2;
  const ty = (obj.y - 10) - vh / 2;
  G.cam.x += (tx - G.cam.x) * 0.10;
  G.cam.y += (ty - G.cam.y) * 0.10;
  limitarCamara();
}

// ─────────────────────────────────────────────────────────────────────
// Dibujo del mundo
// ─────────────────────────────────────────────────────────────────────
const HUE_MAPA = {
  grape: 268, rare: 195, reptilian: 130, rustic: 30, metallic: 215,
  acid: 88, circuitos: 190, constellations: 250, playa: 190, oldmill: 35,
  crossing: 205, mario: 210, blu: 220, nave: 260,
};

function dibujarFondo() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hue = HUE_MAPA[G.mapaSel] != null ? HUE_MAPA[G.mapaSel] : 210;
  const g = ctx.createLinearGradient(0, 0, 0, cssH);
  g.addColorStop(0, 'hsl(' + hue + ' 48% 7%)');
  g.addColorStop(0.55, 'hsl(' + hue + ' 40% 15%)');
  g.addColorStop(1, 'hsl(' + (hue + 18) + ' 38% 24%)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);

  const halo = ctx.createRadialGradient(cssW * 0.5, cssH * 0.6, 10, cssW * 0.5, cssH * 0.6, cssW * 0.75);
  halo.addColorStop(0, 'hsla(' + (hue + 20) + ' 70% 60% / 0.16)');
  halo.addColorStop(1, 'hsla(' + hue + ' 60% 30% / 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, cssW, cssH);

  for (let i = 0; i < 90; i++) {
    const x = (i * 137.51) % Math.max(1, cssW);
    const y = (i * 89.73) % Math.max(1, cssH * 0.72);
    const a = 0.05 + ((i * 37) % 50) * 0.005;
    ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
    ctx.fillRect(x, y, 1.4, 1.4);
  }
}

function aplicarCamara() {
  const esc = G.cam.base * G.cam.zoom;
  const sac = G.sacudir || 0;
  const sx = sac > 0.2 ? azar(-sac, sac) : 0;
  const sy = sac > 0.2 ? azar(-sac, sac) : 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(-G.cam.x * esc + sx, -G.cam.y * esc + sy);
  ctx.scale(esc, esc);
}

function dibujarAgua(frente) {
  const y = MUNDO.agua;
  const w = MUNDO.w;
  const esc = Math.max(0.0001, G.cam.base * G.cam.zoom);
  const h = Math.max(MUNDO.h, G.cam.y + cssH / esc + 240);
  const t = performance.now() / 1000;
  ctx.save();
  if (frente) {
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#3fb6e6';
    ctx.fillRect(0, y, w, h - y);
    ctx.restore();
    return;
  }
  const g = ctx.createLinearGradient(0, y, 0, h);
  g.addColorStop(0, 'rgba(54,162,214,0.58)');
  g.addColorStop(0.55, 'rgba(20,92,146,0.72)');
  g.addColorStop(1, 'rgba(7,42,78,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, w, h - y);
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 22) {
      const yy = y + k * 6 + Math.sin(x * 0.018 + t * (1.2 + k * 0.35) + k) * (2.4 - k * 0.5);
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = 'rgba(190,240,255,' + (0.45 - k * 0.12).toFixed(2) + ')';
    ctx.stroke();
  }
  ctx.restore();
}

function dibujarSprite(nombre, frame, x, y, opciones) {
  const op = opciones || {};
  const meta = WEAPON_SPRITES[nombre];
  if (!meta) return false;
  const im = imagen('assets/weapons/' + nombre + '.png');
  if (!lista(im)) return false;
  const f = ((frame | 0) % meta.frames + meta.frames) % meta.frames;
  const escala = op.escala || 1;
  ctx.save();
  ctx.globalAlpha = op.alpha == null ? 1 : op.alpha;
  ctx.translate(x, y);
  if (op.flip) ctx.scale(-1, 1);
  ctx.rotate(op.rot || 0);
  ctx.drawImage(im, 0, f * meta.h, meta.w, meta.h,
    -meta.w / 2 * escala, -(meta.h / 2 - 2) * escala, meta.w * escala, meta.h * escala);
  ctx.restore();
  return true;
}

function dibujarGusanoSheet(w, anim, frame, alpha) {
  const meta = GUSANOS_SPRITES[anim];
  if (!meta) return;
  const key = EQUIPOS_DEF[w.equipo].key;
  let im = imagen('assets/gusanos/' + anim + '_' + key + '.png');
  if (!lista(im)) im = imagen('assets/gusanos/' + anim + '_base.png');
  if (!lista(im)) return;
  const f = ((frame | 0) % meta.frames + meta.frames) % meta.frames;
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.translate(w.x, w.y);
  // Las 64 poses de wbatrope ya cubren los 360°: espejarlas las rompe.
  if (anim !== 'wbatrope' && w.mirando > 0) ctx.scale(-1, 1);
  ctx.drawImage(im, 0, f * meta.h, meta.w, meta.h, -30, -35, 60, 60);
  ctx.restore();
}

function frameCaminar(w) {
  return Math.floor(w.paso) % (GUSANOS_SPRITES.wwalk ? GUSANOS_SPRITES.wwalk.frames : 1);
}

function frameSoga(w) {
  const s = w.soga;
  let ax = s.ax, ay = s.ay;
  if (s.estado === 'disparando') { ax = s.hx; ay = s.hy; }
  else if (s.estado === 'atada') {
    const r = rutaSoga(s);
    ax = r.px; ay = r.py;
  }
  const ang = Math.atan2(ay - w.y, ax - w.x);
  const m = GUSANOS_SPRITES.wbatrope ? GUSANOS_SPRITES.wbatrope.frames : 64;
  return Math.floor((((ang + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * m) % m;
}

function frameApuntado(w) {
  const m = GUSANOS_SPRITES.wbataim ? GUSANOS_SPRITES.wbataim.frames : 32;
  let a = w.aim;
  if (w.mirando > 0) a = Math.PI - a;
  a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (a < Math.PI / 2) a += Math.PI;
  if (a > Math.PI * 1.5) a -= Math.PI;
  const t = clamp((a - Math.PI / 2) / Math.PI, 0, 0.9999);
  return Math.floor(t * m) % m;
}

function dibujarSoga(w) {
  const s = w.soga;
  if (s.estado === 'none') return;
  ctx.save();
  ctx.strokeStyle = 'rgba(244,230,187,0.92)';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w.x, w.y - 2);
  // Los pivotes están ordenados desde el ancla hacia el gusano.
  for (let i = s.pivotes.length - 1; i >= 0; i--) ctx.lineTo(s.pivotes[i].x, s.pivotes[i].y);
  if (s.estado === 'atada') ctx.lineTo(s.ax, s.ay);
  else ctx.lineTo(s.hx, s.hy);
  ctx.stroke();

  const im = imagen('assets/weapons/ropetip.png');
  if (lista(im)) {
    const ax = s.estado === 'atada' ? s.ax : s.hx;
    const ay = s.estado === 'atada' ? s.ay : s.hy;
    ctx.drawImage(im, ax - 30, ay - 28, 60, 60);
  }
  ctx.restore();
}

function dibujarGusanos() {
  for (const w of G.gusanos) {
    if (w.muerto && w.causa === 'agua' && w.hundiendo > 1.4) continue;
    if (w.muerto && w.muerteT > 2.2) continue;

    let anim = 'wwalk', frame = 0;
    if (w.muerto) {
      anim = 'wdie';
      frame = Math.floor(w.muerteT * 26);
    } else if (w.voltereta > 0 && !w.enPiso) {
      anim = 'wroll';
      const t = clamp(1 - w.voltereta / (w.volteretaDur || 0.55), 0, 0.9999);
      frame = Math.floor(t * (GUSANOS_SPRITES.wroll ? GUSANOS_SPRITES.wroll.frames : 32));
    } else if (w.soga.estado === 'atada' || w.soga.estado === 'disparando') {
      anim = 'wbatrope';
      frame = frameSoga(w);
    } else if (!w.enPiso) {
      anim = w.vy < -0.3 ? 'wjumpu' : 'wfall';
      frame = Math.floor(performance.now() / 80);
    } else if (w.caminando) {
      anim = w.animCaminar || 'wwalk';
      frame = frameCaminar(w);
    }

    dibujarSoga(w);
    dibujarGusanoSheet(w, anim, frame);
    if (!w.muerto && w === G.activo && G.estado === 'jugando' && w.enPiso &&
        !w.caminando && !w.voltereta &&
        w.soga.estado !== 'atada' && w.soga.estado !== 'disparando') {
      dibujarGusanoSheet(w, 'wbataim', frameApuntado(w), 0.95);
    }

    // barra de vida
    if (!w.muerto) {
      const bw = 30, bh = 3.5;
      const bx = w.x - bw / 2, by = w.y - 44;
      ctx.fillStyle = 'rgba(8,12,18,0.72)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      const frac = clamp(w.hp / w.hpMax, 0, 1);
      ctx.fillStyle = frac > 0.55 ? '#65c96b' : frac > 0.25 ? '#e5b84c' : '#e05b4e';
      ctx.fillRect(bx, by, bw * frac, bh);
    }

    // flecha del gusano activo
    if (!w.muerto && w === G.activo && G.estado === 'jugando') {
      const bob = Math.sin(performance.now() / 240) * 3;
      const ay = w.y - 55 + bob;
      ctx.save();
      ctx.fillStyle = EQUIPOS_DEF[w.equipo].color;
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(w.x, ay + 8);
      ctx.lineTo(w.x - 7, ay);
      ctx.lineTo(w.x + 7, ay);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

function dibujarCajas() {
  const meta = WEAPON_SPRITES.wcrate0;
  if (!meta) return;
  for (const c of G.cajas) {
    const f = Math.floor(performance.now() / 150 + c.x * 0.01) % meta.frames;
    const im = imagen('assets/weapons/wcrate0.png');
    if (!lista(im)) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(Math.sin(performance.now() / 600 + c.x) * 0.04);
    ctx.shadowColor = 'rgba(255,220,120,0.5)';
    ctx.shadowBlur = 12;
    ctx.drawImage(im, 0, f * meta.h, meta.w, meta.h, -30, -30, 60, 60);
    ctx.restore();
  }
}

function dibujarProyectiles() {
  const t = performance.now() / 1000;
  for (const p of G.proyectiles) {
    const meta = WEAPON_SPRITES[p.sprite];
    let f = 0;
    if (meta) {
      if (p.def.id === 'granada' || p.def.id === 'cluster' || p.def.id === 'banana' ||
          p.def.id === 'nafta' || p.def.id === 'sagrada') {
        f = Math.floor(p.edad * 14) % meta.frames;
      } else if (p.sprite === 'missile' || p.sprite === 'mortar' || p.def.rotar) {
        const a = Math.atan2(p.vy, p.vx) + Math.PI / 2;
        f = Math.floor((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * meta.frames) % meta.frames;
      } else {
        f = Math.floor(t * 12) % meta.frames;
      }
    }
    let rot = 0;
    if (p.def.id === 'granada' || p.def.id === 'cluster' || p.def.id === 'banana' ||
        p.def.id === 'nafta' || p.def.id === 'sagrada') {
      rot = p.edad * 3.2;
    }
    dibujarSprite(p.sprite, f, p.x, p.y, { rot });
  }
}

function dibujarWalkers() {
  for (const e of G.walkers) {
    const meta = WEAPON_SPRITES[e.def.sprite];
    if (!meta) continue;
    const f = Math.floor(e.frame) % meta.frames;
    const im = imagen('assets/weapons/' + e.def.sprite + '.png');
    if (!lista(im)) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.dir > 0) ctx.scale(-1, 1);
    ctx.drawImage(im, 0, f * meta.h, meta.w, meta.h, -30, -35, 60, 60);
    ctx.restore();
  }
}

function dibujarZonas() {
  const t = performance.now() / 1000;
  for (const z of G.zonas) {
    const alpha = clamp(z.vida / z.max, 0, 1);
    if (z.tipo === 'gas') {
      const g = ctx.createRadialGradient(z.x, z.y, 2, z.x, z.y, z.r);
      g.addColorStop(0, 'rgba(120,220,110,' + (0.22 * alpha).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(60,150,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4 + t * 1.7 + z.semilla;
        const r = z.r * (0.35 + 0.5 * ((i * 0.37) % 1));
        const x = z.x + Math.cos(a) * (z.r * 0.35);
        const y = z.y + Math.sin(a * 1.3) * (z.r * 0.2) - 4;
        const g = ctx.createRadialGradient(x, y, 1, x, y, r * 0.7);
        g.addColorStop(0, 'rgba(255,210,90,' + (0.4 * alpha).toFixed(3) + ')');
        g.addColorStop(0.5, 'rgba(255,120,40,' + (0.28 * alpha).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(180,40,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function dibujarLlamas() {
  for (const p of G.llamas) {
    if (p.emisor) continue;
    const a = clamp(p.vida / p.max, 0, 1);
    const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.tam * 2.2);
    g.addColorStop(0, 'rgba(255,245,180,' + (0.9 * a).toFixed(3) + ')');
    g.addColorStop(0.4, 'rgba(255,150,50,' + (0.7 * a).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(220,50,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.tam * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function dibujarEfectos() {
  for (const e of G.efectos) {
    const a = clamp(e.vida / e.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    if (e.tipo === 'linea') {
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();
    } else if (e.tipo === 'golpe') {
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (1.1 - a * 0.2), -0.9, 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }
  for (const a of G.anillos) {
    ctx.save();
    ctx.globalAlpha = clamp(a.vida, 0, 1);
    ctx.strokeStyle = a.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  for (const p of G.particulas) {
    const a = clamp(p.vida / p.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.tam / 2, p.y - p.tam / 2, p.tam, p.tam);
  }
  ctx.globalAlpha = 1;
  for (const f of G.flotantes) {
    const a = clamp(f.vida / f.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(f.texto, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.texto, f.x, f.y);
    ctx.restore();
  }
}

function dibujarBarraCarga() {
  const w = G.activo;
  if (!w || !G.cargando || w.muerto) return;
  const ancho = 52, x = w.x - ancho / 2, y = w.y - 62;
  ctx.save();
  ctx.fillStyle = 'rgba(8,12,18,0.8)';
  ctx.fillRect(x - 2, y - 2, ancho + 4, 9);
  const g = ctx.createLinearGradient(x, 0, x + ancho, 0);
  g.addColorStop(0, '#7ee06b');
  g.addColorStop(0.55, '#e8d05a');
  g.addColorStop(1, '#e85a4a');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, ancho * clamp(G.carga, 0, 1), 5);
  ctx.restore();
}

function dibujarMira() {
  const w = G.activo;
  if (G.estado !== 'jugando' || !w || w.muerto) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const esc = Math.max(0.0001, G.cam.base * G.cam.zoom);
  // Igual que WA: la mira está siempre a la misma distancia corta del gusano,
  // sobre el ángulo de apuntado. No sigue al mouse ni al último toque.
  const tx = (w.x + Math.cos(w.aim) * DIST_MIRA - G.cam.x) * esc;
  const ty = (w.y - 2 + Math.sin(w.aim) * DIST_MIRA - G.cam.y) * esc;

  ctx.save();
  ctx.translate(tx, ty);
  ctx.strokeStyle = 'rgba(225,240,255,0.95)';
  ctx.fillStyle = 'rgba(225,240,255,0.95)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.stroke();
  // Estrella de cuatro puntas, como el crosshair de Worms Armageddon.
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 4;
    const r = i % 2 === 0 ? 13 : 3.2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();
}

function dibujar() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  dibujarFondo();
  if (!G.mapa) { dibujarMira(); return; }
  ctx.save();
  aplicarCamara();
  const m = G.mapa;
  const im = imagen(m.archivo);
  if (lista(im)) {
    ctx.drawImage(im, 0, 0, m.w, m.h);
  } else {
    ctx.fillStyle = 'rgba(20,26,38,0.6)';
    ctx.fillRect(0, 0, m.w, m.h);
  }
  dibujarAgua(false);
  dibujarCajas();
  dibujarZonas();
  dibujarWalkers();
  dibujarGusanos();
  dibujarProyectiles();
  dibujarLlamas();
  dibujarEfectos();
  dibujarBarraCarga();
  dibujarAgua(true);
  ctx.restore();
  dibujarMira();
}

// ─────────────────────────────────────────────────────────────────────
// HUD
// ─────────────────────────────────────────────────────────────────────
const EMOJI_ARMA = {
  soga: '🪢', bazooka: '🚀', granada: '💣', cluster: '🧨', mortero: '💥',
  misil: '🚀', zorrino: '🦨', nafta: '⛽', banana: '🍌', escopeta: '🔫',
  minigun: '🔫', arco: '🏹', mina: '💣', punofuego: '👊', boladragon: '🐉',
  hacha: '🪓', dinamita: '🧨', oveja: '🐑', bate: '🏏', lanzallamas: '🔥',
  paloma: '🕊️', vaca: '🐄', sagrada: '✨', viejita: '👵', lanzovejas: '🐑',
  superoveja: '🦸',
};

function dibujarIconoArma(canvas, id) {
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  const sprite = id === 'soga' ? 'ropetip' : (DEF_ARMAS[id] && DEF_ARMAS[id].sprite);
  const meta = sprite ? WEAPON_SPRITES[sprite] : null;
  let dibujado = false;
  if (meta) {
    const im = imagen('assets/weapons/' + sprite + '.png');
    if (lista(im)) {
      const cw = Math.min(meta.w, meta.h);
      const sx = (meta.w - cw) / 2;
      const sy = (meta.h - cw) / 2;
      c.imageSmoothingEnabled = true;
      c.drawImage(im, sx, sy, cw, cw, 2, 2, canvas.width - 4, canvas.height - 4);
      dibujado = true;
    }
  }
  if (!dibujado) {
    c.font = '20px "Segoe UI Emoji", "Segoe UI", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#f4e6bb';
    c.fillText(EMOJI_ARMA[id] || '?', canvas.width / 2, canvas.height / 2 + 1);
  }
}

function refrescarArsenal() {
  const cont = q('arsenal');
  if (!cont) return;
  cont.innerHTML = '';
  for (let i = 0; i < G.armas.length; i++) {
    const item = G.armas[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'arma' + (i === G.armaSel ? ' sel' : '');
    b.title = item.nombre + (item.n ? ' · ' + item.n : '') + (i < 9 ? ' · tecla ' + (i + 1) : '');

    const ico = document.createElement('canvas');
    ico.width = 38;
    ico.height = 38;
    dibujarIconoArma(ico, item.id);
    b.appendChild(ico);

    if (i < 9) {
      const k = document.createElement('span');
      k.className = 'tecla';
      k.textContent = i + 1;
      b.appendChild(k);
    }
    if (item.n) {
      const n = document.createElement('span');
      n.className = 'cant';
      n.textContent = item.n;
      b.appendChild(n);
    }
    b.addEventListener('click', () => seleccionarArma(i));
    cont.appendChild(b);
  }
}

let toastTimer = 0;
function toast(texto, ms) {
  const el = q('toast');
  if (!el) return;
  el.textContent = texto;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), ms || 1400);
}

let marcadorEls = [];
function construirMarcador() {
  const cont = q('marcador');
  if (!cont) return;
  cont.innerHTML = '';
  marcadorEls = [];
  for (let i = 0; i < G.equipos.length; i++) {
    const d = document.createElement('div');
    d.className = 'equipo';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = EQUIPOS_DEF[i].color;
    const nom = document.createElement('span');
    nom.className = 'nom';
    nom.textContent = G.online && ONLINE.jugadores && ONLINE.jugadores[i] ? ONLINE.jugadores[i].nombre : EQUIPOS_DEF[i].nombre;
    const vivos = document.createElement('span');
    vivos.className = 'vivos';
    const hp = document.createElement('div');
    hp.className = 'hp';
    const barra = document.createElement('i');
    hp.appendChild(barra);
    d.append(dot, nom, vivos, hp);
    cont.appendChild(d);
    marcadorEls.push({ el: d, vivos, barra });
  }
}

function actualizarHUD() {
  const w = G.activo;
  if (!w) return;
  const def = EQUIPOS_DEF[w.equipo];
  q('teamDot').style.background = def.color;
  q('teamName').textContent = nombreEquipo(w.equipo);
  q('wormName').textContent = w.nombre + ' · ' + Math.max(0, Math.round(w.hp)) + ' HP';

  let t = '—';
  if (G.fase === 'mover') t = Math.max(0, Math.ceil(G.tiempo));
  else if (G.fase === 'retirada') t = 'R' + Math.max(0, Math.ceil(G.retirada));
  else if (G.fase === 'resolver' || G.fase === 'esperando') t = '···';
  q('timer').textContent = t;
  q('timerBox').classList.toggle('urgente', G.fase === 'mover' && G.tiempo <= 5);

  const v = Math.round(G.viento);
  q('windVal').textContent = Math.abs(v);
  q('windArrow').textContent = v < 0 ? '←' : '→';
  q('windArrow').style.opacity = clamp(Math.abs(v) / 25 + 0.25, 0.25, 1).toFixed(2);

  const cba = q('cba');
  cba.classList.toggle('hidden', !(G.cba && !G.cbaHecha && G.fase === 'mover'));
  actualizarBotonSoga();

  for (let i = 0; i < G.equipos.length; i++) {
    const el = marcadorEls[i];
    if (!el) continue;
    const vivos = G.gusanos.filter(g => g.equipo === i && !g.muerto);
    const hpTotal = vivos.reduce((s, g) => s + Math.max(0, g.hp), 0);
    const hpMax = Math.max(1, G.config.gusanos * G.config.hp);
    el.vivos.textContent = vivos.length;
    el.barra.style.width = (100 * hpTotal / hpMax).toFixed(1) + '%';
    el.el.classList.toggle('muerto', vivos.length === 0);
    el.el.classList.toggle('activo', G.estado === 'jugando' && w.equipo === i);
  }

  const ayuda = q('ayuda');
  if (ayuda) {
    ayuda.textContent = G.online && !ONLINE.esMiTurno
      ? 'Turno de ' + (ONLINE.jugadores[G.activo.equipo] ? ONLINE.jugadores[G.activo.equipo].nombre : 'otro jugador') + ' · esperá tu turno'
      : G.fase === 'retirada'
        ? 'RETIRADA · movete y escapá · ' + Math.ceil(Math.max(0, G.retirada)) + 's'
        : '← → mover · ↑ ↓ apuntar · Enter salto · Enter×2 atrás · Backspace arriba · Backspace×2 mortal · Espacio fuego · Tab gusano · Q/E armas · clic derecho arsenal · 1-5 mecha · R soga · rueda zoom · Z zoom auto · ESC pausa';
  }
}

// ─────────────────────────────────────────────────────────────────────
// Menú y arranque
// ─────────────────────────────────────────────────────────────────────
function puntosDeAparicion(cantidad, meta) {
  const pts = (meta.puntos || []).filter(p => p[1] < MUNDO.agua - 24 && p[1] > 40);
  if (!pts.length) return [];
  const usados = [];
  const out = [];
  for (let i = 0; i < cantidad; i++) {
    const tx = ((i + 0.5) / cantidad) * meta.w;
    let best = null, bestScore = Infinity;
    for (const p of pts) {
      let score = Math.abs(p[0] - tx);
      for (const u of usados) {
        const d = Math.hypot(u[0] - p[0], u[1] - p[1]);
        if (d < 55) score += (55 - d) * 10;
      }
      if (score < bestScore) { bestScore = score; best = p; }
    }
    if (best) { out.push(best); usados.push(best); }
  }
  while (out.length < cantidad) out.push(pts[azarInt(0, pts.length - 1)]);
  return out;
}

function iniciarPartida() {
  const meta = MAPAS.find(m => m.id === G.mapaSel) || MAPAS[0];
  if (!meta) { toast('No hay mapas cargados', 2500); return; }

  MUNDO.w = meta.w;
  MUNDO.h = meta.h;
  MUNDO.agua = meta.agua != null ? meta.agua : meta.h - 40;

  if (!G.mapa || G.mapa.id !== meta.id) {
    for (const k of [...IMGS.keys()]) if (k.indexOf('assets/maps/') === 0) IMGS.delete(k);
  }
  G.mapa = meta;
  G.terreno = new Terreno(meta);
  G.config.equipos = clamp(parseInt(q('iEquipos').value, 10) || 2, 2, 5);
  // Shopper: un gusano por jugador. El CBA es obligatorio (se recoge una caja antes de atacar).
  G.config.gusanos = 1;
  G.cba = true;

  G.online = false;
  limpiarOnlineJuego();
  G.estado = 'jugando';
  G.fase = 'mover';
  G.activo = null;
  G.tiempo = TIEMPO_TURNO;
  G.retirada = 0;
  G.viento = 0;
  G.cam.libre = 0;
  G.cajas = [];
  G.proyectiles = [];
  G.walkers = [];
  G.zonas = [];
  G.llamas = [];
  G.efectos = [];
  G.particulas = [];
  G.anillos = [];
  G.flotantes = [];
  G.sacudir = 0;
  G.cargando = false;
  G.carga = 0;
  G.armaCargando = null;
  G.cargaOrigen = null;
  G.fuegoPrev = false;
  G.fuegoRaton = false;
  G.raton.dentro = false;
  soltarBotonesTactiles();
  punteroFuego = null;
  G.cbaHecha = false;
  G.usadoSoga = false;
  G.armaSel = 0;
  G.equipos = [];
  G.gusanos = [];
  G.orden = [];
  G.turnoPtr = -1;
  G.cam.zoom = 1;
  G.cam.auto = true;
  G.crateTimer = azar(4, 6);
  idGusano = 0;

  for (let t = 0; t < G.config.equipos; t++) {
    G.equipos.push({ indice: t, municion: {}, gusanos: [] });
  }

  const total = G.config.equipos * G.config.gusanos;
  const puntos = puntosDeAparicion(total, meta);
  for (let i = 0; i < total; i++) {
    const equipo = i % G.config.equipos;
    const p = puntos[i] || [meta.w * (i + 0.5) / total, MUNDO.agua - 60];
    let x = clamp(p[0], 12, MUNDO.w - 12);
    let y = p[1] - 8;
    if (chocaGusano(x, y)) {
      // Algunos puntos quedan pegados a una pared: probar un corrimiento lateral
      // antes de subir, para no terminar dentro del terreno.
      let libre = null;
      for (let dx = 8; dx <= 80 && !libre; dx += 8) {
        for (const sx of [x + dx, x - dx]) {
          if (sx < 12 || sx > MUNDO.w - 12) continue;
          if (!chocaGusano(sx, y)) { libre = sx; break; }
        }
      }
      if (libre != null) {
        x = libre;
      } else {
        let guarda = 0;
        while (chocaGusano(x, y) && guarda++ < 400) y -= 2;
      }
    }
    const w = new Gusano(equipo, G.equipos[equipo].gusanos.length, x, y);
    G.gusanos.push(w);
    G.equipos[equipo].gusanos.push(w);
  }

  for (let r = 0; r < G.config.gusanos; r++) {
    for (let t = 0; t < G.config.equipos; t++) {
      const w = G.equipos[t].gusanos[r];
      if (w) G.orden.push(w);
    }
  }

  recalcularBase();
  construirMarcador();
  q('menu').classList.add('hidden');
  q('online').classList.add('hidden');
  q('pausa').classList.add('hidden');
  q('fin').classList.add('hidden');
  q('hud').classList.remove('hidden');
  if (G.tactil) q('tactil').classList.remove('hidden');

  centrarCamara();
  soltarCaja();
  soltarCaja();
  G.turnoPtr = azarInt(0, G.orden.length - 1);
  iniciarTurno(G.orden[G.turnoPtr]);
  actualizarHUD();
  resetFinTactil();
  mostrarPistaTactil();
}

function reanudar() {
  if (G.estado !== 'pausa') return;
  q('pausa').classList.add('hidden');
  G.estado = 'jugando';
  G.fuegoPrev = true;
  G.fuegoRaton = false;
  if (G.tactil) q('tactil').classList.remove('hidden');
}

function volverAlMenu() {
  if (G.online && ONLINE.id) emitOnline('gusanos:abandonar', { id: ONLINE.id });
  G.online = false;
  ONLINE.id = null;
  ONLINE.sala = null;
  ONLINE.activo = false;
  ONLINE.jugadores = [];
  ONLINE.miSeat = -1;
  ONLINE.turno = -1;
  ONLINE.esMiTurno = false;
  ONLINE.esperando = false;
  ONLINE.listo = false;
  limpiarOnlineJuego();
  G.estado = 'menu';
  G.activo = null;
  G.mapa = null;
  G.terreno = null;
  G.gusanos = [];
  G.equipos = [];
  G.proyectiles = [];
  G.walkers = [];
  G.cajas = [];
  G.zonas = [];
  G.llamas = [];
  G.efectos = [];
  G.particulas = [];
  G.anillos = [];
  G.flotantes = [];
  G.cam.zoom = 1;
  G.cam.auto = true;
  soltarBotonesTactiles();
  G.fuegoRaton = false;
  G.fuegoPrev = false;
  punteroFuego = null;
  cancelarCargaTactil();
  resetFinTactil();
  const pista = q('tactilPista');
  if (pista) pista.classList.remove('visible');
  const t = q('tactil');
  if (t) t.classList.add('hidden');
  q('pausa').classList.add('hidden');
  q('fin').classList.add('hidden');
  q('online').classList.add('hidden');
  q('hud').classList.add('hidden');
  q('menu').classList.remove('hidden');
}

function construirMenu() {
  const cont = q('mapas');
  if (!cont) return;
  cont.innerHTML = '';
  if (!MAPAS.length) {
    cont.textContent = 'No se encontraron mapas.';
    return;
  }
  for (const m of MAPAS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mapa' + (m.id === G.mapaSel ? ' sel' : '');
    const img = document.createElement('img');
    img.src = m.thumb;
    img.alt = m.nombre;
    const nom = document.createElement('span');
    nom.textContent = m.nombre;
    const dim = document.createElement('small');
    dim.textContent = m.w + ' × ' + m.h;
    b.append(img, nom, dim);
    b.addEventListener('click', () => {
      G.mapaSel = m.id;
      for (const otro of cont.children) otro.classList.remove('sel');
      b.classList.add('sel');
      if (G.estado === 'menu') { recalcularBase(); }
    });
    cont.appendChild(b);
  }

  const iE = q('iEquipos');
  const upd = () => {
    if (iE) q('oEquipos').textContent = iE.value;
  };
  if (iE) iE.addEventListener('input', upd);
  upd();

  q('btnStart').addEventListener('click', iniciarPartida);
  const btnOnline = q('btnOnline');
  if (btnOnline) btnOnline.addEventListener('click', () => abrirOnline());
  q('btnSeguir').addEventListener('click', reanudar);
  q('btnReiniciar').addEventListener('click', () => {
    if (G.online) return volverAlMenu();
    iniciarPartida();
  });
  q('btnMenu').addEventListener('click', volverAlMenu);
  q('btnOtra').addEventListener('click', () => {
    if (G.online) return volverAlMenu();
    iniciarPartida();
  });
  q('btnMenuFin').addEventListener('click', volverAlMenu);
  q('btnPausaHud').addEventListener('click', pausar);
  const bc = q('btnOnlineCerrar');
  if (bc) bc.addEventListener('click', cerrarOnline);
  const br = q('btnRevancha');
  if (br) br.addEventListener('click', pedirRevancha);
  const bs = q('btnSalirOnline');
  if (bs) bs.addEventListener('click', volverASalaOnline);
}

// ─────────────────────────────────────────────────────────────────────
// Online: sala, turnos y snapshots
// ─────────────────────────────────────────────────────────────────────
function onodo(tag, cls, texto) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (texto != null && texto !== '') n.textContent = texto;
  return n;
}

function socketPadre() {
  try {
    const a = (window.parent && window.parent !== window) ? window.parent.app : window.app;
    return a && a.socket ? a.socket : null;
  } catch { return null; }
}

function emitOnline(ev, data) {
  return new Promise((resolve) => {
    const s = ONLINE.socket || enlazarOnline();
    if (!s) return resolve({ error: 'Entrá desde el chat para jugar online.' });
    let hecho = false;
    const t = setTimeout(() => { if (!hecho) { hecho = true; resolve({ error: 'El servidor no contestó. Probá de nuevo.' }); } }, 12000);
    try {
      s.emit(ev, data || {}, (r) => { if (hecho) return; hecho = true; clearTimeout(t); resolve(r || {}); });
    } catch {
      if (!hecho) { hecho = true; clearTimeout(t); resolve({ error: 'Sin conexión.' }); }
    }
  });
}

function enlazarOnline() {
  if (ONLINE.enlazado) return ONLINE.socket;
  const s = socketPadre();
  if (!s) { ONLINE.error = 'Entrá desde el chat para jugar online.'; return null; }
  ONLINE.socket = s;
  ONLINE.enlazado = true;
  ONLINE.error = null;
  s.on('gusanos:estado', (d) => {
    if (!d || (ONLINE.id && d.id !== ONLINE.id)) return;
    ONLINE.sala = d;
    ONLINE.id = d.id;
    ONLINE.miSeat = d.miSeat;
    ONLINE.soyCreador = !!d.soyCreador;
    ONLINE.listo = !!d.listo;
    ONLINE.jugadores = d.jugadores || [];
    ONLINE.turno = d.turno != null ? d.turno : ONLINE.turno;
    ONLINE.esMiTurno = d.estado === 'jugando' && d.turno === d.miSeat;
    if (d.estado === 'jugando' && d.soyJugador && G.estado !== 'jugando') {
      iniciarPartidaOnline({ ...d, miSeat: d.miSeat, inicio: true });
      return;
    }
    if (d.estado === 'terminada' && G.estado === 'jugando') {
      recibirFin({ id: d.id, ganador: d.ganador, motivo: d.motivo });
      return;
    }
    renderOnline();
  });
  s.on('gusanos:turno', (d) => recibirTurno(d));
  s.on('gusanos:snapshot', (d) => {
    if (!d || d.id !== ONLINE.id || ONLINE.esMiTurno || G.estado !== 'jugando') return;
    aplicarSnapshot(d.snapshot);
  });
  s.on('gusanos:fin', (d) => recibirFin(d));
  s.on('gusanos:revancha', (d) => {
    if (!d || !d.id || d.de !== ONLINE.id) return;
    ONLINE.id = d.id;
    ONLINE.sala = null;
    verSala(d.id);
  });
  s.on('gusanos:cambio', () => {
    const ov = q('online');
    if (ov && !ov.classList.contains('hidden') && !ONLINE.sala) cargarLobby();
  });
  s.on('disconnect', () => {
    ONLINE.error = 'Se cortó la conexión. Esperá un momento y volvé a entrar.';
    renderOnline();
  });
  s.on('connect', () => {
    if (ONLINE.id) verSala(ONLINE.id);
  });
  return s;
}

function abrirOnline(mesa) {
  enlazarOnline();
  q('menu').classList.add('hidden');
  q('online').classList.remove('hidden');
  ONLINE.error = null;
  if (!ONLINE.socket) { renderOnline(); return; }
  if (mesa) entrarSala(mesa);
  else cargarLobby();
}

function cerrarOnline() {
  const ov = q('online');
  if (ov) ov.classList.add('hidden');
  if (G.estado === 'menu') q('menu').classList.remove('hidden');
}

function cargarLobby() {
  enlazarOnline();
  if (!ONLINE.socket) { renderOnline(); return; }
  ONLINE.cargando = true;
  renderOnline();
  emitOnline('gusanos:inicio').then((d) => {
    ONLINE.cargando = false;
    if (d.error) { ONLINE.error = d.error; renderOnline(); return; }
    ONLINE.lobby = d;
    ONLINE.error = null;
    renderOnline();
  });
}

function entrarSala(id) {
  enlazarOnline();
  if (!ONLINE.socket) { renderOnline(); return; }
  ONLINE.id = String(id);
  ONLINE.cargando = true;
  ONLINE.error = null;
  renderOnline();
  emitOnline('gusanos:unirse', { id: ONLINE.id }).then((r) => {
    if (r.error) { ONLINE.cargando = false; ONLINE.error = r.error; ONLINE.id = null; renderOnline(); return; }
    verSala(r.id || ONLINE.id);
  });
}

function verSala(id) {
  if (!id) return;
  emitOnline('gusanos:ver', { id }).then((r) => {
    ONLINE.cargando = false;
    if (r.error) { ONLINE.error = r.error; renderOnline(); return; }
    const d = r.partida || r;
    ONLINE.sala = d;
    ONLINE.id = d.id;
    ONLINE.miSeat = d.miSeat;
    ONLINE.soyCreador = !!d.soyCreador;
    ONLINE.listo = !!d.listo;
    ONLINE.jugadores = d.jugadores || [];
    ONLINE.turno = d.turno != null ? d.turno : ONLINE.turno;
    ONLINE.esMiTurno = d.estado === 'jugando' && d.turno === d.miSeat;
    if (d.estado === 'jugando' && d.soyJugador && G.estado !== 'jugando') {
      iniciarPartidaOnline({ ...d, miSeat: d.miSeat, inicio: true });
      return;
    }
    renderOnline();
  });
}

function crearSalaOnline(mapa) {
  emitOnline('gusanos:crear', { mapa }).then((r) => {
    if (r.error) { toast(r.error, 2000); return; }
    entrarSala(r.id);
  });
}

function listoOnline() {
  if (!ONLINE.id) return;
  emitOnline('gusanos:listo', { id: ONLINE.id, listo: !ONLINE.listo }).then((r) => {
    if (r.error) toast(r.error, 1800);
  });
}

function empezarOnline() {
  if (!ONLINE.id) return;
  emitOnline('gusanos:empezar', { id: ONLINE.id }).then((r) => {
    if (r.error) toast(r.error, 2000);
  });
}

function chatOnline(texto) {
  if (!ONLINE.id) return;
  emitOnline('gusanos:chat', { id: ONLINE.id, texto }).then((r) => {
    if (r.error) toast(r.error, 1600);
  });
}

function salirSalaOnline() {
  if (ONLINE.id) emitOnline('gusanos:abandonar', { id: ONLINE.id });
  const id = ONLINE.id;
  ONLINE.sala = null;
  ONLINE.id = null;
  ONLINE.miSeat = -1;
  ONLINE.jugadores = [];
  ONLINE.turno = -1;
  ONLINE.esMiTurno = false;
  ONLINE.listo = false;
  ONLINE.esperando = false;
  ONLINE.finEnviado = false;
  if (id) cargarLobby();
  else renderOnline();
}

function pedirRevancha() {
  if (!ONLINE.id) return;
  const b = q('btnRevancha');
  if (b) b.disabled = true;
  emitOnline('gusanos:revancha', { id: ONLINE.id }).then((r) => {
    if (r.error) { toast(r.error, 1800); if (b) b.disabled = false; return; }
    if (r.id && r.id !== ONLINE.id) { ONLINE.id = r.id; verSala(r.id); }
    else toast('Esperando a los demás…', 1400);
  });
}

function limpiarOnlineJuego() {
  ONLINE.activo = false;
  ONLINE.esMiTurno = false;
  ONLINE.esperando = false;
  ONLINE.finEnviado = false;
  ONLINE.paso = 0;
  ONLINE.ultimoEnvio = 0;
  const b = q('btnRevancha'), s = q('btnSalirOnline'), o = q('btnOtra');
  if (b) { b.classList.add('hidden'); b.disabled = false; }
  if (s) s.classList.add('hidden');
  if (o) o.classList.remove('hidden');
}

function renderOnline() {
  const box = q('onlineCuerpo');
  if (!box) return;
  const escrito = box.querySelector('#onlineChatInput');
  const texto = escrito ? escrito.value : '';
  box.textContent = '';
  if (ONLINE.error) box.appendChild(onodo('div', 'onlineAviso', ONLINE.error));
  if (!ONLINE.socket) {
    box.appendChild(onodo('div', 'onlineVacio', 'El online usa la conexión del chat. Abrí Gusanos desde la biblioteca del chat.'));
    return;
  }
  if (ONLINE.sala) renderSalaOnline(box, ONLINE.sala);
  else renderLobbyOnline(box);
  const input = box.querySelector('#onlineChatInput');
  if (input && texto) input.value = texto;
}

function seccionOnline(box, titulo) {
  const s = onodo('section', 'onlineSeccion');
  s.appendChild(onodo('div', 'onlineTitulo', titulo));
  box.appendChild(s);
  return s;
}

function renderLobbyOnline(box) {
  if (ONLINE.cargando && !ONLINE.lobby) {
    box.appendChild(onodo('div', 'onlineEstado', 'Buscando salas…'));
    return;
  }
  const d = ONLINE.lobby;
  if (!d) {
    box.appendChild(onodo('div', 'onlineVacio', 'No se pudo cargar la lista de salas.'));
    return;
  }

  const mias = seccionOnline(box, 'Tus salas');
  const listaMias = onodo('div', 'onlineLista');
  mias.appendChild(listaMias);
  if (!(d.mias || []).length) listaMias.appendChild(onodo('div', 'onlineVacio', 'Todavía no estás en ninguna sala.'));
  for (const m of d.mias || []) {
    const fila = onodo('div', 'onlineFila');
    const quien = m.estado === 'esperando' ? 'Esperando jugadores' : (m.ganador != null ? 'Terminada' : 'En juego');
    const meta = onodo('div', 'onlineCrecimiento');
    meta.appendChild(onodo('div', 'onlineNombre', (m.mapa || 'crossing') + ' · ' + (m.jugadores || 0) + ' jugador' + ((m.jugadores || 0) === 1 ? '' : 'es')));
    meta.appendChild(onodo('div', 'onlineMeta', quien + (m.teToca ? ' · te toca' : '')));
    fila.appendChild(meta);
    if (m.teToca) fila.appendChild(onodo('span', 'jg-chip amarillo', 'Te toca'));
    const b = onodo('button', null, m.estado === 'jugando' ? 'Seguir' : 'Entrar');
    b.type = 'button';
    b.addEventListener('click', () => entrarSala(m.id));
    fila.appendChild(b);
    listaMias.appendChild(fila);
  }

  const abiertas = seccionOnline(box, 'Mesas esperando rival');
  const lista = onodo('div', 'onlineLista');
  abiertas.appendChild(lista);
  if (!(d.abiertas || []).length) lista.appendChild(onodo('div', 'onlineVacio', 'No hay mesas abiertas. Creá una y pasá el enlace.'));
  for (const a of d.abiertas || []) {
    const fila = onodo('div', 'onlineFila');
    const meta = onodo('div', 'onlineCrecimiento');
    meta.appendChild(onodo('div', 'onlineNombre', (a.creador && a.creador.nombre) || 'Alguien'));
    meta.appendChild(onodo('div', 'onlineMeta', (a.mapa || 'crossing') + ' · ' + (a.jugadores || 1) + '/5 · Shopper'));
    fila.appendChild(meta);
    const b = onodo('button', null, 'Unirse');
    b.type = 'button';
    b.addEventListener('click', () => entrarSala(a.id));
    fila.appendChild(b);
    lista.appendChild(fila);
  }

  const crear = seccionOnline(box, 'Crear una sala');
  const btns = onodo('div', 'onlineBtns');
  const sel = onodo('select', 'onlineSelect');
  for (const m of MAPAS) {
    const o = onodo('option', null, m.nombre + ' · ' + m.w + '×' + m.h);
    o.value = m.id;
    if (m.id === G.mapaSel) o.selected = true;
    sel.appendChild(o);
  }
  const b = onodo('button', 'principal', 'Crear sala');
  b.type = 'button';
  b.addEventListener('click', () => crearSalaOnline(sel.value));
  btns.append(sel, b);
  crear.appendChild(btns);
  crear.appendChild(onodo('div', 'onlineLink', 'La sala queda con enlace para compartir: /app?juegos=gusanos&mesa=…'));
}

function renderSalaOnline(box, d) {
  const estado = d.estado === 'jugando' ? 'Partida en curso' : d.estado === 'terminada' ? 'Partida terminada' : 'Esperando jugadores';
  box.appendChild(onodo('div', 'onlineEstado', estado + ' · ' + (d.mapa || 'crossing') + ' · Shopper · CBA' + (d.estado === 'jugando' && d.turno != null && d.jugadores[d.turno] ? ' · Turno de ' + d.jugadores[d.turno].nombre : '')));

  const jug = seccionOnline(box, 'Jugadores (' + (d.jugadores || []).length + '/5)');
  const lista = onodo('div', 'onlineLista');
  jug.appendChild(lista);
  for (const j of d.jugadores || []) {
    const fila = onodo('div', 'onlineFila');
    const punto = onodo('span', 'onlinePunto ' + (j.listo || d.estado !== 'esperando' ? 'si' : 'no'));
    const meta = onodo('div', 'onlineCrecimiento');
    meta.appendChild(onodo('div', 'onlineNombre', j.nombre + (j.yo ? ' (vos)' : '')));
    const detalles = [];
    if (j.creador) detalles.push('creador');
    if (d.estado === 'esperando') detalles.push(j.listo ? 'listo' : 'sin listo');
    if (j.conectado === false) detalles.push('desconectado');
    if (d.estado === 'jugando' && d.turno === d.jugadores.indexOf(j)) detalles.push('su turno');
    meta.appendChild(onodo('div', 'onlineMeta', detalles.join(' · ') || 'en la sala'));
    fila.append(punto, meta);
    lista.appendChild(fila);
  }

  const acciones = onodo('div', 'onlineBtns');
  if (d.estado === 'esperando') {
    if (d.soyJugador) {
      const bl = onodo('button', null, d.listo ? 'Cancelar listo' : 'Estoy listo');
      bl.type = 'button';
      bl.addEventListener('click', listoOnline);
      acciones.appendChild(bl);
    }
    if (d.soyCreador) {
      const be = onodo('button', 'principal', 'Empezar');
      be.type = 'button';
      be.disabled = (d.jugadores || []).length < 2 || !d.todosListos;
      be.title = be.disabled ? 'Faltan jugadores o que todos estén listos' : '';
      be.addEventListener('click', empezarOnline);
      acciones.appendChild(be);
    }
  } else if (d.estado === 'jugando' && d.soyJugador) {
    const bv = onodo('button', 'principal', G.estado === 'jugando' ? 'Volver al juego' : 'Entrar a la partida');
    bv.type = 'button';
    bv.addEventListener('click', () => {
      if (G.estado === 'jugando') cerrarOnline();
      else verSala(d.id);
    });
    acciones.appendChild(bv);
  } else if (d.estado === 'terminada') {
    const quien = d.ganador != null && d.jugadores[d.ganador] ? d.jugadores[d.ganador].nombre : null;
    box.appendChild(onodo('div', 'onlineAviso', quien ? 'Ganó ' + quien + '.' : 'La partida terminó.'));
    if (d.soyJugador) {
      const br = onodo('button', 'principal', 'Pedir revancha');
      br.type = 'button';
      const ya = (d.revancha || []).filter(Boolean).length;
      if (d.yoRevancha) br.disabled = true;
      br.textContent = d.yoRevancha ? 'Revancha pedida (' + ya + ')' : 'Pedir revancha';
      br.addEventListener('click', pedirRevancha);
      acciones.appendChild(br);
    }
  }

  const bc = onodo('button', null, 'Compartir enlace');
  bc.type = 'button';
  bc.addEventListener('click', () => compartirSala(d.id));
  acciones.appendChild(bc);

  if (d.soyJugador) {
    const bs = onodo('button', null, d.estado === 'jugando' ? 'Abandonar partida' : 'Salir de la sala');
    bs.type = 'button';
    bs.addEventListener('click', salirSalaOnline);
    acciones.appendChild(bs);
  }
  box.appendChild(acciones);

  if (d.soyJugador) {
    const chat = seccionOnline(box, 'Chat de la sala');
    const listaChat = onodo('div', 'onlineChat');
    for (const m of d.chat || []) {
      const x = onodo('div', 'msg' + (m.mio ? ' mio' : ''));
      x.appendChild(onodo('b', null, m.quien || '?'));
      x.appendChild(document.createTextNode(': ' + m.text));
      listaChat.appendChild(x);
    }
    if (!(d.chat || []).length) listaChat.appendChild(onodo('div', 'onlineVacio', 'Todavía no hay mensajes.'));
    chat.appendChild(listaChat);
    const form = onodo('form', 'onlineChatForm');
    const input = onodo('input');
    input.id = 'onlineChatInput';
    input.type = 'text';
    input.maxLength = 200;
    input.autocomplete = 'off';
    input.placeholder = 'Escribí un mensaje';
    const enviar = onodo('button', null, 'Enviar');
    enviar.type = 'submit';
    form.append(input, enviar);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = input.value.trim();
      if (!t) return;
      input.value = '';
      chatOnline(t);
    });
    chat.appendChild(form);
    listaChat.scrollTop = listaChat.scrollHeight;
  }
}

function compartirSala(id) {
  let base = location.origin;
  try { if (window.parent && window.parent !== window) base = window.parent.location.origin; } catch { /* mismo origen */ }
  const url = base + '/app?juegos=gusanos&mesa=' + encodeURIComponent(id);
  if (navigator.share && matchMedia('(max-width: 768px)').matches) {
    navigator.share({ title: 'Gusanos online', url }).catch(() => {});
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => toast('Enlace copiado', 1400), () => prompt('Copiá el enlace:', url));
  } else prompt('Copiá el enlace:', url);
}

function iniciarPartidaOnline(d) {
  const meta = MAPAS.find(m => m.id === d.mapa) || MAPAS.find(m => m.id === G.mapaSel) || MAPAS[0];
  if (!meta) { toast('No hay mapas cargados', 2500); return; }
  if (d.turno == null || !(d.jugadores || []).length) return;

  MUNDO.w = meta.w;
  MUNDO.h = meta.h;
  MUNDO.agua = meta.agua != null ? meta.agua : meta.h - 40;
  if (!G.mapa || G.mapa.id !== meta.id) {
    for (const k of [...IMGS.keys()]) if (k.indexOf('assets/maps/') === 0) IMGS.delete(k);
  }
  G.mapa = meta;
  G.terreno = new Terreno(meta);

  G.online = true;
  ONLINE.activo = true;
  ONLINE.id = d.id;
  ONLINE.miSeat = d.miSeat;
  ONLINE.soyCreador = !!d.soyCreador;
  ONLINE.jugadores = d.jugadores || [];
  ONLINE.turno = d.turno;
  ONLINE.viento = d.viento != null ? d.viento : 0;
  ONLINE.ronda = d.ronda || 1;
  ONLINE.esMiTurno = d.turno === d.miSeat;
  ONLINE.esperando = false;
  ONLINE.finEnviado = false;
  ONLINE.paso = 0;
  ONLINE.ultimoEnvio = 0;
  ONLINE.sala = null;
  G.config.equipos = clamp(ONLINE.jugadores.length || 2, 2, 5);
  G.config.gusanos = 1;
  G.cba = true;
  G.estado = 'jugando';
  G.fase = 'mover';
  G.activo = null;
  G.tiempo = TIEMPO_TURNO;
  G.retirada = 0;
  G.viento = ONLINE.viento;
  G.cajas = [];
  G.proyectiles = [];
  G.walkers = [];
  G.zonas = [];
  G.llamas = [];
  G.efectos = [];
  G.particulas = [];
  G.anillos = [];
  G.flotantes = [];
  G.sacudir = 0;
  G.cargando = false;
  G.carga = 0;
  G.armaCargando = null;
  G.cargaOrigen = null;
  G.fuegoPrev = false;
  G.fuegoRaton = false;
  G.raton.dentro = false;
  soltarBotonesTactiles();
  punteroFuego = null;
  G.cbaHecha = false;
  G.usadoSoga = false;
  G.armaSel = 0;
  G.equipos = [];
  G.gusanos = [];
  G.orden = [];
  G.turnoPtr = -1;
  G.cam.zoom = 1;
  G.cam.auto = true;
  G.cam.libre = 0;
  G.crateTimer = azar(4, 6);
  idGusano = 0;

  for (let t = 0; t < G.config.equipos; t++) G.equipos.push({ indice: t, municion: {}, gusanos: [] });

  const total = G.config.equipos;
  const puntos = puntosDeAparicion(total, meta);
  for (let i = 0; i < total; i++) {
    const p = puntos[i] || [meta.w * (i + 0.5) / total, MUNDO.agua - 60];
    let x = clamp(p[0], 12, MUNDO.w - 12);
    let y = p[1] - 8;
    if (chocaGusano(x, y)) {
      let libre = null;
      for (let dx = 8; dx <= 80 && !libre; dx += 8) {
        for (const sx of [x + dx, x - dx]) {
          if (sx < 12 || sx > MUNDO.w - 12) continue;
          if (!chocaGusano(sx, y)) { libre = sx; break; }
        }
      }
      if (libre != null) x = libre;
      else {
        let guarda = 0;
        while (chocaGusano(x, y) && guarda++ < 400) y -= 2;
      }
    }
    const w = new Gusano(i, 0, x, y);
    G.gusanos.push(w);
    G.equipos[i].gusanos.push(w);
  }
  G.orden = G.gusanos.slice();

  recalcularBase();
  construirMarcador();
  q('menu').classList.add('hidden');
  q('online').classList.add('hidden');
  q('pausa').classList.add('hidden');
  q('fin').classList.add('hidden');
  q('hud').classList.remove('hidden');
  if (G.tactil) q('tactil').classList.remove('hidden');
  limpiarOnlineJuego();
  ONLINE.activo = true;
  ONLINE.esMiTurno = d.turno === d.miSeat;
  ONLINE.esperando = false;
  G.online = true;

  const w = G.orden[d.turno];
  if (!w) return;
  G.turnoPtr = d.turno;
  iniciarTurno(w, true);
  G.viento = ONLINE.viento;
  if (d.snapshot) aplicarSnapshot(d.snapshot);
  ONLINE.esMiTurno = d.turno === ONLINE.miSeat;
  actualizarArmas();
  actualizarHUD();
  centrarCamara(true);
  resetFinTactil();
  mostrarPistaTactil();
  toast(ONLINE.esMiTurno ? 'Tu turno' : 'Turno de ' + nombreEquipo(d.turno), 1300);
}

function capturarSnapshot() {
  return {
    v: 1,
    mapa: G.mapa ? G.mapa.id : null,
    fase: G.fase,
    tiempo: G.tiempo,
    retirada: G.retirada,
    viento: G.viento,
    turnoPtr: G.turnoPtr,
    turnoEquipo: G.activo ? G.activo.equipo : -1,
    turnoId: G.activo ? G.activo.id : null,
    config: { equipos: G.config.equipos, gusanos: 1, hp: G.config.hp, turno: G.config.turno },
    cba: G.cba,
    cbaHecha: G.cbaHecha,
    usadoSoga: G.usadoSoga,
    mecha: G.mecha,
    gusanos: G.gusanos.map(w => ({
      id: w.id, equipo: w.equipo, idx: w.idx, nombre: w.nombre,
      x: w.x, y: w.y, vx: w.vx, vy: w.vy, hp: w.hp, hpMax: w.hpMax,
      muerto: w.muerto, causa: w.causa, muerteT: w.muerteT, hundiendo: w.hundiendo,
      enPiso: w.enPiso, mirando: w.mirando, ultimaDir: w.ultimaDir, aim: w.aim, paso: w.paso,
      caminando: w.caminando, animCaminar: w.animCaminar, dirCaminar: w.dirCaminar, voltereta: w.voltereta, volteretaDur: w.volteretaDur,
      soga: {
        estado: w.soga.estado, ax: w.soga.ax, ay: w.soga.ay, hx: w.soga.hx, hy: w.soga.hy,
        dx: w.soga.dx, dy: w.soga.dy, recorrido: w.soga.recorrido, len: w.soga.len,
        bloqueada: !!w.soga.bloqueada,
        pivotes: (w.soga.pivotes || []).map(p => ({ x: p.x, y: p.y })),
      },
    })),
    equipos: G.equipos.map(e => ({ municion: { ...e.municion } })),
    cajas: G.cajas.map(c => ({ ...c })),
    proyectiles: G.proyectiles,
    walkers: G.walkers,
    zonas: G.zonas,
    llamas: G.llamas,
    efectos: G.efectos,
    particulas: G.particulas,
    anillos: G.anillos,
    flotantes: G.flotantes,
    orden: G.orden.map(w => w.id),
  };
}

function aplicarSnapshot(s) {
  if (!s || !G.mapa || (s.mapa && s.mapa !== G.mapa.id)) return;
  if (Array.isArray(s.gusanos)) {
    for (const d of s.gusanos) {
      const w = G.gusanos.find(g => g.id === d.id) || G.gusanos.find(g => g.equipo === d.equipo);
      if (!w) continue;
      Object.assign(w, d);
      w.soga = d.soga ? {
        estado: d.soga.estado, ax: d.soga.ax, ay: d.soga.ay, hx: d.soga.hx, hy: d.soga.hy,
        dx: d.soga.dx, dy: d.soga.dy, recorrido: d.soga.recorrido, len: d.soga.len,
        bloqueada: !!d.soga.bloqueada,
        pivotes: (d.soga.pivotes || []).map(p => ({ x: p.x, y: p.y })),
      } : w.soga;
      if (w.soga && w.soga.bloqueada == null) w.soga.bloqueada = false;
    }
  }
  if (Array.isArray(s.equipos)) {
    for (let i = 0; i < s.equipos.length; i++) {
      if (G.equipos[i] && s.equipos[i].municion) G.equipos[i].municion = { ...s.equipos[i].municion };
    }
  }
  G.cajas = Array.isArray(s.cajas) ? s.cajas : [];
  G.proyectiles = Array.isArray(s.proyectiles) ? s.proyectiles : [];
  G.walkers = Array.isArray(s.walkers) ? s.walkers : [];
  G.zonas = Array.isArray(s.zonas) ? s.zonas : [];
  G.llamas = Array.isArray(s.llamas) ? s.llamas : [];
  G.efectos = Array.isArray(s.efectos) ? s.efectos : [];
  G.particulas = Array.isArray(s.particulas) ? s.particulas : [];
  G.anillos = Array.isArray(s.anillos) ? s.anillos : [];
  G.flotantes = Array.isArray(s.flotantes) ? s.flotantes : [];
  if (Array.isArray(s.orden) && s.orden.length === G.gusanos.length) {
    const porId = new Map(G.gusanos.map(w => [w.id, w]));
    const orden = s.orden.map(id => porId.get(id)).filter(Boolean);
    if (orden.length === G.gusanos.length) G.orden = orden;
  }
  if (typeof s.turnoPtr === 'number') G.turnoPtr = s.turnoPtr;
  if (s.turnoId != null) {
    const i = G.orden.findIndex(w => w.id === s.turnoId);
    if (i >= 0) { G.turnoPtr = i; G.activo = G.orden[i]; }
  } else if (s.turnoEquipo != null && s.turnoEquipo >= 0) {
    const i = G.orden.findIndex(w => w.equipo === s.turnoEquipo);
    if (i >= 0) { G.turnoPtr = i; G.activo = G.orden[i]; }
  } else if (G.orden[G.turnoPtr]) {
    G.activo = G.orden[G.turnoPtr];
  }
  G.fase = s.fase || 'mover';
  G.tiempo = typeof s.tiempo === 'number' ? s.tiempo : G.tiempo;
  G.retirada = typeof s.retirada === 'number' ? s.retirada : G.retirada;
  G.viento = typeof s.viento === 'number' ? s.viento : G.viento;
  G.cba = s.cba !== false;
  G.cbaHecha = !!s.cbaHecha;
  G.usadoSoga = !!s.usadoSoga;
  G.mecha = s.mecha || G.mecha;
  G.estado = 'jugando';
  actualizarArmas();
  actualizarHUD();
}

function enviarSnapshot() {
  if (!G.online || !ONLINE.esMiTurno || ONLINE.esperando || !ONLINE.id) return;
  const s = ONLINE.socket;
  if (!s) return;
  try { s.emit('gusanos:snapshot', { id: ONLINE.id, snapshot: capturarSnapshot() }); } catch { /* sin conexión */ }
}

function enviarFinTurno() {
  if (!G.online || ONLINE.finEnviado) return;
  ONLINE.finEnviado = true;
  ONLINE.esMiTurno = false;
  ONLINE.esperando = true;
  const snap = capturarSnapshot();
  G.fase = 'esperando';
  G.cargando = false;
  G.carga = 0;
  G.armaCargando = null;
  G.cargaOrigen = null;
  if (ONLINE.socket) {
    try { ONLINE.socket.emit('gusanos:finTurno', { id: ONLINE.id, snapshot: snap }); } catch { /* sin conexión */ }
  }
  actualizarHUD();
  toast('Turno enviado · esperando al resto', 1400);
}

function recibirTurno(d) {
  if (!d || d.id !== ONLINE.id || d.turno == null) return;
  if (d.miSeat != null) ONLINE.miSeat = d.miSeat;
  if (d.jugadores) ONLINE.jugadores = d.jugadores;
  ONLINE.turno = d.turno;
  ONLINE.viento = d.viento != null ? d.viento : 0;
  ONLINE.ronda = d.ronda || ONLINE.ronda;
  ONLINE.esMiTurno = d.turno === ONLINE.miSeat;
  ONLINE.esperando = false;
  ONLINE.finEnviado = false;
  ONLINE.ultimoEnvio = 0;
  if (d.inicio || G.estado !== 'jugando' || !G.mapa || !G.online) {
    iniciarPartidaOnline({ ...d, miSeat: d.miSeat != null ? d.miSeat : ONLINE.miSeat, jugadores: d.jugadores || ONLINE.jugadores });
  } else {
    if (d.snapshot) aplicarSnapshot(d.snapshot);
    const w = G.orden[d.turno] || G.gusanos.find(g => g.equipo === d.turno);
    if (!w) return;
    G.turnoPtr = G.orden.indexOf(w);
    iniciarTurno(w, true);
    G.viento = ONLINE.viento;
    G.online = true;
    ONLINE.esMiTurno = d.turno === ONLINE.miSeat;
    actualizarArmas();
    actualizarHUD();
    centrarCamara(true);
  }
  cerrarOnline();
  toast(ONLINE.esMiTurno ? 'Tu turno' : 'Turno de ' + nombreEquipo(ONLINE.turno), 1300);
}

function recibirFin(d) {
  if (!d || d.id !== ONLINE.id) return;
  if (d.snapshot) aplicarSnapshot(d.snapshot);
  G.estado = 'fin';
  G.online = true;
  ONLINE.esMiTurno = false;
  ONLINE.esperando = true;
  const t = q('tactil');
  if (t) t.classList.add('hidden');
  const el = q('finTitulo'), txt = q('finTexto');
  const ganador = d.ganador;
  if (ganador != null && ganador === ONLINE.miSeat) {
    el.textContent = 'GANASTE';
    el.style.color = '#f2c14e';
    txt.textContent = 'Quedaste en pie.';
  } else if (ganador != null && ONLINE.jugadores[ganador]) {
    el.textContent = 'GANÓ ' + ONLINE.jugadores[ganador].nombre.toUpperCase();
    el.style.color = '#f2c14e';
    txt.textContent = d.motivo === 'abandono' ? 'El rival abandonó la partida.' : 'Quedó un solo gusano en pie.';
  } else {
    el.textContent = 'TERMINÓ LA PARTIDA';
    el.style.color = '#ddd';
    txt.textContent = d.motivo === 'abandono' ? (d.abandono ? d.abandono + ' abandonó.' : 'Alguien abandonó.') : 'No quedó nadie en pie.';
  }
  const otra = q('btnOtra'), rev = q('btnRevancha'), salir = q('btnSalirOnline');
  if (otra) otra.classList.add('hidden');
  if (rev) { rev.classList.remove('hidden'); rev.disabled = false; rev.textContent = 'REVANCHA'; }
  if (salir) salir.classList.remove('hidden');
  q('fin').classList.remove('hidden');
}

function volverASalaOnline() {
  const id = ONLINE.id;
  G.estado = 'menu';
  G.activo = null;
  G.fase = 'mover';
  q('fin').classList.add('hidden');
  q('hud').classList.add('hidden');
  q('tactil').classList.add('hidden');
  limpiarOnlineJuego();
  ONLINE.sala = null;
  q('online').classList.remove('hidden');
  if (id) verSala(id);
  else abrirOnline();
}

// ─────────────────────────────────────────────────────────────────────
// Entrada extra
// ─────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    if (G.estado === 'pausa') { reanudar(); return; }
    if (G.estado === 'fin') { volverAlMenu(); return; }
  }
  if (e.code === 'Enter' && G.estado === 'fin') { iniciarPartida(); return; }
});
window.addEventListener('blur', () => {
  G.fuegoRaton = false;
  G.fuegoPrev = false;
  teclas.shift = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.estado === 'jugando') pausar();
});

// ─────────────────────────────────────────────────────────────────────
// Bucle principal (lógica fija a 50 Hz, dibujo por frame)
// ─────────────────────────────────────────────────────────────────────
let ultimoT = performance.now();
let acumulador = 0;

function bucle(t) {
  const dt = Math.min(200, t - ultimoT);
  ultimoT = t;
  if (G.estado === 'jugando') {
    acumulador += dt;
    let n = 0;
    while (acumulador >= PASO_MS && n < 6) {
      paso();
      acumulador -= PASO_MS;
      n++;
    }
    if (n >= 6) acumulador = 0;
  } else {
    acumulador = 0;
  }
  dibujar();
  requestAnimationFrame(bucle);
}

// ─────────────────────────────────────────────────────────────────────
// API de depuración
// ─────────────────────────────────────────────────────────────────────
window.WS = {
  G,
  iniciar: iniciarPartida,
  mapa: id => { if (id) G.mapaSel = id; iniciarPartida(); },
  paso: (n = 1) => { for (let i = 0; i < n; i++) paso(); dibujar(); },
  fisica: (n = 1) => { for (let i = 0; i < n; i++) paso(); },
  estado: () => ({
    estado: G.estado, fase: G.fase, tiempo: +G.tiempo.toFixed(2),
    activo: G.activo && G.activo.nombre, equipo: G.activo && G.activo.equipo,
    hp: G.gusanos.map(g => ({ eq: g.equipo, hp: g.hp, x: +g.x.toFixed(1), y: +g.y.toFixed(1), muerto: g.muerto })),
    cam: { x: +G.cam.x.toFixed(1), y: +G.cam.y.toFixed(1), zoom: G.cam.zoom, base: +G.cam.base.toFixed(3), auto: G.cam.auto },
    agua: MUNDO.agua, proyectiles: G.proyectiles.length, cajas: G.cajas.length,
    cba: G.cba, cbaHecha: G.cbaHecha, armas: G.armas.length,
  }),
  dar: (id, n = 1) => {
    if (!G.activo) return;
    const eq = G.equipos[G.activo.equipo];
    eq.municion[id] = (eq.municion[id] || 0) + n;
    actualizarArmas();
  },
  caja: () => soltarCaja(),
  soga: () => G.activo && G.activo.soga,
  tecla: (k, v) => { teclas[k] = v; },
  disparar: () => alPresionarFuego(),
  soltar: () => alSoltarFuego(),
  elegir: (i) => seleccionarArma(i),
  recoger: () => { if (G.activo) recogerCaja(G.activo); },
  cajas: () => G.cajas,
  online: ONLINE,
  abrirOnline,
  verSala,
  recibirTurno,
  recibirFin,
  iniciarPartidaOnline,
  capturarSnapshot,
  aplicarSnapshot,
};

// ─────────────────────────────────────────────────────────────────────
// Inicio
// ─────────────────────────────────────────────────────────────────────
prepararTactil();
construirMenu();
ajustarLienzo();
cargarSonidos();
// Enlace directo a una sala (/app?juegos=gusanos&mesa=ID): la abre sola. El iframe
// arranca en el menú y a los pocos milisegundos ya tiene el socket del chat.
try {
  const mesa = new URLSearchParams(location.search).get('mesa');
  if (mesa && /^[a-f0-9]{6,20}$/.test(mesa)) setTimeout(() => abrirOnline(mesa), 300);
} catch { /* sin query */ }
requestAnimationFrame(bucle);
})();
