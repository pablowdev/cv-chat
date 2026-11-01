<?php
// Ajustes del foro hechos con las mismas funciones que usa el panel de vBulletin (todo se ve y se
// cambia despues desde ahi). Se puede correr mas de una vez: lo que ya esta hecho lo saltea.
//
//  1. Un solo estilo: solo "Circulo Vicioso" se puede elegir y nadie puede cambiarlo
//     (panel: Estilos -> Administrador de estilos, y Opciones -> Estilo e idioma)
//  2. Un solo idioma: el castellano (panel: Idiomas y frases -> Administrador de idiomas)
//  3. El menu de arriba sin Blogs, Articulos, Grupos ni Calendario (Constructor del sitio -> Barra de navegacion)
//  4. La portada: los ultimos temas arriba de la lista de foros, sin "Tendencias cluberas" ni la bienvenida
//     (Constructor del sitio -> Editar pagina)
//  5. Los foros con menos movimiento juntos adentro de "Varios" (panel: Foros -> Administrador de foros)
//  6. Textos que estaban en ingles, en castellano (panel: Idiomas y frases -> Buscar frases)
//  7. El codigo [tweet], seguro (tweet.html): el enlace va en un atributo y no adentro del codigo, y solo
//     se arma el tweet si es un enlace de twitter.com o x.com (panel: Codigos BB -> Codigos BB propios)
//  8. Las direcciones de los foros sin tildes ni simbolos; las viejas siguen andando (Constructor del sitio)
//  9. El foro que se actualiza solo: un anuncio en el modulo de HTML de cabecera (Constructor del sitio)
//
// Uso: php ajustes.php
chdir('/var/www/html/core');
define('CWD', '/var/www/html/core');
define('TIMENOW', time());
define('VB_AREA', 'AdminCP');
foreach (['SERVER_PORT' => 443, 'SERVER_NAME' => 'foro.circulovicioso.club', 'HTTP_HOST' => 'foro.circulovicioso.club', 'SCRIPT_NAME' => '', 'REQUEST_URI' => '', 'REQUEST_METHOD' => '', 'REMOTE_ADDR' => '127.0.0.1', 'HTTP_USER_AGENT' => 'vB CLI'] as $k => $v) if (!isset($_SERVER[$k])) $_SERVER[$k] = $v;
require_once(CWD . '/vb/vb.php');
vB::init();
require_once(CWD . '/includes/class_core.php');
vB::setRequest(new vB_Request_Web());
// Con la sesion del administrador principal, como si fuera desde el panel
vB::setCurrentSession(vB_Session_Cli::getSession(1));
$vbulletin = vB::get_registry();
require_once(CWD . '/includes/adminfunctions.php');
require_once(CWD . '/includes/adminfunctions_template.php');
require_once(CWD . '/includes/adminfunctions_language.php');

$db = vB::getDbAssertor();
$opcion = function ($nombre, $valor) use ($db) {
  $r = $db->getRow('setting', ['varname' => $nombre]);
  if (!$r) { fwrite(STDERR, "no existe la opcion $nombre\n"); exit(1); }
  if ((string)$r['value'] === (string)$valor) return false;
  $db->update('setting', ['value' => $valor], ['varname' => $nombre]);
  return true;
};
$dijo = fn($s) => print("$s\n");

// 1. Un solo estilo
$nuevo = $db->getRow('style', ['title' => 'Círculo Vicioso']);
if (!$nuevo) { fwrite(STDERR, "primero hay que subir el estilo (instalar.php)\n"); exit(1); }
$opcion('styleid', $nuevo['styleid']);
$n = 0;
foreach ($db->getRows('style', []) as $s) {
  $quiero = $s['styleid'] == $nuevo['styleid'] ? 1 : 0;
  if ((int)$s['userselect'] !== $quiero) { $db->update('style', ['userselect' => $quiero], ['styleid' => $s['styleid']]); $n++; }
}
$cambio = $opcion('allowchangestyles', 0);
// Los administradores igual ven el estilo que eligieron alguna vez: todos al predeterminado
// (es el campo "Estilo" de cada usuario en el panel)
$vbulletin->db->query_write("UPDATE " . TABLE_PREFIX . "user SET styleid = 0 WHERE styleid <> 0");
$n += $vbulletin->db->affected_rows();
$dijo("estilos: $n cambiados" . ($cambio ? ', ya nadie puede elegir otro' : ''));

