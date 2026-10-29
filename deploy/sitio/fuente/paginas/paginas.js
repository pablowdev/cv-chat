// Las paginas de la web: archivo -> titulo, la seccion del menu, estilos y scripts
const CHAT = 'https://chat.circulovicioso.club';
module.exports = {
  'index.html': { fuente: 'inicio.html', titulo: 'Circulo Vicioso Club', actual: 'inicio', canonica: '/', css: ['/css/inicio.css'], js: ['/js/cv.js'] },
  'full-fat-search.html': { fuente: 'full-fat-search.html', titulo: 'Full Fat Search - Circulo Vicioso Club', actual: 'fullfat', canonica: '/full-fat-search', css: ['/css/ffs.css'],
    descripcion: 'Buscá cualquier palabra en todos los episodios de Círculo Vicioso y andá directo al momento del video.' },
  'wiki.html': { fuente: 'wiki.html', titulo: 'Wiki - Circulo Vicioso Club', actual: 'wiki', css: [`${CHAT}/puente/wiki.css`], js: [`${CHAT}/puente/wiki.js`],
    descripcion: 'La wiki de Círculo Vicioso: el lore, los efectos y los personajes del club, escrita por la comunidad.' },
  'cuenta.html': { fuente: 'cuenta.html', titulo: 'Tu cuenta - Circulo Vicioso Club', actual: null, css: ['/css/paginas.css'], js: ['/js/cuenta.js'], sinIndice: true },
  'legal.html': { fuente: 'legal.html', titulo: 'Privacidad - Circulo Vicioso Club', actual: null, canonica: '/legal', css: ['/css/paginas.css'] },
  '404.html': { fuente: '404.html', titulo: 'No está - Circulo Vicioso Club', actual: null, css: ['/css/paginas.css'], sinIndice: true },
};
