// El catalogo de muebles: se baja una vez por version (GET /puente/api/hotel/catalogo?v=N, publico
// y cacheado) y se arma desde ese objeto (sin snapshots de Firebase ni precarga de imagenes:
// los muebles se dibujan por codigo o con su grilla). Reemplaza services/catalog.js,
// catalogAssets.js, catalogGlueRuntime.js y la parte de red de catalogFurnitureRuntime.js.
import { PATRONES_PARED, PATRONES_PISO, COLORES_DECO } from '../config/hotel.js';

export const RUTA_CATALOGO = '/puente/api/hotel/catalogo';

// Solo se piden cosas del mismo sitio, debajo de /puente/ o /uploads/ (guardia de catalogAssets).
export function rutaPermitida(ruta) {
  return typeof ruta === 'string' && /^\/(puente|uploads)\//.test(ruta) && ruta.indexOf('//') < 0 && ruta.indexOf('..') < 0;
}

export function crearCatalogo(o) {
  const M = o.M;
  let v = 0;
  let filas = {};          // id -> fila
  let orden = [];          // ids en orden de catalogo
  let poses = {};          // forma de rawCatalog para avatarSeatPoses/avatarPoseTuning
  let deco = { pared: PATRONES_PARED, piso: PATRONES_PISO, colores: COLORES_DECO };
  const entradas = new Map(); // memo de entradaDesdeCatalogo

  function armar(r) {
    filas = {}; orden = []; entradas.clear();
    for (const f of (r.items || [])) {
      if (!f || typeof f.id !== 'string' || f.visible === false) continue;
      filas[f.id] = f; orden.push(f.id);
    }
    poses = r.poses && typeof r.poses === 'object' ? r.poses : {};
    const d = r.decoracion;
    if (d && typeof d === 'object') {
      deco = {
        pared: M.sanitizePatterns(d.pared, PATRONES_PARED, (x) => JSON.parse(JSON.stringify(x))),
        piso: M.sanitizePatterns(d.piso, PATRONES_PISO, (x) => JSON.parse(JSON.stringify(x))),
        colores: M.sanitizeColors(d.colores, COLORES_DECO, (x) => JSON.parse(JSON.stringify(x))).map((c, i) => Object.assign({ id: (d.colores && d.colores[i] && d.colores[i].id) || String(i) }, c)),
      };
    }
    v = Number(r.v) || v;
  }

  async function cargar(version) {
    const ruta = RUTA_CATALOGO + '?v=' + encodeURIComponent(String(version || 0));
    if (!rutaPermitida(ruta)) throw new Error('ruta');
    const res = await fetch(ruta, { credentials: 'same-origin', cache: version ? 'default' : 'no-cache' });
    if (!res.ok) throw new Error('El catálogo no respondió (' + res.status + ').');
    const r = await res.json();
    armar(r);
    return r;
  }

  return {
    cargar,
    armar,
    get v() { return v; },
    fila: (id) => filas[id] || null,
    nombre: (id) => (filas[id] && filas[id].nombre) || 'Mueble',
    entrada(id) {
      if (!filas[id]) return null;
      if (!entradas.has(id)) entradas.set(id, M.entradaDesdeCatalogo(filas[id]));
      return entradas.get(id);
    },
    lista: () => orden.map((id) => filas[id]),
    categorias() {
      const c = [];
      for (const id of orden) { const k = filas[id].categoria || 'Varios'; if (c.indexOf(k) < 0) c.push(k); }
      return c;
    },
    poses: () => poses,
    deco: () => deco,
  };
}
