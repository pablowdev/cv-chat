// Dibuja cartas del mazo pixel en el Chrome de pruebas y saca una captura (o guarda los .webp)
// Uso: node ver.js muestra salida.jpg espada-1 oro-7 copa-12 basto-5 ...
//      node ver.js guardar <carpeta>      (las 40 + el dorso, en webp)
const fs = require('fs'), path = require('path'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const [, , modo, destino, ...cartas] = process.argv;
(async () => {
  const v = await (await fetch('http://127.0.0.1:9335/json/version')).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId: S } } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, S); await send('Runtime.enable', {}, S);
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, S); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
  const codigo = fs.readFileSync(path.join(__dirname, 'mazo.js'), 'utf8');
  if (modo === 'muestra') {
    const lista = cartas.length ? cartas : ['espada-1', 'oro-7', 'copa-12', 'basto-5'];
    await send('Emulation.setDeviceMetricsOverride', { width: Math.min(1900, lista.length * (lista.length>8?176:250) + 20), height: (lista.length>8?280:400), deviceScaleFactor: 1, mobile: false }, S);
    await send('Page.navigate', { url: 'data:text/html,<body style="margin:0;background:%23263b2e;display:flex;gap:10px;padding:10px"></body>' }, S); await sleep(500);
    await ev(codigo + `;(${JSON.stringify(lista)}).forEach(k=>{const [p,n]=k.split('-');const c=k==='dorso'?mazoPixel.dorso():mazoPixel.dibujar(p,Number(n));c.style.height='${lista.length>8?260:380}px';c.style.imageRendering='pixelated';document.body.appendChild(c)});1`);
    await sleep(300);
    const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }, S);
    fs.writeFileSync(destino, Buffer.from(s.result.data, 'base64'));
  } else if (modo === 'guardar') {
    fs.mkdirSync(destino, { recursive: true });
    await send('Page.navigate', { url: 'data:text/html,<body></body>' }, S); await sleep(300);
    await ev(codigo + ';1');
    const lista = await ev(`(()=>{const out=[];for(const p of mazoPixel.PALOS)for(const n of mazoPixel.NUMEROS)out.push(p+'-'+n);out.push('dorso');return out})()`);
    for (const k of lista) {
      const [p, n] = k.split('-');
      const data = await ev(`(k==='dorso'?mazoPixel.dorso():mazoPixel.dibujar('${p}',${Number(n) || 0})).toDataURL('image/webp',1)`.replace("(k==='dorso'", `('${k}'==='dorso'`));
      fs.writeFileSync(path.join(destino, k + '.webp'), Buffer.from(data.split(',')[1], 'base64'));
    }
    console.log('guardadas', lista.length);
  }
  await send('Target.closeTarget', { targetId }); process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
