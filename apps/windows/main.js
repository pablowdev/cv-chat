// CV Chat para Windows: una ventana propia que abre chat.circulovicioso.club/app.
// La app es la misma pagina, asi que se actualiza sola con cada cambio del servidor.
const { app, BrowserWindow, shell, Tray, Menu, session, nativeImage, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const ORIGEN = 'https://chat.circulovicioso.club';
const INICIO = ORIGEN + '/app';
// Paginas de afuera que se abren dentro de la app (para entrar con Discord y volver)
const ADENTRO = [ORIGEN, 'https://discord.com', 'https://www.discord.com'];

let win = null, tray = null, saliendo = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.commandLine.appendSwitch('lang', 'es-419'); // la pagina en castellano, aunque Windows este en ingles
app.setAppUserModelId('club.circulovicioso.chat'); // para las notificaciones de Windows

function crear() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 420, minHeight: 500,
    backgroundColor: '#121214', title: 'CV Chat', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { spellcheck: true, contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  win.loadURL(INICIO);
  win.once('ready-to-show', () => win.show());

  const deAdentro = (url) => ADENTRO.some(o => url === o || url.startsWith(o + '/'));
  // Enlaces que abren otra ventana: los de CV Chat adentro, el resto en el navegador
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGEN + '/')) { win.loadURL(url); return { action: 'deny' }; }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!deAdentro(url)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });
  // Cerrar la ventana la esconde (como Discord): sigue llegando lo nuevo. Salir, desde el icono
  win.on('close', (e) => { if (!saliendo) { e.preventDefault(); win.hide(); } });
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle('CV Chat'); });
}

function bandeja() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('CV Chat');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir CV Chat', click: mostrar },
    { label: 'Recargar', click: () => win && win.webContents.reloadIgnoringCache() },
    { type: 'separator' },
    { label: 'Salir', click: () => { saliendo = true; app.quit(); } },
  ]));
  tray.on('click', mostrar);
}
function mostrar() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }

// Al abrir, como Discord: una ventanita con el logo busca si hay una version nueva
// (/puente/descargas/latest.yml). Si hay, la baja mostrando el avance, la instala y CV Chat se
// vuelve a abrir solo, ya actualizado. Si no hay, o no hay internet, o tarda demasiado, abre
// CV Chat como siempre (lo que se haya bajado se instala la proxima vez que se salga de la app).
let splash = null, arranque = true;
function ventanita() {
  let logo = '';
  try { logo = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'build', 'icon.png')).toString('base64'); } catch { /* sin logo */ }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:#232428;color:#f2f3f5;font:600 14px "Segoe UI",system-ui,sans-serif;overflow:hidden;user-select:none;-webkit-app-region:drag}
    body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;border-radius:10px}
    img{width:96px;height:96px;border-radius:50%;animation:g 2.4s ease-in-out infinite}
    @keyframes g{0%,100%{transform:rotate(-8deg) scale(1)}50%{transform:rotate(8deg) scale(1.06)}}
    #t{min-height:20px;text-align:center;padding:0 20px}
    .b{width:180px;height:8px;border-radius:4px;background:#4e5058;overflow:hidden;visibility:hidden}
    .b i{display:block;height:100%;width:0;background:#5865f2;border-radius:4px;transition:width .2s}
  </style></head><body>${logo ? `<img src="${logo}" alt="">` : ''}<div id="t">Buscando actualizaciones...</div><div class="b" id="b"><i id="p"></i></div>
  <script>function poner(t,p){document.getElementById('t').textContent=t;const b=document.getElementById('b');if(p==null){b.style.visibility='hidden';}else{b.style.visibility='visible';document.getElementById('p').style.width=Math.max(0,Math.min(100,p))+'%';}}</script></body></html>`;
  splash = new BrowserWindow({
    width: 300, height: 340, frame: false, resizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: '#232428', title: 'CV Chat', center: true, show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  splash.once('ready-to-show', () => splash && splash.show());
  splash.on('closed', () => { splash = null; });
}
function cartel(texto, pct) {
  if (splash && !splash.isDestroyed()) splash.webContents.executeJavaScript(`poner(${JSON.stringify(texto)}, ${pct == null ? 'null' : Math.round(pct)})`).catch(() => {});
}
// Listo el arranque: se abre CV Chat (una sola vez)
function abrirApp() {
  if (!arranque) return;
  arranque = false;
  clearTimeout(espera);
  autoUpdater.autoDownload = true; // de aca en adelante, en segundo plano como antes
  crear();
  bandeja();
  win.once('ready-to-show', () => { if (splash && !splash.isDestroyed()) splash.close(); });
  setTimeout(() => { if (splash && !splash.isDestroyed()) splash.close(); }, 15000);
}
let espera = null;
// Sin noticias por un rato (sin internet, servidor lento, descarga trabada): se sigue igual
function plazo(ms) { clearTimeout(espera); espera = setTimeout(abrirApp, ms); }

app.on('second-instance', () => { if (arranque && splash) splash.focus(); else mostrar(); });
app.on('before-quit', () => { saliendo = true; });
app.whenReady().then(() => {
  // Microfono (llamadas de voz), notificaciones y portapapeles solo para CV Chat
  session.defaultSession.setPermissionRequestHandler((wc, permiso, cb) => {
    const ok = wc.getURL().startsWith(ORIGEN) && ['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'display-capture'].includes(permiso);
    cb(ok);
  });
  session.defaultSession.setSpellCheckerLanguages(['es-ES', 'en-US']);
  if (!app.isPackaged) { abrirApp(); return; } // probando sin instalar: no hay de donde actualizar
  ventanita();
  plazo(10000);
  autoUpdater.checkForUpdates().catch(abrirApp);
});
app.on('window-all-closed', () => {});

// Actualizaciones mientras la app esta abierta: se fija cada 6 horas, la baja en segundo plano
// y avisa para reiniciar
let avisado = false;
function buscarActualizacion() { autoUpdater.checkForUpdates().catch(() => {}); }
autoUpdater.autoDownload = false; // al abrir se baja a mano (para mostrar el avance)
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('update-not-available', () => { if (arranque) abrirApp(); });
autoUpdater.on('error', () => { if (arranque) abrirApp(); });
autoUpdater.on('update-available', (info) => {
  if (!arranque) return;
  cartel(`Descargando la actualización ${info.version}...`, 0);
  plazo(60000);
  autoUpdater.downloadUpdate().catch(abrirApp);
});
autoUpdater.on('download-progress', (p) => {
  if (!arranque) return;
  cartel('Descargando la actualización...', p.percent);
  plazo(60000);
});
autoUpdater.on('update-downloaded', async (info) => {
  if (arranque) {
    clearTimeout(espera);
    cartel('Instalando la actualización...', 100);
    saliendo = true;
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 800); // sin preguntar, y se vuelve a abrir sola
    return;
  }
  if (avisado) return;
  avisado = true;
  const opts = {
    type: 'info', title: 'CV Chat', buttons: ['Reiniciar y actualizar', 'Más tarde'], defaultId: 0, cancelId: 1,
    message: `Hay una versión nueva de CV Chat (${info.version}).`,
    detail: 'Se instala en unos segundos y CV Chat se vuelve a abrir solo. Si elegís "Más tarde", se instala la próxima vez que salgas de la app.',
  };
  const r = win && win.isVisible() ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
  if (r.response === 0) { saliendo = true; autoUpdater.quitAndInstall(true, true); }
});
app.whenReady().then(() => { setTimeout(buscarActualizacion, 60000); setInterval(buscarActualizacion, 6 * 3600 * 1000); });
