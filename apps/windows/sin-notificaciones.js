// Corre antes que la pagina en cada marco de la app (el chat, el foro adentro del chat, las
// ventanitas): ninguna notificacion de Windows. En Electron una pagina puede mostrarlas aunque el
// permiso este negado, asi que se cambian por unas mudas en el mundo de la pagina. Los avisos y
// sonidos propios de CV Chat (adentro de la app) siguen igual.
const { contextBridge } = require('electron');

try {
  contextBridge.executeInMainWorld({
    func: () => {
      const Muda = function () { return { close() {}, addEventListener() {}, removeEventListener() {} }; };
      Muda.permission = 'denied';
      Muda.requestPermission = (cb) => { if (typeof cb === 'function') cb('denied'); return Promise.resolve('denied'); };
      try { Object.defineProperty(window, 'Notification', { value: Muda, writable: false, configurable: false }); } catch { /* ya estaba */ }
      // Ni las del service worker pedidas desde la pagina
      if (window.ServiceWorkerRegistration) {
        try { window.ServiceWorkerRegistration.prototype.showNotification = () => Promise.resolve(); } catch { /* nada */ }
      }
    },
  });
} catch { /* version sin executeInMainWorld: queda el permiso negado (main.js) */ }