// 2. Un solo idioma
$n = 0;
foreach ($db->getRows('language', []) as $l) {
  $quiero = $l['languageid'] == 2 ? 1 : 0;
  if ((int)$l['userselect'] !== $quiero) { $db->update('language', ['userselect' => $quiero], ['languageid' => $l['languageid']]); $n++; }
}
$opcion('languageid', 2);
if ($n) build_language_datastore();
$dijo("idiomas: $n cambiados");

// 3. El menu de arriba
$site = vB_Library::instance('site');
$nav = vb_unserialize($db->getRow('vBForum:site', ['siteid' => 1])['headernavbar']);
$sacar = ['navbar_blogs', 'navbar_articles', 'navbar_social_groups', 'navbar_calendar'];
$antes = json_encode($nav);
$nav = array_values(array_filter($nav, fn($i) => !in_array($i['title'], $sacar)));
foreach ($nav as &$i) if (!empty($i['subnav'])) $i['subnav'] = array_values(array_filter($i['subnav'], fn($s) => !in_array($s['title'], $sacar)));
unset($i);
if (json_encode($nav) !== $antes) { $site->saveHeaderNavbar(1, $nav, true); $dijo('menu: sin Blogs, Articulos, Grupos ni Calendario'); }
else $dijo('menu: ya estaba');

// 4. La portada (la pagina "Forums", plantilla de pagina 1)
$widgets = vB_Api::instanceInternal('widget');
$ultimos = $db->getRow('widgetinstance', ['widgetinstanceid' => 7, 'pagetemplateid' => 1]);
if ($ultimos) {
  $cfg = vb_unserialize($ultimos['adminconfig']);
  $cfg['searchTitle'] = 'Últimos temas';
  $cfg['resultsPerPage'] = '5';
  // los temas con la ultima respuesta mas nueva, de cualquier fecha (asi nunca queda vacio)
  $cfg['searchJSON'] = '{"starter_only":1,"sort":{"lastcontent":"desc"},"view":"topic","exclude_type":["vBForum_PrivateMessage"],"approved_only":1,"has_answer":"-1"}';
  $db->update('widgetinstance', ['adminconfig' => serialize($cfg)], ['widgetinstanceid' => 7]);
  // arriba de todo en la columna principal (la seccion 0), antes de la lista de foros
  if ((int)$ultimos['displaysection'] !== 0 || (int)$ultimos['displayorder'] !== 0) {
    $orden = 1;
    foreach ($db->getRows('widgetinstance', ['pagetemplateid' => 1, 'displaysection' => 0], ['field' => 'displayorder', 'direction' => 'ASC']) as $w)
      if ($w['widgetinstanceid'] != 7) $db->update('widgetinstance', ['displayorder' => $orden++], ['widgetinstanceid' => $w['widgetinstanceid']]);
    $db->update('widgetinstance', ['displaysection' => 0, 'displayorder' => 0], ['widgetinstanceid' => 7]);
  }
  $dijo('portada: ultimos temas arriba');
}
if ($db->getRow('widgetinstance', ['widgetinstanceid' => 10, 'pagetemplateid' => 1])) {
  vB_Library::instance('widget')->deleteWidgetInstances([10]);
  $dijo('portada: sin Tendencias cluberas');
}
// y sin el recuadro de bienvenida "Circulo Vicioso Club" (HTML fijo)
if ($db->getRow('widgetinstance', ['widgetinstanceid' => 6, 'pagetemplateid' => 1])) {
  vB_Library::instance('widget')->deleteWidgetInstances([6]);
  $dijo('portada: sin el recuadro de bienvenida');
}
$widgets->clearCaches();

// 5. "Varios": los foros con menos movimiento, adentro (sus temas y direcciones viejas siguen andando)
$foroRaiz = 26; // "Circulo Vicioso FORO"
$juntar = ['auto-cultivo', 'crypto-stock', 'deportes-y-rocas-pesadas'];
$canales = vB_Api::instanceInternal('content_channel');
$varios = $db->getRow('vBForum:node', ['parentid' => $foroRaiz, 'urlident' => 'varios']);
if (!$varios) {
  $id = $canales->add(['title' => 'Varios', 'description' => 'auto-cultivo, crypto, deportes y lo que no entre en otro lado', 'parentid' => $foroRaiz, 'displayorder' => 50]);
  if (is_array($id) && isset($id['errors'])) { fwrite(STDERR, 'no se pudo crear Varios: ' . json_encode($id['errors']) . "\n"); exit(1); }
  $varios = $db->getRow('vBForum:node', ['nodeid' => $id]);
  $dijo('foros: Varios creado');
}
foreach ($juntar as $u) {
  $f = $db->getRow('vBForum:node', ['parentid' => $foroRaiz, 'urlident' => $u]);
  if (!$f) continue;
  $r = vB_Library::instance('node')->moveNodes($f['nodeid'], $varios['nodeid']);
  if (is_array($r) && isset($r['errors'])) { fwrite(STDERR, "no se pudo mover $u: " . json_encode($r['errors']) . "\n"); exit(1); }
  $dijo("foros: $u adentro de Varios");
}

