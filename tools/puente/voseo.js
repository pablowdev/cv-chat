// Los textos de Haven en español (/locales/es.json) pasan del tú al vos, como se habla
// aca: "¿Qué querés preguntar?", "Hacé clic", "Contale a la gente sobre vos". Lo usa
// instalable.js al servir es.json. Tambien traduce lo que Haven dejo en ingles.
//
// Las formas que solo pueden ser del tú (quieres, puedes, inténtalo...) se cambian en
// cualquier lugar. Los imperativos que se escriben igual que la tercera persona (crea,
// abre, muestra...) solo al empezar una oracion o despues de "y", "o", "luego": asi
// "Esto elimina el mensaje" queda igual y "Elimina el mensaje" pasa a "Eliminá el mensaje".
'use strict';

// Formas del tú que no se confunden con otra cosa
const SIEMPRE = {
  quieres: 'querés', puedes: 'podés', tienes: 'tenés', eres: 'sos', necesitas: 'necesitás', debes: 'debés',
  sabes: 'sabés', haces: 'hacés', recibes: 'recibís', prefieres: 'preferís', sientes: 'sentís', vuelves: 'volvés',
  escribes: 'escribís', envías: 'enviás', perteneces: 'pertenecés', conoces: 'conocés', estás: 'estás', ves: 'ves',
  usas: 'usás', cambias: 'cambiás', borras: 'borrás', eliges: 'elegís', subes: 'subís', abres: 'abrís', cierras: 'cerrás',
  creas: 'creás', guardas: 'guardás', activas: 'activás', desactivas: 'desactivás', escuchas: 'escuchás', hablas: 'hablás',
  entras: 'entrás', sales: 'salís', pierdes: 'perdés', recuerdas: 'recordás', olvidas: 'olvidás', mandas: 'mandás',
  intentas: 'intentás', pegas: 'pegás', configuras: 'configurás', escoges: 'elegís', buscas: 'buscás', tocas: 'tocás',
  // con pronombre
  'inténtalo': 'intentalo', 'déjalo': 'dejalo', 'pégala': 'pegala', 'pégalo': 'pegalo', 'actívalo': 'activalo',
  'asegúrate': 'asegurate', 'entrégasela': 'entregásela', 'pídeselo': 'pedíselo', 'reinícialo': 'reinicialo',
  'confírmalo': 'confirmalo', 'regístrate': 'registrate', 'llámala': 'llamala', 'protégela': 'protegela',
  'desactívalo': 'desactivalo', 'aplícalas': 'aplicalas', 'considéralo': 'consideralo', 'guárdalo': 'guardalo',
  'elígelo': 'elegilo', 'selecciónalo': 'seleccionalo', 'cuéntale': 'contale', 'revísalo': 'revisalo', 'descárgalo': 'descargalo',
  'muévelos': 'movelos', 'promuévelos': 'promovelos', 'quítala': 'quitala', 'hazlo': 'hacelo', 'házlo': 'hacelo',
  'pídele': 'pedile', 'dímelo': 'decímelo', 'cópialo': 'copialo', 'ábrelo': 'abrilo', 'ciérralo': 'cerralo',
  'úsalo': 'usalo', 'súbelo': 'subilo', 'escríbelo': 'escribilo', 'compártelo': 'compartilo', 'recárgala': 'recargala',
  'recárgalo': 'recargalo', 'cámbialo': 'cambialo', 'cámbiala': 'cambiala', 'tómate': 'tomate', 'únete': 'unite',
  'conéctate': 'conectate', 'vuélvelo': 'volvelo', 'bórralo': 'borralo', 'quítalo': 'quitalo', 'ponlo': 'ponelo',
  lees: 'leés', pasas: 'pasás', sigues: 'seguís', oyes: 'oís', 'suéltalo': 'soltalo', 'suéltala': 'soltala',
  'contigo': 'con vos', 'tú': 'vos',
};
// Imperativos del tú que se escriben como la tercera persona: solo al empezar una oracion
const IMPERATIVO = {
  haz: 'hacé', sube: 'subí', elige: 'elegí', escoge: 'elegí', escribe: 'escribí', selecciona: 'seleccioná', ingresa: 'ingresá',
  introduce: 'ingresá', establece: 'establecé', intenta: 'intentá', prueba: 'probá', usa: 'usá', pulsa: 'tocá',
  vuelve: 'volvé', recarga: 'recargá', inicia: 'iniciá', cierra: 'cerrá', abre: 'abrí', 'añade': 'agregá', agrega: 'agregá',
  crea: 'creá', pega: 'pegá', copia: 'copiá', busca: 'buscá', activa: 'activá', desactiva: 'desactivá', configura: 'configurá',
  guarda: 'guardá', descarga: 'descargá', comparte: 'compartí', invita: 'invitá', 'envía': 'enviá', revisa: 'revisá',
  espera: 'esperá', confirma: 'confirmá', deja: 'dejá', 'mantén': 'mantené', toca: 'tocá', arrastra: 'arrastrá',
  suelta: 'soltá', ajusta: 'ajustá', cambia: 'cambiá', elimina: 'eliminá', borra: 'borrá', bloquea: 'bloqueá',
  silencia: 'silenciá', oculta: 'ocultá', muestra: 'mostrá', mira: 'mirá', pon: 'poné', ten: 'tené', marca: 'marcá',
  desmarca: 'desmarcá', pasa: 'pasá', comprueba: 'comprobá', verifica: 'verificá', otorga: 'otorgá', asigna: 'asigná',
  quita: 'quitá', fija: 'fijá', edita: 'editá', reinicia: 'reiniciá', reintenta: 'reintentá', empieza: 'empezá',
  regresa: 'volvé', lee: 'leé', responde: 'respondé', conecta: 'conectá', desconecta: 'desconectá',
  vincula: 'vinculá', define: 'definí', habilita: 'habilitá', deshabilita: 'deshabilitá', cancela: 'cancelá',
  acepta: 'aceptá', rechaza: 'rechazá', pide: 'pedí', escanea: 'escaneá', genera: 'generá',
  completa: 'completá', aprueba: 'aprobá', presiona: 'apretá', mueve: 'mové', renombra: 'renombrá', reporta: 'reportá',
  limpia: 'limpiá', actualiza: 'actualizá', instala: 'instalá', exporta: 'exportá', importa: 'importá', solicita: 'solicitá',
  avisa: 'avisá', vota: 'votá', juega: 'jugá', llama: 'llamá', piensa: 'pensá', recuerda: 'recordá',
};
const W = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
const conMayuscula = (orig, nuevo) => (orig === orig.toUpperCase() && orig.length > 1 ? nuevo.toUpperCase()
  : orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase() ? nuevo[0].toUpperCase() + nuevo.slice(1) : nuevo);
