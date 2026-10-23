// Pagina de descarga de la app (/puente/descargar): muestra primero la de tu sistema, con el
// tamanio de los archivos que hay en el servidor (web/descargas/), y el resto con un boton.
(() => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mio = ios ? 'ios' : /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows' : 'otros';
  const todas = ['android', 'windows', 'ios', 'otros'];
  const ver = (id) => { document.getElementById(id).hidden = false; };
  ver(mio);
  // Llegó desde otra app (la de Haven de Google Play, vincular.js): el aviso, y sin volver a esa app
  if (new URLSearchParams(location.search).get('desde') === 'otra-app') {
    ver('otra-app');
    document.querySelector('.dl-volver').remove();
    const dir = location.origin + '/puente/descargar';
    document.querySelector('.dl-dir').textContent = dir;
    document.getElementById('copiar').addEventListener('click', () => {
      const listo = () => { document.querySelector('.dl-copiado').textContent = '¡Copiada!'; };
      if (navigator.clipboard) navigator.clipboard.writeText(dir).then(listo, () => {});
    });
  }
  document.querySelectorAll('.dl-host').forEach((x) => { x.textContent = location.host; });
  const boton = document.getElementById('todas');
  boton.hidden = false;
  boton.addEventListener('click', () => { todas.forEach(ver); boton.remove(); });
  const mb = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0).replace('.', ',') + ' MB';
  fetch('/puente/descargas.json', { cache: 'no-store' }).then(r => r.json()).then((d) => {
    for (const k of ['android', 'windows']) {
      const t = document.getElementById(k + '-tam');
      if (d[k]) t.textContent = `Versión ${d[k].version || '1.0'} · ${mb(d[k].tam)}`;
      else { t.textContent = 'Todavía no está disponible.'; document.getElementById(k + '-btn').remove(); }
    }
  }).catch(() => {});
})();
