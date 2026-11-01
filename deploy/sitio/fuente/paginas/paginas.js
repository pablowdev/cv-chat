// Las paginas de la web: archivo -> titulo, la seccion del menu, estilos y scripts, y la imagen de la vista
// previa del enlace (tools/puente/vistas.js: un pedacito de la pagina)
const CHAT = 'https://chat.circulovicioso.club';
module.exports = {
  'index.html': { fuente: 'inicio.html', titulo: 'Círculo Vicioso Club', actual: 'inicio', canonica: '/', css: ['/css/inicio.css'], js: ['/js/cv.js'], imagen: `${CHAT}/puente/vista/web.jpg?p=inicio` },
  'full-fat-search.html': { fuente: 'full-fat-search.html', titulo: 'Full Fat Search - Círculo Vicioso Club', actual: 'fullfat', canonica: '/full-fat-search', css: ['/css/ffs.css'],
    descripcion: 'Buscá cualquier palabra en todos los episodios de Círculo Vicioso y andá directo al momento del video.', imagen: `${CHAT}/puente/vista/web.jpg?p=full-fat-search` },
  'wiki.html': { fuente: 'wiki.html', titulo: 'Wiki - Círculo Vicioso Club', actual: 'wiki', css: [`${CHAT}/puente/wiki.css`], js: [`${CHAT}/puente/wiki.js`],
    descripcion: 'La wiki de Círculo Vicioso: el lore, los efectos y los personajes del club, escrita por la comunidad.', imagen: `${CHAT}/puente/vista/web.jpg?p=wiki` },
  'marketplace.html': { fuente: 'marketplace.html', titulo: 'Marketplace - Círculo Vicioso Club', actual: 'marketplace', canonica: '/marketplace', css: ['/css/marketplace.css'], js: ['/js/marketplace.js'],
    descripcion: 'La compra, venta y servicios entre los miembros de Círculo Vicioso. Solo para miembros.',
    // la vista previa del enlace: las ultimas publicaciones (mercado.js, la portada)
    imagen: `${CHAT}/puente/api/mercado/portada.jpg` },
  'cuenta.html': { fuente: 'cuenta.html', titulo: 'Tu cuenta - Círculo Vicioso Club', actual: null, css: ['/css/paginas.css'], js: ['/js/cuenta.js'], sinIndice: true },
  'descargar.html': { fuente: 'descargar.html', titulo: 'Descargá la app - Círculo Vicioso Club', actual: null, canonica: '/descargar', css: ['/css/paginas.css'],
    descripcion: 'La app de CV Chat para Android, iPhone, Windows, Mac y Linux: el chat, el foro y los juegos del club.', imagen: `${CHAT}/puente/vista/web.jpg?p=descargar` },
  'borrar-cuenta.html': { fuente: 'borrar-cuenta.html', titulo: 'Borrar tu cuenta - Círculo Vicioso Club', actual: null, canonica: '/borrar-cuenta', css: ['/css/paginas.css'],
    descripcion: 'Cómo borrar tu cuenta de CV Chat, o solo algunos datos, y qué se borra.', imagen: `${CHAT}/puente/vista/web.jpg?p=borrar-cuenta` },
  'seguridad-infantil.html': { fuente: 'seguridad-infantil.html', titulo: 'Protección infantil - Círculo Vicioso Club', actual: null, canonica: '/seguridad-infantil', css: ['/css/paginas.css'],
    descripcion: 'Las normas de CV Chat contra el abuso y la explotación sexual infantil, y cómo avisarnos.', imagen: `${CHAT}/puente/vista/web.jpg?p=seguridad-infantil` },
  'legal.html': { fuente: 'legal.html', titulo: 'Privacidad - Círculo Vicioso Club', actual: null, canonica: '/legal', css: ['/css/paginas.css'], imagen: `${CHAT}/puente/vista/web.jpg?p=legal` },
  '404.html': { fuente: '404.html', titulo: 'No está - Círculo Vicioso Club', actual: null, css: ['/css/paginas.css'], sinIndice: true },
};
