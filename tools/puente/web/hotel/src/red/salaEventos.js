// Aplica los avisos del servidor (contrato.A_SALA, A_PERSONA, A_NAV y A_TODOS) al estado local
// de la sala. No toca la pantalla: avisa con los ganchos (`g`) y la escena se redibuja sola.
// Sin DOM: se prueba en node (pruebas/hotel/salaEventos.prueba.js).
//
// La sala local (armarSala, desde la respuesta de hotel:entrar):
//   { slug, meta, capa, puerta, muebles:{m:{m,clave,c,rot,s,datos,x,y,pared}}, porClave:{clave:m},
//     jugadores:{u:p}, derechos:Set, puedoBase, puedo, mensajes:[{id,u,nombre,texto,t}], version }
//
// Un jugador como lo manda el servidor (en entrar.jugadores y en hotel:llega {j}). Lo que no
// viene se toma por defecto; el servidor real tiene que mandar por lo menos u, nombre, x, y:
//   { u, nombre, foto?, avatar, estado?, equipo?, x, y,      posicion de arranque
//     c?, dx?, dy?, ms?,                                     camino en curso: cadena, destino y ms ya caminados
//     d?,                                                    para donde mira (0-7) si esta quieto
//     sienta?: {m,s,d,ox,oy}, ausente?, escribe? }
// Ids de personas y de muebles: siempre String() adentro del cliente.

const MAX_MENSAJES = 100;

function S(v) { return v == null ? null : String(v); }

// Un mueble del servidor -> el local (con x,y o pared ya leidos de la clave).
export function muebleLocal(M, m, rec) {
  const clave = rec.clave;
  const out = { m: S(m), clave, c: rec.c, rot: rec.rot | 0, s: rec.s | 0, datos: rec.datos || null, x: null, y: null, pared: null };
  if (typeof clave === 'string' && clave.indexOf('wall:') === 0) {
    out.pared = M.leerClavePared(clave);
  } else if (typeof clave === 'string') {
    const p = clave.split(',');
    out.x = parseInt(p[0], 10); out.y = parseInt(p[1], 10);
  }
  return out;
}

// Un jugador del servidor -> el local.
export function jugadorLocal(M, j, ahora) {
  const p = {
    u: S(j.u), nombre: String(j.nombre || ''), foto: j.foto || null, avatar: j.avatar || null,
    estado: j.estado || '', equipo: !!j.equipo,
    x0: j.x | 0, y0: j.y | 0, pasos: [], c: '', t0: ahora, dx: j.x | 0, dy: j.y | 0,
    px: j.x | 0, py: j.y | 0, dir: Number.isInteger(j.d) ? j.d : 4, fase: 0, caminando: false,
    sentado: null, cabeza: null, cabezaHasta: 0, escribe: !!j.escribe, escribeHasta: 0,
    ausente: !!j.ausente, gesto: null, lataHasta: 0,
  };
  p.color = M.colorRemera(p.avatar);
  if (typeof j.c === 'string' && j.c) aplicarMov(M, p, { x: j.x, y: j.y, c: j.c, dx: j.dx, dy: j.dy, ms: j.ms }, ahora);
  if (j.sienta) p.sentado = { m: S(j.sienta.m), s: j.sienta.s | 0, d: j.sienta.d, ox: j.sienta.ox, oy: j.sienta.oy, tx: p.dx, ty: p.dy, mueble: null };
  return p;
}

// hotel:mov {x,y,c,dx,dy} -> el jugador arranca a caminar desde (x,y).
export function aplicarMov(M, p, d, ahora) {
  const pasos = M.decodificarCamino(d.x | 0, d.y | 0, typeof d.c === 'string' ? d.c : '') || [];
  p.x0 = d.x | 0; p.y0 = d.y | 0; p.c = pasos.length ? d.c : ''; p.pasos = pasos;
  p.t0 = ahora - (Number(d.ms) || 0);
  const ult = pasos.length ? pasos[pasos.length - 1] : { tx: p.x0, ty: p.y0 };
  p.dx = Number.isInteger(d.dx) ? d.dx : ult.tx;
  p.dy = Number.isInteger(d.dy) ? d.dy : ult.ty;
  p.sentado = null;
  p.cabeza = null; p.cabezaHasta = 0;
}

