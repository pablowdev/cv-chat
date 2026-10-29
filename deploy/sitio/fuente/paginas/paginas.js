// Las paginas de la web: archivo -> titulo, la seccion del menu, estilos y scripts
const CHAT = 'https://chat.circulovicioso.club';
module.exports = {
  'index.html': { fuente: 'inicio.html', titulo: 'Círculo Vicioso - Club social & podcast', actual: 'inicio', canonica: '/', css: ['/css/inicio.css'], js: ['/js/cv.js'] },
  'full-fat-search.html': { fuente: 'full-fat-search.html', titulo: 'Full Fat Search - Círculo Vicioso', actual: 'fullfat', canonica: '/full-fat-search', css: ['/css/ffs.css'],
    descripcion: 'Buscá cualquier palabra en todos los episodios de Círculo Vicioso y andá directo al momento del video.' },
  'wiki.html': { fuente: 'wiki.html', titulo: 'Wiki - Círculo Vicioso', actual: 'wiki', css: [`${CHAT}/puente/wiki.css`], js: [`${CHAT}/puente/wiki.js`],
    descripcion: 'La wiki de Círculo Vicioso: el lore, los efectos y los personajes del club, escrita por la comunidad.' },
  'cuenta.html': { fuente: 'cuenta.html', titulo: 'Tu cuenta - Círculo Vicioso', actual: null, css: ['/css/paginas.css'], js: ['/js/cuenta.js'], sinIndice: true },
  'legal.html': { fuente: 'legal.html', titulo: 'Privacidad - Círculo Vicioso', actual: null, canonica: '/legal', css: ['/css/paginas.css'] },
  '404.html': { fuente: '404.html', titulo: 'No está - Círculo Vicioso', actual: null, css: ['/css/paginas.css'], sinIndice: true },
};
