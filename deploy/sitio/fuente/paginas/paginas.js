// Las paginas de la web: archivo -> titulo, la seccion del menu, estilos y scripts
const CHAT = 'https://chat.circulovicioso.club';
module.exports = {
  'index.html': { fuente: 'inicio.html', titulo: 'Círculo Vicioso Club', actual: 'inicio', canonica: '/', css: ['/css/inicio.css'], js: ['/js/cv.js'] },
  'full-fat-search.html': { fuente: 'full-fat-search.html', titulo: 'Full Fat Search - Círculo Vicioso Club', actual: 'fullfat', canonica: '/full-fat-search', css: ['/css/ffs.css'],
    descripcion: 'Buscá cualquier palabra en todos los episodios de Círculo Vicioso y andá directo al momento del video.' },
  'wiki.html': { fuente: 'wiki.html', titulo: 'Wiki - Círculo Vicioso Club', actual: 'wiki', css: [`${CHAT}/puente/wiki.css`], js: [`${CHAT}/puente/wiki.js`],
    descripcion: 'La wiki de Círculo Vicioso: el lore, los efectos y los personajes del club, escrita por la comunidad.' },
  'cuenta.html': { fuente: 'cuenta.html', titulo: 'Tu cuenta - Círculo Vicioso Club', actual: null, css: ['/css/paginas.css'], js: ['/js/cuenta.js'], sinIndice: true },
  'descargar.html': { fuente: 'descargar.html', titulo: 'Descargá la app - Círculo Vicioso Club', actual: null, canonica: '/descargar', css: ['/css/paginas.css'],
    descripcion: 'La app de CV Chat para Android, iPhone, Windows, Mac y Linux: el chat, el foro y los juegos del club.' },
  'borrar-cuenta.html': { fuente: 'borrar-cuenta.html', titulo: 'Borrar tu cuenta - Círculo Vicioso Club', actual: null, canonica: '/borrar-cuenta', css: ['/css/paginas.css'],
    descripcion: 'Cómo borrar tu cuenta de CV Chat, o solo algunos datos, y qué se borra.' },
  'legal.html': { fuente: 'legal.html', titulo: 'Privacidad - Círculo Vicioso Club', actual: null, canonica: '/legal', css: ['/css/paginas.css'] },
  '404.html': { fuente: '404.html', titulo: 'No está - Círculo Vicioso Club', actual: null, css: ['/css/paginas.css'], sinIndice: true },
};