// Donde se dibuja el jugador ahora: interpola entre baldosas a MS_POR_PASO por paso.
export function posicionDe(M, p, ahora) {
  const n = p.pasos.length;
  if (!n) { p.px = p.x0; p.py = p.y0; p.caminando = false; return p; }
  const ms = M.MS_POR_PASO;
  const el = Math.max(0, ahora - p.t0);
  const k = Math.floor(el / ms);
  if (k >= n) {
    const u = p.pasos[n - 1];
    p.px = u.tx; p.py = u.ty; p.caminando = false;
    p.dir = p.c.charCodeAt(n - 1) - 48;
    return p;
  }
  const desde = k === 0 ? { tx: p.x0, ty: p.y0 } : p.pasos[k - 1];
  const hasta = p.pasos[k];
  const f = (el - k * ms) / ms;
  p.px = desde.tx + (hasta.tx - desde.tx) * f;
  p.py = desde.ty + (hasta.ty - desde.ty) * f;
  p.dir = p.c.charCodeAt(k) - 48;
  p.caminando = true;
  p.fase = el / ms * Math.PI * 2; // un paso de pierna por baldosa
  return p;
}

// La baldosa en la que esta (o la ultima que piso) y la de destino.
export function baldosaActual(M, p, ahora) {
  const n = p.pasos.length;
  if (!n) return { x: p.x0, y: p.y0 };
  const k = Math.min(n, Math.floor(Math.max(0, ahora - p.t0) / M.MS_POR_PASO));
  return k === 0 ? { x: p.x0, y: p.y0 } : { x: p.pasos[k - 1].tx, y: p.pasos[k - 1].ty };
}

export function armarSala(M, r, ahora) {
  const s = r.sala;
  const capa = M.crearCapa(s.layout || { forma: 'small' });
  const sala = {
    slug: s.slug, meta: s.meta || {}, capa: capa.error ? M.crearCapa({ forma: 'small' }) : capa,
    puerta: null, muebles: {}, porClave: {}, jugadores: {}, derechos: new Set((s.derechos || []).map(String)),
    puedoBase: Object.assign({ poner: false, mover: false, echar: false, levantar: false }, s.puedo || {}),
    puedo: null, mensajes: [], version: 1,
  };
  sala.puerta = M.puerta(sala.capa);
  for (const m of Object.keys(s.muebles || {})) {
    const mu = muebleLocal(M, m, s.muebles[m]);
    sala.muebles[mu.m] = mu;
    sala.porClave[mu.clave] = mu.m;
  }
  for (const u of Object.keys(s.jugadores || {})) {
    const p = jugadorLocal(M, Object.assign({ u }, s.jugadores[u]), ahora);
    sala.jugadores[p.u] = p;
  }
  for (const msg of (s.mensajes || []).slice(-MAX_MENSAJES)) sala.mensajes.push(Object.assign({}, msg, { u: S(msg.u), id: S(msg.id) }));
  sala.puedo = Object.assign({}, sala.puedoBase);
  return sala;
}

// Los permisos segun los derechos: en las salas de la gente, quien tiene derechos pone, mueve y echa.
export function recalcularPuedo(sala, yo) {
  const b = sala.puedoBase;
  const tengo = yo != null && sala.derechos.has(String(yo));
  const deLaGente = !!(sala.meta && sala.meta.dueno);
  const extra = deLaGente && tengo;
  sala.puedo = { poner: b.poner || extra, mover: b.mover || extra, echar: b.echar || extra, levantar: b.levantar || extra };
  return sala.puedo;
}

