// Tema y diseño fijos (PUENTE_TEMA_FIJO=1): todos ven siempre el tema por
// defecto del servidor (Settings -> Server Branding -> tema por defecto) y el
// mismo diseño que eligen los administradores; nadie mas puede cambiarlo.
//
//  - Tema: Haven ya no guarda el tema ni los efectos que elija cada uno, y al
//    mandarle sus preferencias no le manda el tema propio: Haven aplica el
//    del servidor.
//  - Diseño (disposicion del menu lateral, densidad, zoom, tamaño de
//    reacciones, iconos, imagenes, banner, barra de estado, complementos...):
//    Haven guarda esas opciones en el navegador de cada uno. Cuando un
//    administrador abre la app, sus valores se publican en el servidor (uno
//    para pantallas tactiles y otro para la PC); a los demas se les cargan
//    esos valores antes de que arranque Haven y no se pueden cambiar.
//  - /puente/tema-fijo.js corre antes que el arranque de temas de Haven, asi
//    la primera pantalla (tambien la de inicio de sesion) ya sale bien, sin
//    parpadeo.
//  - Se ocultan los selectores: el boton de temas de la barra inferior, la
//    barra de temas del inicio de sesion, la lista de temas y, salvo para los
//    administradores, las secciones de diseño de Configuracion.

const on = () => process.env.PUENTE_TEMA_FIJO === '1';
const BLOCKED_PREFS = new Set(['theme', 'effects']);

// Opciones de diseño que Haven guarda en el navegador
const UI_KEYS = [
  'haven-layout', 'haven-layout-v2', 'haven-panel-layout', 'haven-density', 'haven-channel-scroll',
  'haven-toggle-style', 'haven-emojisize', 'haven-role-display', 'haven-fontsize', 'haven-zoom',
  'haven-embed-size', 'haven-image-mode', 'haven-toolbar-icons', 'haven-toolbar-order', 'haven-toolbar-visible-slots',
  'haven_animate_chat', 'haven_animate_pfp', 'haven_banner_header_mode', 'haven_banner_height', 'haven_banner_offset',
  'haven_compact_composer', 'haven_hide_send_btn', 'haven_show_statusbar', 'haven_enabled_plugins', 'haven_enabled_themes',
  'haven_color_base', 'haven_custom_hsv', 'haven_rgb_settings', 'haven_crt_scanline', 'haven_crt_vignette',
  'haven_glitch_freq', 'haven_fx_speeds', 'haven_fx_sacred_intensity',
];
const UI_SET = new Set(UI_KEYS);
const FORMS = new Set(['pc', 'movil']);
// Secciones de Configuracion que solo ven los administradores
const UI_SECTIONS = ['section-layout', 'section-zoom', 'section-reaction-size', 'section-role-display', 'section-toolbar-icons',
  'section-image-display', 'section-embed-size', 'section-banner-display', 'section-toggle-style', 'section-statusbar', 'section-plugins'];

