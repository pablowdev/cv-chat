// Enlace "¿Olvidaste tu contraseña? Recuperala con Discord" en la pantalla de
// inicio de sesion de Haven (la pagina "/").
(function () {
  'use strict';
  if (document.getElementById('puente-recuperar')) return;
  const box = document.createElement('div');
  box.id = 'puente-recuperar';
  box.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:99999;max-width:calc(100vw - 32px);' +
    'padding:8px 14px;border-radius:10px;background:rgba(88,101,242,.95);color:#fff;text-align:center;' +
    'font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)';
  const text = document.createTextNode('¿Olvidaste tu contraseña? ');
  const link = document.createElement('a');
  link.href = '/puente/vincular';
  link.textContent = 'Recuperala con Discord';
  link.style.cssText = 'color:#fff;font-weight:700;text-decoration:underline';
  box.append(text, link);
  document.body.appendChild(box);
})();

// Titulo de la pestana: Haven pone "Haven: <servidor>" (o "(3) Haven: <servidor>"
// con mensajes sin leer). Se cambia por el titulo elegido (PUENTE_TITULO en .env),
// manteniendo el contador. Si no hay titulo configurado, no se toca nada.
(function () {
  'use strict';
  const TITLE = '__PUENTE_TITULO__';
  if (!TITLE || TITLE.indexOf('__PUENTE') === 0) return;
  const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
  if (!desc || !desc.set) return;
  const fix = (v) => {
    const m = /^(\(\d+\)\s*)?Haven(?::.*)?$/.exec(String(v));
    return m ? (m[1] || '') + TITLE : v;
  };
  try {
    Object.defineProperty(document, 'title', {
      configurable: true,
      get() { return desc.get.call(document); },
      set(v) { desc.set.call(document, fix(v)); },
    });
  } catch { return; }
  document.title = desc.get.call(document);
})();
