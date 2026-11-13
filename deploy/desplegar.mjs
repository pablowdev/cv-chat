#!/usr/bin/env node
// Sube archivos de este repositorio (el puente y el tema) al servidor, con bloqueo, respaldo y verificacion.
//
//   node deploy/desplegar.mjs --motivo "lo que cambio" tools/puente/web/aviso.js theme/discord-plus.theme.css
//        (solo muestra el plan)
//   node deploy/desplegar.mjs --motivo "lo que cambio" --si tools/puente/web/aviso.js ...
//        (sube de verdad)
//
// Donde va cada cosa:
//   tools/...                      -> /opt/haven/tools/...
//   theme/discord-plus.theme.css   -> /opt/haven/tema/discord-plus.theme.css
//
// Los archivos se escriben encima (sin reemplazarlos): el tema y el Caddyfile estan montados como archivos sueltos y,
// si se reemplazan, el contenedor sigue viendo el viejo.
//
// Antes de tocar nada, comprueba que lo que hay en el servidor sea alguna version guardada en git. Si alguien subio
// algo sin guardarlo (otra sesion, a mano), pisarlo lo borraria: frena y avisa. --forzar lo pisa igual.
//
// Si cambia un modulo del puente (tools/puente/*.js, no los de web/), reinicia Haven; las partidas se guardan y siguen.
//
// Requisitos: arbol limpio, HEAD == origin/main, ssh/scp en PATH.
// Variables: CV_HOST (usuario@servidor, obligatoria), CV_CLAVE (la clave de ssh), CV_URL (la direccion del chat).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valor = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const si = args.includes('--si'), forzar = args.includes('--forzar');
const motivo = String(valor('--motivo') || '').normalize('NFD').replace(/[^a-z0-9._-]+/gi, '-').toLowerCase();
const host = process.env.CV_HOST, clave = process.env.CV_CLAVE, url = String(process.env.CV_URL || '').replace(/\/+$/, '');
const ssh = [...(clave ? ['-i', clave] : []), '-o', 'BatchMode=yes'];
const salir = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };
const git = (...a) => execFileSync('git', a, { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

if (!motivo) salir('Falta --motivo "qué cambiaste".');
if (!host) salir('Falta CV_HOST (usuario@servidor).');
const pedidos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--motivo').map((f) => f.replace(/\\/g, '/'));
if (!pedidos.length) salir('Decí qué archivos subir (rutas de este repositorio).');
const destinoDe = (f) => (f === 'theme/discord-plus.theme.css' ? '/opt/haven/tema/discord-plus.theme.css' : f.startsWith('tools/') ? '/opt/haven/' + f : null);
for (const f of pedidos) {
  if (!destinoDe(f)) salir(`No sé a dónde va ${f} (solo tools/... y theme/discord-plus.theme.css).`);
  if (!/^[\w./-]+$/.test(f) || f.split('/').includes('..')) salir(`Ruta rara: ${f}`);
}
const sucio = git('status', '--porcelain');
if (sucio) salir(`El árbol no está limpio:\n${sucio}`);
git('fetch', 'origin', '--quiet');
const head = git('rev-parse', 'HEAD');
if (head !== git('rev-parse', 'origin/main')) salir('HEAD no coincide con origin/main. Hacé: git pull --ff-only (o subí tus commits).');
const seguidos = new Set(git('ls-files').split(/\r?\n/));
for (const f of pedidos) if (!seguidos.has(f)) salir(`${f} no está en el repositorio.`);

// los archivos del commit, su hash y todas las versiones que tuvieron en git
const tmp = mkdtempSync(path.join(tmpdir(), 'cv-deploy-'));
const hashes = new Map(), conocidos = [];
pedidos.forEach((f, k) => {
  writeFileSync(path.join(tmp, 'a' + k), execFileSync('git', ['show', `HEAD:${f}`], { cwd: raiz, maxBuffer: 64 * 1024 * 1024 }));
  hashes.set(f, git('rev-parse', `HEAD:${f}`));
  const blobs = new Set([hashes.get(f)]);
  for (const l of git('log', '--all', '--format=', '--raw', '--no-abbrev', '--', f).split(/\r?\n/)) {
    const m = /^:\d+ \d+ ([0-9a-f]{40}) ([0-9a-f]{40}) /.exec(l);
    if (m) for (const b of [m[1], m[2]]) if (!/^0+$/.test(b)) blobs.add(b);
  }
  for (const b of blobs) conocidos.push(`${b} ${k}`);
});
writeFileSync(path.join(tmp, 'lista.txt'), pedidos.map((f, k) => `${k} ${hashes.get(f)} ${destinoDe(f)}`).join('\n') + '\n');
writeFileSync(path.join(tmp, 'conocidos.txt'), conocidos.join('\n') + '\n');
const reiniciar = pedidos.some((f) => /^tools\/puente\/[^/]+\.(js|cjs|json)$/.test(f));

console.log(`\nCV Chat — ${new Date().toLocaleString('es-AR')}`);
console.log(`Commit:  ${head.slice(0, 8)}  ${git('log', '-1', '--format=%s')}`);
console.log(`Motivo:  ${motivo}`);
for (const f of pedidos) console.log(`  ${hashes.get(f).slice(0, 10)}  ${f}  ->  ${destinoDe(f)}`);
console.log(reiniciar ? 'Después: reinicia Haven (cambia un módulo del puente).' : 'Después: no hace falta reiniciar.');
if (!si) { rmSync(tmp, { recursive: true, force: true }); console.log('\nPlan listo (no se tocó nada). Para subir: agregá --si.\n'); process.exit(0); }

const remoto = `/tmp/cv-deploy-${Date.now()}`;
const respaldo = `/opt/haven/backup-local/antes-${motivo}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
try {
  execFileSync('ssh', [...ssh, host, `mkdir -p ${remoto}`], { stdio: 'inherit' });
  execFileSync('scp', ['-q', ...(clave ? ['-i', clave] : []), ...readdirSync(tmp), `${host}:${remoto}/`], { cwd: tmp, stdio: 'inherit' });
  const guion = `set -euo pipefail
T='${remoto}'; B='${respaldo}'
exec 9>/opt/haven/backup-local/cv-deploy.lock
flock -w 300 9
while read -r k exp d; do [ "$(git hash-object --no-filters "$T/a$k")" = "$exp" ] || { echo "HASH MAL a$k"; exit 1; }; done < "$T/lista.txt"
AJENOS=0
while read -r k exp d; do
  if [ -f "$d" ]; then grep -qx "$(git hash-object --no-filters "$d") $k" "$T/conocidos.txt" || { echo "AJENO $d"; AJENOS=1; }; fi
done < "$T/lista.txt"
if [ "$AJENOS" = 1 ] && [ '${forzar ? 1 : 0}' != 1 ]; then rm -rf "$T"; exit 3; fi
mkdir -p "$B"
while read -r k exp d; do
  if [ -f "$d" ]; then mkdir -p "$B$(dirname "$d")"; cp -p "$d" "$B$d"; fi
  mkdir -p "$(dirname "$d")"; cat "$T/a$k" > "$d"
  printf 'FINAL %s %s\\n' "$(git hash-object --no-filters "$d")" "$k"
done < "$T/lista.txt"
rm -rf "$T"
echo "RESPALDO $B"
${reiniciar ? 'cd /opt/haven && docker compose restart haven >/dev/null 2>&1 && echo "REINICIO haven"' : ''}
`;
  let salida;
  try { salida = execFileSync('ssh', [...ssh, host, 'sudo bash -s'], { input: guion, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }); }
  catch (e) {
    if (e.status !== 3) throw e;
    const ajenos = String(e.stdout || '').split(/\r?\n/).filter((l) => l.startsWith('AJENO ')).map((l) => '  ' + l.slice(6));
    salir(`En el servidor hay archivos que no son ninguna versión guardada en este repositorio (alguien los subió sin\nguardarlos en git). No se tocó nada:\n${ajenos.join('\n')}\n\nGuardá esos cambios en el repositorio (o, si se pueden perder, repetí con --forzar).`);
  }
  const finales = new Map();
  for (const l of salida.split(/\r?\n/)) { const m = /^FINAL ([0-9a-f]{40}) (\d+)$/.exec(l); if (m) finales.set(pedidos[Number(m[2])], m[1]); }
  for (const [f, h] of hashes) if (finales.get(f) !== h) salir(`${f} no quedó igual después de subirlo. Respaldo: ${respaldo}`);
  console.log(`\n✓ Subido y verificado (${hashes.size} archivos). Respaldo: ${respaldo}`);
  if (salida.includes('REINICIO haven')) console.log('✓ Haven reiniciado.');
  if (url) {
    let bien = false;
    for (let i = 0; i < 30 && !bien; i++) { await new Promise((ok) => setTimeout(ok, 2000)); try { bien = (await fetch(`${url}/`, { cache: 'no-store' })).ok && (await fetch(`${url}/puente/aviso.js`, { cache: 'no-store' })).ok; } catch { /* todavia no */ } }
    if (!bien) salir(`El chat no responde. Respaldo: ${respaldo}`);
    console.log('✓ El chat responde.\n');
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