function setup({ db, io, log }) {
  if (!on()) return;
  db.exec(`CREATE TABLE IF NOT EXISTS puente_ui_fija (
    forma TEXT PRIMARY KEY,
    valores TEXT NOT NULL,
    actualizado TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  io.on('connection', socket => {
    socket.use((packet, next) => {
      const [event, data] = packet;
      if (event === 'set-preference' && data && BLOCKED_PREFS.has(data.key)) return; // no se guarda
      next();
    });
    const emit = socket.emit;
    socket.emit = function (event, payload, ...rest) {
      if (event === 'preferences' && payload && typeof payload === 'object') {
        payload = { ...payload };
        for (const k of BLOCKED_PREFS) delete payload[k];
      }
      return emit.call(this, event, payload, ...rest);
    };
  });
  // Las elecciones viejas ya no sirven: se borran para que no vuelvan si se apaga esto.
  const n = db.prepare("DELETE FROM user_preferences WHERE key IN ('theme', 'effects')").run().changes;
  log(`tema fijo para todos${n ? ` (${n} elecciones propias borradas)` : ''}`);
}

function defaultTheme(db) {
  const row = db.prepare("SELECT value FROM server_settings WHERE key = 'default_theme'").get();
  return row && typeof row.value === 'string' ? row.value : '';
}

function published(db) {
  const out = {};
  try {
    for (const r of db.prepare('SELECT forma, valores FROM puente_ui_fija').all()) {
      try { out[r.forma] = JSON.parse(r.valores); } catch { /* fila rota: se ignora */ }
    }
  } catch { /* tabla todavia no creada */ }
  return out;
}

// Un administrador publica su diseño (POST /puente/api/ui-fija)
function publish(db, forma, valores) {
  if (!FORMS.has(forma) || !valores || typeof valores !== 'object') return false;
  const clean = {};
  for (const [k, v] of Object.entries(valores)) {
    if (UI_SET.has(k) && typeof v === 'string' && v.length <= 20000) clean[k] = v;
  }
  db.prepare("INSERT INTO puente_ui_fija (forma, valores, actualizado) VALUES (?, ?, datetime('now')) ON CONFLICT(forma) DO UPDATE SET valores = excluded.valores, actualizado = excluded.actualizado")
    .run(forma, JSON.stringify(clean));
  return true;
}

// Script que va antes de theme-init.js de Haven
function script(db) {
  const t = JSON.stringify(defaultTheme(db));
  const ui = JSON.stringify(published(db));
  const keys = JSON.stringify(UI_KEYS);
  return `(function(){try{var t=${t};` +
    `if(t){if(localStorage.getItem('haven_theme')!==t)localStorage.setItem('haven_theme',t);` +
    `if(localStorage.getItem('haven_effects')!=='auto')localStorage.setItem('haven_effects','auto');}` +
    `var ui=${ui},keys=${keys},lock={};keys.forEach(function(k){lock[k]=1;});` +
    `var forma=matchMedia('(pointer: coarse)').matches?'movil':'pc';` +
    `var u=null;try{u=JSON.parse(localStorage.getItem('haven_user')||'null');}catch(e){}` +
    `var ls=localStorage,P=Storage.prototype,set=P.setItem,rem=P.removeItem;` +
    `if(u&&u.isAdmin){document.documentElement.classList.add('puente-ui-admin');` +
      // Administrador: lo que elige se publica para todos
      `var timer=null,send=function(){clearTimeout(timer);timer=setTimeout(function(){var tk=ls.getItem('haven_token');if(!tk)return;` +
        `var v={};keys.forEach(function(k){var x=ls.getItem(k);if(x!==null)v[k]=x;});` +
        `fetch('/puente/api/ui-fija',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tk},body:JSON.stringify({forma:forma,valores:v})}).catch(function(){});},2000);};` +
      `P.setItem=function(k,v){var r=set.call(this,k,v);if(this===ls&&lock[k])send();return r;};` +
      `P.removeItem=function(k){var r=rem.call(this,k);if(this===ls&&lock[k])send();return r;};` +
      `setTimeout(send,8000);` +
    `}else if(ui[forma]){var f=ui[forma];` +
      // Los demas: el diseño publicado, sin poder cambiarlo
      `keys.forEach(function(k){if(Object.prototype.hasOwnProperty.call(f,k))set.call(ls,k,f[k]);else rem.call(ls,k);});` +
      `P.setItem=function(k,v){if(this===ls&&lock[k])return;return set.call(this,k,v);};` +
      `P.removeItem=function(k){if(this===ls&&lock[k])return;return rem.call(this,k);};` +
    `}}catch(e){}})();`;
}

const HIDE_CSS = '<style id="puente-tema-fijo">#theme-popup-toggle,#theme-popup,#auth-theme-bar,' +
  '#theme-list,h6:has(+ #theme-list){display:none!important}' +
  UI_SECTIONS.map(s => `html:not(.puente-ui-admin) .settings-nav-item[data-target="${s}"],html:not(.puente-ui-admin) #${s}`).join(',') +
  '{display:none!important}</style>';

function pageHead(db, html) {
  if (!on() || !defaultTheme(db)) return html;
  const marker = '<script src="/js/theme-compat.js';
  if (!html.includes(marker) || html.includes('/puente/tema-fijo.js')) return html;
  return html.replace(marker, `<script src="/puente/tema-fijo.js"></script>${HIDE_CSS}${marker}`);
}

module.exports = { setup, script, pageHead, publish, on };