// 6. Textos en ingles (traducciones del castellano, como las guarda el panel)
$frases = [
  'pagemeta' => [
    'page_4ecbdac82f2c2760323361_title' => 'Mensajes',
    'page_4ecbdac82f0bb437025811_title' => 'Perfil',
    'page_4ecbdac82efb6117736147_title' => 'Búsqueda avanzada',
    'page_4ecbdac82f039695291105_title' => 'Registrarse',
    'page_4ecbdac82f039695291106_title' => 'Olvidé mi contraseña',
    'page_4ecbdac82f039695291107_title' => 'Contacto',
    'page_4ecbdac82f039695291108_title' => 'Ayuda',
    'page_4ecbdac82f07a518983925_title' => 'Quién está en línea',
    'page_4ecbdac82f07a518983926_title' => 'Lista de miembros',
    'page_4ecbdac82f0fd178471901_title' => 'Fotos y videos',
    'page_4ecbdac82f13d177590572_title' => 'Editar fotos',
    'page_4ecbdac82f240819539885_title' => 'Configuración',
    'page_4ecbdac82f281504471586_title' => 'Resultados de la búsqueda',
    'page_4ecbdac82f2c2760323362_title' => 'Suscripciones',
    'page_4ecbdac82f2c2760323364_title' => 'Álbum',
    'page_4ecbdac82f2c2760323365_title' => 'Mensajes de visitas',
    'page_4ecbdac82f2c2760323369_title' => 'Nuevo tema',
    'page_4ecbdac82f2c2760323374_title' => 'Activá tu cuenta',
    'page_4ecbdac82f2c2760323375_title' => 'Códigos de activación',
    'page_page_resetpassword_5697fafcd9456515617388_title' => 'Cambiar la contraseña',
    'page_page_privacy_1e28c8ffda65b2f23db5b0_title' => 'Política de privacidad',
    'page_page_tos_632bbd1caa03d400379749_title' => 'Términos del servicio',
  ],
  'global' => [
    'or_sign_up' => 'o <a id="idLoginSignup" href="{1}" target="_top">creá tu cuenta</a>',
    'mark_channels_read' => 'Marcar todo como leído',
  ],
  'forumdisplay' => [
    'mark_this_channel_read' => 'Marcar este foro como leído',
  ],
  'navbarlinks' => [
    'navbar_mark_channels_read' => 'Marcar todo como leído',
  ],
];
$n = 0;
foreach ($frases as $campo => $lista) foreach ($lista as $var => $texto) {
  $ya = $db->getRow('phrase', ['varname' => $var, 'languageid' => 2, 'fieldname' => $campo]);
  if ($ya && $ya['text'] === $texto) continue;
  $master = $db->getRow('phrase', ['varname' => $var, 'languageid' => -1, 'fieldname' => $campo]);
  if (!$master) { fwrite(STDERR, "no existe la frase $var\n"); continue; }
  vB_Library::instance('phrase')->save($campo, $var, ['text' => [2 => $texto], 'oldvarname' => $var, 'oldfieldname' => $campo, 't' => 0, 'ismaster' => 0, 'product' => $master['product']], true);
  $n++;
}
if ($n) build_language(2);
$dijo("textos: $n traducidos");

// 7. [tweet] seguro: como lo guarda el panel ({param} -> %1$s y los % dobles)
$tw = $db->getRow('bbcode', ['bbcodetag' => 'tweet', 'twoparams' => 0]);
$html = trim((string)@file_get_contents(__DIR__ . '/tweet.html'));
if ($tw && $html !== '') {
  $nuevo = str_replace('{param}', '%1$s', str_replace('%', '%%', $html));
  if ($tw['bbcodereplacement'] !== $nuevo) {
    $db->update('bbcode', ['bbcodereplacement' => $nuevo, 'bbcodeexplanation' => 'Pegá el enlace de un tweet (de twitter.com o x.com) y se ve el tweet.',
      'bbcodeexample' => '[tweet]https://x.com/circulovicioso8/status/1611737917529153536[/tweet]'], ['bbcodeid' => $tw['bbcodeid']]);
    build_bbcode_cache();
    $dijo('[tweet]: reemplazado por la version segura');
  }
}