const reSiempre = new RegExp('(^|[^' + W + '])(' + Object.keys(SIEMPRE).join('|') + ')(?=[^' + W + ']|$)', 'gi');
// Seguido de otra palabra (solo, o antes de ":", es un titulo) y no de "de" ni de un adjetivo:
// "Copia de seguridad", "Copia automática", "Carga fallida" son sustantivos
const VERBO = '(' + Object.keys(IMPERATIVO).join('|') + ')(?=\\s+[^\\s)])(?!\\s+(?:del?|automática|automático|fallida|fallido|completa|completo|nueva|nuevo)\\b)';
// Al empezar una oracion...
const reInicio = new RegExp('(^|[.!?¿¡:;(•—–]\\s*|>\\s*)' + VERBO, 'gi');
// ...o despues de "y", "o", "luego" en una oracion que ya le pide algo a la persona ("Copiá el ID, luego
// hacé clic"), no en una que describe ("restablece tu contraseña y borra tus claves")
const reConector = new RegExp('(\\b(?:y|o|luego|después|o bien)\\s+)' + VERBO, 'gi');
// Verbos que en Haven suelen describir lo que hace una opcion ("Muestra un punto de color"): pasan al
// vos solo si el texto le habla a la persona ("Elimina tu cuenta" -> "Eliminá tu cuenta")
const DESCRIBEN = new Set(['muestra', 'oculta', 'silencia', 'busca', 'comprueba', 'define', 'bloquea', 'usa', 'abre', 'guarda',
  'descarga', 'agrega', 'añade', 'elimina', 'activa', 'desactiva', 'mira', 'marca', 'cambia', 'limpia', 'actualiza', 'borra',
  'pasa', 'reinicia', 'crea', 'configura', 'copia', 'instala', 'sube', 'espera', 'recarga']);
const A_VOS = /(^|[^A-Za-zÁÉÍÓÚáéíóúñ])(tu|tus|te|ti|contigo|vos|sos)(?=[^A-Za-zÁÉÍÓÚáéíóúñ]|$)/i;
const reTi = new RegExp('(^|[^' + W + '])(por|para|a|de|sin|con|sobre|entre|hacia|según) ti(?=[^' + W + ']|$)', 'gi');

function voseo(s) {
  if (typeof s !== 'string' || !s) return s;
  let r = s.replace(reSiempre, (m, pre, w) => pre + conMayuscula(w, SIEMPRE[w.toLowerCase()]));
  r = r.replace(/\bhaz clic\b/gi, (m) => conMayuscula(m, 'hacé clic'));
  const habla = r !== s || A_VOS.test(s);
  r = r.replace(reInicio, (m, pre, w) => (DESCRIBEN.has(w.toLowerCase()) && !habla ? m : pre + conMayuscula(w, IMPERATIVO[w.toLowerCase()])));
  if (r !== s) r = r.replace(reConector, (m, pre, w) => (DESCRIBEN.has(w.toLowerCase()) && !habla ? m : pre + conMayuscula(w, IMPERATIVO[w.toLowerCase()])));
  r = r.replace(reTi, (m, pre, p) => pre + p + ' vos');
  return r;
}

// Lo que Haven dejo en ingles en es.json (o le falta)
const TRADUCCIONES = {
  'channels.hidden_channels_count': '{{count}} canales ocultos',
  'channels.hidden_channels_restore_title': 'Mostrar los canales ocultos',
  'channels.no_hidden_channels': 'No hay canales ocultos',
  'channels.show_all_hidden': 'Mostrar todos',
  'modals.hidden_channels.title': 'Canales ocultos',
  'modals.hidden_channels.desc': 'Los canales ocultos no aparecen en tu lista, pero seguís teniendo acceso. Mostrá uno para que vuelva.',
  'context_menu.channel.hide': 'Ocultar canal',
  'users.connections.client_secret': 'Clave secreta del cliente',
};

function aplicar(obj) {
  const recorrer = (o, ruta) => {
    if (typeof o === 'string') return voseo(o);
    if (Array.isArray(o)) return o.map((x, i) => recorrer(x, ruta + '.' + i));
    if (o && typeof o === 'object') { const n = {}; for (const k of Object.keys(o)) n[k] = recorrer(o[k], ruta ? ruta + '.' + k : k); return n; }
    return o;
  };
  const r = recorrer(obj, '');
  for (const [clave, texto] of Object.entries(TRADUCCIONES)) {
    const partes = clave.split('.');
    let o = r;
    for (const p of partes.slice(0, -1)) { if (!o[p] || typeof o[p] !== 'object') o[p] = {}; o = o[p]; }
    o[partes[partes.length - 1]] = texto;
  }
  return r;
}

module.exports = { voseo, aplicar };
