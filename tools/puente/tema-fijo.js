// Tema fijo (PUENTE_TEMA_FIJO=1): todos ven siempre el tema por defecto del
// servidor (Settings -> Server Branding -> tema por defecto) y nadie puede
// elegir otro. El admin lo sigue cambiando desde ahi, para todos a la vez.
//
//  - Haven ya no guarda el tema ni los efectos que elija cada uno, y al
//    mandarle sus preferencias no le manda el tema propio: Haven aplica el
//    del servidor.
//  - /puente/tema-fijo.js corre antes que el arranque de temas de Haven y deja
//    el tema del servidor en el navegador, asi la primera pantalla (tambien la
//    de inicio de sesion) ya sale con ese tema, sin parpadeo.
//  - Se ocultan los selectores: el boton de temas de la barra inferior, la
//    barra de temas del inicio de sesion y la lista de temas en Configuracion.

const on = () => process.env.PUENTE_TEMA_FIJO === '1';
const BLOCKED_PREFS = new Set(['theme', 'effects']);

function setup({ db, io, log }) {
  if (!on()) return;
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

// Script que va antes de theme-init.js de Haven
function script(db) {
  const t = JSON.stringify(defaultTheme(db));
  return `(function(){try{var t=${t};if(!t)return;` +
    `if(localStorage.getItem('haven_theme')!==t)localStorage.setItem('haven_theme',t);` +
    `if(localStorage.getItem('haven_effects')!=='auto')localStorage.setItem('haven_effects','auto');}catch(e){}})();`;
}

const HIDE_CSS = '<style id="puente-tema-fijo">#theme-popup-toggle,#theme-popup,#auth-theme-bar,' +
  '#theme-list,h6:has(+ #theme-list){display:none!important}</style>';

function pageHead(db, html) {
  if (!on() || !defaultTheme(db)) return html;
  const marker = '<script src="/js/theme-compat.js';
  if (!html.includes(marker) || html.includes('/puente/tema-fijo.js')) return html;
  return html.replace(marker, `<script src="/puente/tema-fijo.js"></script>${HIDE_CSS}${marker}`);
}

module.exports = { setup, script, pageHead, on };
