// CV Chat para Windows: una ventana propia que abre chat.circulovicioso.club/app.
// La app es la misma pagina, asi que se actualiza sola con cada cambio del servidor.
const { app, BrowserWindow, shell, Tray, Menu, session, nativeImage, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

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

app.on('second-instance', mostrar);
app.on('before-quit', () => { saliendo = true; });
app.whenReady().then(() => {
  // Microfono (llamadas de voz), notificaciones y portapapeles solo para CV Chat
  session.defaultSession.setPermissionRequestHandler((wc, permiso, cb) => {
    const ok = wc.getURL().startsWith(ORIGEN) && ['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'display-capture'].includes(permiso);
    cb(ok);
  });
  session.defaultSession.setSpellCheckerLanguages(['es-ES', 'en-US']);
  crear();
  bandeja();
});
app.on('window-all-closed', () => {});

// Actualizaciones: la app se fija sola si hay una version nueva en el servidor
// (/puente/descargas/latest.yml), la baja en segundo plano y avisa para reiniciar
let avisado = false;
function buscarActualizacion() { autoUpdater.checkForUpdates().catch(() => {}); }
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('update-downloaded', async (info) => {
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
app.whenReady().then(() => { setTimeout(buscarActualizacion, 15000); setInterval(buscarActualizacion, 6 * 3600 * 1000); });
