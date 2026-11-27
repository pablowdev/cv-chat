// Arma la tabla de ubicaciones por IP (la usa geo.js) con la base gratuita "IP to City Lite" de DB-IP
// (https://db-ip.com, licencia CC BY 4.0). Corre aparte (geo.js lo lanza con fork, una vez por mes) para no frenar
// el chat: baja el CSV comprimido (unos 85 MB), lo lee de a una linea y deja en DIR:
//   v4.bin       por cada tramo de IPv4: el comienzo (uint32) y el numero de lugar (uint32; 0xFFFFFFFF = sin dato)
//   lugares.json [[pais, provincia, ciudad], ...]
//   base.json    { mes, armado, tramos, lugares }
// Nada sale del servidor: solo se baja la base. Las IP de la gente se buscan adentro (geo.js).
//   node geo-armar.js [DIR] [archivo.csv.gz local, para probar]
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const readline = require('readline');

const DIR = process.argv[2] || process.env.PUENTE_GEO_DIR || '/data/puente-geo';
const LOCAL = process.argv[3] || '';
const SIN = 0xFFFFFFFF;

const mesDe = (d) => d.toISOString().slice(0, 7);
function bajar(url) {
  return new Promise((ok, mal) => {
    https.get(url, { headers: { 'User-Agent': 'cv-chat-geo' }, timeout: 60000 }, (r) => {
      if (r.statusCode !== 200) { r.resume(); return mal(new Error('HTTP ' + r.statusCode)); }
      ok(r);
    }).on('error', mal).on('timeout', function () { this.destroy(new Error('tiempo')); });
  });
}

// Una linea del CSV: los campos con comillas pueden tener comas
function campos(l) {
  const out = [];
  let i = 0;
  while (i <= l.length) {
    if (l[i] === '"') {
      let j = i + 1, s = '';
      while (j < l.length) {
        if (l[j] === '"') { if (l[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
        s += l[j++];
      }
      out.push(s); i = j + 2;
    } else {
      const j = l.indexOf(',', i);
      if (j < 0) { out.push(l.slice(i)); break; }
      out.push(l.slice(i, j)); i = j + 1;
    }
  }
  return out;
}
const num = (ip) => { const p = ip.split('.'); return p.length === 4 ? ((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + (+p[3]) : -1; };

async function main() {
  let entrada, mes;
  if (LOCAL) { entrada = fs.createReadStream(LOCAL); mes = 'local'; }
  else {
    // la del mes; si todavia no salio (los primeros dias), la del mes anterior
    const hoy = new Date();
    const meses = [mesDe(hoy), mesDe(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 15)))];
    let ultimo;
    for (const m of meses) {
      try { entrada = await bajar('https://download.db-ip.com/free/dbip-city-lite-' + m + '.csv.gz'); mes = m; break; } catch (err) { ultimo = err; }
    }
    if (!entrada) throw ultimo || new Error('sin base');
  }
  const lineas = readline.createInterface({ input: entrada.pipe(zlib.createGunzip()), crlfDelay: Infinity });
  const lugares = [], idx = new Map();
  let buf = Buffer.alloc(8 * 4000000), n = 0, fin = -1, ultimoLugar = -2;
  const poner = (ini, lugar) => {
    if (lugar === ultimoLugar) return; // seguido y en el mismo lugar: es el mismo tramo
    if ((n + 1) * 8 > buf.length) { const b = Buffer.alloc(buf.length * 2); buf.copy(b); buf = b; }
    buf.writeUInt32BE(ini, n * 8); buf.writeUInt32BE(lugar, n * 8 + 4); n++; ultimoLugar = lugar;
  };
  for await (const l of lineas) {
    if (!l) continue;
    const c = campos(l);
    if (c[0].includes(':')) continue; // (las IPv6 no: Haven anota IPv4)
    const a = num(c[0]), b = num(c[1]);
    if (a < 0 || b < a) continue;
    if (a > fin + 1) poner(fin + 1, SIN); // un hueco sin dato
    const pais = (c[3] || '').toUpperCase();
    let lugar = SIN;
    if (/^[A-Z]{2}$/.test(pais) && pais !== 'ZZ') {
      const k = pais + '|' + (c[4] || '') + '|' + (c[5] || '');
      lugar = idx.get(k);
      if (lugar === undefined) { lugar = lugares.length; idx.set(k, lugar); lugares.push([pais, c[4] || '', c[5] || '']); }
    }
    poner(a, lugar);
    fin = Math.max(fin, b);
  }
  if (n < 1000) throw new Error('la base vino casi vacia (' + n + ' tramos)');
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = path.join(DIR, '.nuevo');
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'v4.bin'), buf.subarray(0, n * 8));
  fs.writeFileSync(path.join(tmp, 'lugares.json'), JSON.stringify(lugares));
  fs.writeFileSync(path.join(tmp, 'base.json'), JSON.stringify({ mes, armado: Date.now(), tramos: n, lugares: lugares.length }));
  // base.json al final: geo.js mira ese para saber que hay una nueva
  for (const f of ['v4.bin', 'lugares.json', 'base.json']) fs.renameSync(path.join(tmp, f), path.join(DIR, f));
  fs.rmSync(tmp, { recursive: true, force: true });
  return { mes, tramos: n, lugares: lugares.length };
}

main().then((r) => { if (process.send) process.send({ ok: true, ...r }); else console.log(JSON.stringify(r)); process.exit(0); })
  .catch((err) => { if (process.send) process.send({ ok: false, error: err.message }); else console.error(err.message); process.exit(1); });