// 8. Direcciones sin tildes ni simbolos (forum/tech/programación -> forum/tech/programacion): asi los
//    enlaces se pegan enteros en el chat y en cualquier lado. Igual que cambiar la direccion en el
//    Constructor del sitio: la vieja queda redirigiendo a la nueva, con los temas adentro
$q = $vbulletin->db->query_read("SELECT routeid, prefix, contentid FROM " . TABLE_PREFIX . "routenew WHERE redirect301 IS NULL AND class = 'vB5_Route_Channel' AND prefix REGEXP '[^ -~]'");
$rutas = [];
while ($r = $vbulletin->db->fetch_array($q)) $rutas[] = $r;
$sinTilde = ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n', 'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u', 'ç' => 'c',
  'Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ú' => 'u', 'Ü' => 'u', 'Ñ' => 'n'];
// La base compara sin fijarse en las tildes: "musica" ya es "música". Ocupada es si la usa otro canal
$ocupada = function ($prefijo, $canal) use ($vbulletin) {
  $r = $vbulletin->db->query_first("SELECT contentid FROM " . TABLE_PREFIX . "routenew WHERE redirect301 IS NULL AND prefix = '" . $vbulletin->db->escape_string($prefijo) . "' AND contentid <> " . (int)$canal);
  return !empty($r);
};
foreach ($rutas as $r) {
  $limpia = strtolower(strtr($r['prefix'], $sinTilde));
  $limpia = trim(preg_replace(['#[^a-z0-9/-]+#', '#-{2,}#', '#-*/-*#'], ['-', '-', '/'], $limpia), '-/');
  if ($limpia === '' || $limpia === $r['prefix']) continue;
  for ($n = 2, $cand = $limpia; $ocupada($cand, $r['contentid']); $n++) $cand = "$limpia-$n";
  vB5_Route::updateRoute((int)$r['routeid'], ['prefix' => $cand]);
  $dijo("direccion: {$r['prefix']} -> $cand");
}

// 9. El foro que se actualiza solo (tools/puente/web/foro-vivo.js, desde CV Chat): un anuncio en el
//    "modulo de HTML de cabecera", que esta en todas las paginas. Se apaga o se borra desde el
//    Constructor del sitio (o Publicidad), y este paso no lo vuelve a prender si ya existe
$vivoTitulo = 'Foro en vivo (se actualiza solo)';
if (!$db->getRow('ad', ['title' => $vivoTitulo])) {
  if ($db->getRow('ad', ['adlocation' => 'header', 'active' => 1])) { fwrite(STDERR, "ya hay otro anuncio en la cabecera: revisar a mano\n"); exit(1); }
  // Lo mismo que hace Publicidad -> Guardar (vB_Api_Ad::save pide una sesion del panel): el anuncio, y la
  // plantilla ad_header armada como la arma vBulletin para un anuncio sin condiciones
  $snippet = '<script src="https://chat.circulovicioso.club/puente/foro-vivo.js" defer></script>';
  $adid = $db->insert('ad', ['title' => $vivoTitulo, 'adlocation' => 'header', 'displayorder' => 1, 'active' => 1, 'snippet' => $snippet]);
  if (is_array($adid)) $adid = array_pop($adid);
  $tpl = '<div class="ad_header_inner"><vb:literal>' . $snippet . '</vb:literal><vb:if condition="$' . 'adsshown[] = ' . (int)$adid . '"></vb:if></div>';
  $tl = vB_Library::instance('template');
  $opts = ['forcenotextonly' => true, 'textonly' => 0];
  try { $tl->insert(-1, 'ad_header', $tpl, 'vbulletin', false, '', false, $opts); }
  catch (vB_Exception_Api $e) { $tl->update($tl->getTemplateID('ad_header', -1), 'ad_header', $tpl, 'vbulletin', false, false, '', false, $opts); }
  $dijo('foro en vivo: agregado (modulo de HTML de cabecera)');
}

// Que el foro vuelva a leer todo (como Mantenimiento -> Borrar la cache del sistema)
vB::getDatastore()->build_options();
build_all_styles(0, 0, '', false, false);
vB_Cache::resetCache();
vB::getDatastore()->resetCache();
$dijo('listo');
