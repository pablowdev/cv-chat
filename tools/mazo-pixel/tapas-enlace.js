// Imagenes de vista previa (og:image) de los juegos, 1200x630, para cuando se comparte
// /app?juegos o /app?juegos=truco|funball|ajedrez. Uso: node tapas-enlace.js <aviso.js> <carpeta>
const fs = require('fs'), path = require('path'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const [, , avisoPath, destino] = process.argv;
const SITIO = 'https://chat.circulovicioso.club';
(async () => {
  const aviso = fs.readFileSync(avisoPath, 'utf8').split(/\r?\n/);
  const desde = aviso.findIndex(l => l.includes('const AJ_BASE ='));
  const hasta = aviso.findIndex((l, i) => i > desde && l.includes('const AJ_TAPA ='));
  const ajCodigo = aviso.slice(desde, hasta).join('\n');
  const mazo = fs.readFileSync(path.join(__dirname, 'mazo.js'), 'utf8');
  const dataUrl = async (u) => 'data:image/webp;base64,' + Buffer.from(await (await fetch(SITIO + u)).arrayBuffer()).toString('base64');
  const fondoFb = await dataUrl('/puente/funball/fondo.webp'), logoFb = await dataUrl('/puente/funball/logo.webp');

  const v = await (await fetch('http://127.0.0.1:9335/json/version')).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId: S } } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, S);
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false }, S);
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, S); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
  await send('Page.navigate', { url: 'data:text/html,<body style="margin:0"></body>' }, S); await sleep(400);
  await ev(mazo + ';1');
  const banner = await ev(`mazoPixel.banner().toDataURL('image/png')`);

  const css = `body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:system-ui,sans-serif}
    .c{position:absolute;inset:0}
    .aj-tapa{position:absolute;inset:0;background:#2b2d2c}
    .aj-tapa-tab{position:absolute;inset:12% 30%;display:grid;grid-template-columns:repeat(4,1fr);transform:perspective(40rem) rotateX(48deg);border-radius:6px;overflow:hidden;box-shadow:0 1.5rem 2rem rgba(0,0,0,.5)}
    .aj-tapa-tab span.cl{background:#f1e4e9}.aj-tapa-tab span.os{background:#b9577d}
    .aj-tapa-p{position:absolute;left:0;right:0;bottom:10%;display:flex;justify-content:center;height:62%}
    .aj-tapa-p svg{height:100%;width:auto;filter:drop-shadow(0 10px 12px rgba(0,0,0,.55))}
    .t{position:absolute;left:0;right:0;bottom:22px;text-align:center;color:#f2f3f5;font-weight:800;font-size:44px;text-shadow:0 3px 10px rgba(0,0,0,.8)}`;
  const truco = `<div class="c" style="background:#0a1a12"><img src="${banner}" style="display:block;height:630px;margin:0 auto"></div>`;
  const funball = `<div class="c" style="background:url('${fondoFb}') 0 0/256px repeat,#4a3f37"><img src="${logoFb}" style="position:absolute;inset:40px;width:1120px;height:550px;object-fit:contain"></div>`;
  const ajedrez = `<div class="c" id="aj"></div>`;
  const paginas = {
    truco, funball, ajedrez,
  };
  fs.mkdirSync(destino, { recursive: true });
  // la biblioteca: el truco grande a la izquierda, funball y ajedrez a la derecha (con las imagenes recien hechas)
  const tile = (n, css) => `<div style="position:absolute;${css};border-radius:12px;overflow:hidden;box-shadow:0 10px 24px rgba(0,0,0,.6);background:url(data:image/jpeg;base64,${fs.readFileSync(path.join(destino, n + '.jpg')).toString('base64')}) center/cover"></div>`;
  const orden = Object.entries(paginas).concat([['juegos', null]]);
  for (let [nombre, html] of orden) {
    if (!html) html = `<div class="c" style="background:#17171a">` + tile('truco', 'left:30px;top:30px;width:615px;height:570px') + tile('funball', 'left:669px;top:30px;width:501px;height:273px') + tile('ajedrez', 'left:669px;top:327px;width:501px;height:273px') + `</div>`;
    await send('Page.navigate', { url: 'data:text/html,<body></body>' }, S); await sleep(200);
    await ev(`document.head.innerHTML=${JSON.stringify('<style>' + css + '</style>')};document.body.innerHTML=${JSON.stringify(html)};` +
      `${ajCodigo};const AJ_TAPA = () => \`<div class="aj-tapa"><div class="aj-tapa-tab">\${Array.from({ length: 16 }, (_, i) => \`<span class="\${(i + (i >> 2)) % 2 ? 'os' : 'cl'}"></span>\`).join('')}</div><div class="aj-tapa-p">\${ajPieza('n')}\${ajPieza('K')}</div></div>\`;` +
      `document.querySelectorAll('#aj,.aj2').forEach(e=>e.innerHTML=AJ_TAPA());` +
      `Promise.all([...document.images].map(i=>i.decode().catch(()=>0))).then(()=>1)`);
    await sleep(300);
    const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86 }, S);
    fs.writeFileSync(path.join(destino, nombre + '.jpg'), Buffer.from(s.result.data, 'base64'));
  }
  await send('Target.closeTarget', { targetId }); console.log('ok'); process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