// o: { C, M, sala() (la sala local o null), yo() (mi id), ahora(), entrada(c) (fila del catalogo
//      como entradaDesdeCatalogo), g: ganchos }
export function crearSalaEventos(o) {
  const { C, M } = o;
  const g = o.g || {};
  const ahora = o.ahora || (() => Date.now());
  const llamar = (k, ...a) => { if (typeof g[k] === 'function') g[k](...a); };
  const AS = C.A_SALA, AP = C.A_PERSONA;

  // Los avisos de sala solo valen para la sala en la que estoy.
  function deEsta(d) {
    const s = o.sala();
    return s && d && typeof d === 'object' && d.sala === s.slug ? s : null;
  }
  function jugador(s, u) { return u == null ? null : s.jugadores[String(u)] || null; }
  function cambio(s) { s.version++; llamar('cambio'); }

  const H = {};
  H[AS.LLEGA] = (d) => {
    const s = deEsta(d); if (!s || !d.j) return;
    const p = jugadorLocal(M, d.j, ahora());
    if (!p.u) return;
    s.jugadores[p.u] = p;
    cambio(s); llamar('llega', p);
  };
  H[AS.SE_VA] = (d) => {
    const s = deEsta(d); if (!s) return;
    const p = jugador(s, d.u); if (!p) return;
    delete s.jugadores[p.u];
    cambio(s); llamar('seVa', p);
  };
  H[AS.JUGADOR] = (d) => {
    const s = deEsta(d); if (!s) return;
    const p = jugador(s, d.u); if (!p) return;
    if (d.avatar) { p.avatar = d.avatar; p.color = M.colorRemera(d.avatar); }
    if (typeof d.estado === 'string') p.estado = d.estado;
    cambio(s); llamar('jugador', p);
  };
  H[AS.MOV] = (d) => {
    const s = deEsta(d); if (!s) return;
    const p = jugador(s, d.u); if (!p) return;
    const t = ahora();
    // Si es mi propio camino y ya lo estoy caminando igual (lo arranque al tocar), no salta.
    if (o.yo && String(o.yo()) === p.u && p.c === d.c && p.x0 === (d.x | 0) && p.y0 === (d.y | 0) && p.dx === d.dx && p.dy === d.dy) { p.sentado = null; return; }
    aplicarMov(M, p, d, t);
    cambio(s);
  };
  H[AS.SIENTA] = (d) => {
    const s = deEsta(d); if (!s) return;
    const p = jugador(s, d.u); if (!p) return;
    const mu = s.muebles[S(d.m)];
    let tx = p.dx, ty = p.dy;
    if (mu && mu.x != null && typeof o.entrada === 'function') {
      const e = o.entrada(mu.c);
      const as = e ? M.asientosDeMueble(mu.x, mu.y, mu.rot, e) : [];
      const a = as[d.s | 0];
      if (a) { tx = a.tx; ty = a.ty; }
    }
    p.x0 = tx; p.y0 = ty; p.pasos = []; p.c = ''; p.dx = tx; p.dy = ty;
    p.sentado = { m: S(d.m), s: d.s | 0, d: d.d, ox: d.ox, oy: d.oy, tx, ty, mueble: mu ? mu.c : null };
    cambio(s);
  };
  H[AS.CABEZA] = (d) => {
    const s = deEsta(d); if (!s) return;
    const p = jugador(s, d.u); if (!p) return;
    p.cabeza = d.d | 0; p.cabezaHasta = ahora() + (Number(d.ms) || C.TOPES.CABEZA_MS);
    cambio(s);
  };
  H[AS.DIJO] = (d) => {
    const s = deEsta(d); if (!s) return;
    const id = S(d.id);
    if (id && s.mensajes.some((x) => x.id === id)) return; // ya lo mostre (el mio, con la respuesta)
    const p = jugador(s, d.u);
    const msg = { id, u: S(d.u), nombre: p ? p.nombre : (d.nombre || ''), texto: String(d.texto || ''), t: d.t || ahora() };
    s.mensajes.push(msg);
    if (s.mensajes.length > MAX_MENSAJES) s.mensajes.splice(0, s.mensajes.length - MAX_MENSAJES);
    if (p) { p.escribe = false; p.escribeHasta = 0; }
    cambio(s); llamar('dijo', msg, p);
  };
  H[AS.ESCRIBE] = (d) => {
    const s = deEsta(d); if (!s) return;
    const p = jugador(s, d.u); if (!p) return;
    p.escribe = !!d.si; p.escribeHasta = d.si ? ahora() + C.TOPES.ESCRIBE_APAGA_MS : 0;
    cambio(s);
  };
  H[AS.AUSENTE] = (d) => {
    const s = deEsta(d); if (!s) return;
    const p = jugador(s, d.u); if (!p) return;
    p.ausente = !!d.si;
    cambio(s);
  };
  H[AS.GESTO] = (d) => {
    const s = deEsta(d); if (!s) return;
    const p = jugador(s, d.u); if (!p || C.GESTOS.indexOf(d.tipo) < 0) return;
    p.gesto = { tipo: d.tipo, hasta: ahora() + 3000 };
    cambio(s); llamar('gesto', p, d.tipo);
  };
  H[AS.LATA] = (d) => {
    const s = deEsta(d); if (!s) return;
    const p = jugador(s, d.u); if (!p) return;
    p.lataHasta = ahora() + (Number(d.ms) || 0);
    cambio(s);
  };
  H[AS.MUEBLE] = (d) => {
    const s = deEsta(d); if (!s || d.m == null) return;
    const m = S(d.m);
    const viejo = s.muebles[m];
    if (viejo) { if (s.porClave[viejo.clave] === m) delete s.porClave[viejo.clave]; delete s.muebles[m]; }
    if (d.rec) {
      const mu = muebleLocal(M, m, Object.assign({}, d.rec, { clave: d.clave || d.rec.clave }));
      s.muebles[m] = mu;
      s.porClave[mu.clave] = m;
      // Los sentados en un mueble que se movio o giro se paran.
      if (viejo && (viejo.clave !== mu.clave || viejo.rot !== mu.rot)) {
        for (const p of Object.values(s.jugadores)) if (p.sentado && p.sentado.m === m) p.sentado = null;
      }
    } else {
      for (const p of Object.values(s.jugadores)) if (p.sentado && p.sentado.m === m) p.sentado = null;
    }
    cambio(s); llamar('mueble', m, d.rec || null);
  };
  H[AS.DERECHOS] = (d) => {
    const s = deEsta(d); if (!s || !Array.isArray(d.lista)) return;
    s.derechos = new Set(d.lista.map(String));
    recalcularPuedo(s, o.yo ? o.yo() : null);
    cambio(s); llamar('derechos', s.derechos);
  };
  H[AS.SALA] = (d) => {
    const s = deEsta(d); if (!s || !d.meta || typeof d.meta !== 'object') return;
    s.meta = Object.assign({}, s.meta, d.meta);
    cambio(s); llamar('salaMeta', s.meta);
  };
  H[AS.BORRADO] = (d) => {
    const s = deEsta(d); if (!s) return;
    const id = S(d.id);
    const i = s.mensajes.findIndex((x) => x.id === id);
    if (i >= 0) s.mensajes.splice(i, 1);
    cambio(s); llamar('borrado', id);
  };
  // A la persona
  H[AP.FUERA] = (d) => {
    const motivo = d && C.FUERA.indexOf(d.motivo) >= 0 ? d.motivo : 'equipo';
    llamar('fuera', motivo, d && Number(d.ms) || 0);
  };
  H[AP.INVENTARIO_CAMBIO] = (d) => llamar('inventarioCambio', d || {});
  H[AP.AVISO] = (d) => { if (d && typeof d.texto === 'string') llamar('aviso', d.texto); }; // tambien A_TODOS.AVISO
  H[C.A_NAV.CONTEOS] = (d) => { if (d && typeof d === 'object') llamar('conteos', d); };
  H[C.A_TODOS.CATALOGO_CAMBIO] = (d) => { if (d && Number.isFinite(d.v)) llamar('catalogoCambio', d.v); };
  // Fases 3 y 4: monedas y tratos quedan para despues (los avisos llegan y no se hace nada).

  return {
    manejadores: H,
    // Pega todos los manejadores al transporte. Devuelve la lista de funciones para soltarlos.
    atar(t) { return Object.keys(H).map((ev) => t.escuchar(ev, H[ev])); },
  };
}
