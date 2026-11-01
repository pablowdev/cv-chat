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
//  8. Las direcciones de los foros y de los temas sin tildes ni simbolos; las viejas siguen andando (Constructor
//     del sitio y Opciones -> Configuracion de URL)
//  9. El foro que se actualiza solo: un anuncio en el modulo de HTML de cabecera (Constructor del sitio)
// 10. tejemanejes oculto: la compra/venta va en el Marketplace (panel: Foros -> Permisos del canal)
// 11. La vista previa de los enlaces a los temas: una imagen con un pedacito (panel: Productos y ganchos -> Ganchos)
// 12. La cabecera de la web tambien en el foro, y en la portada sin el titulo (Constructor del sitio)
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
  // de todos los foros (los nuevos tambien) menos tejemanejes, que quedo oculto (paso 10): asi no sale ni
  // para los superadministradores, que ven todo. Es "Canales: excluir" del modulo. Blogs, grupos, articulos
  // y albumes afuera, como con "Foro" solo
  $cl = vB_Library::instance('content_channel');
  $fuera = [];
  foreach ([vB_Channel::DEFAULT_BLOG_PARENT, vB_Channel::DEFAULT_SOCIALGROUP_PARENT, vB_Channel::DEFAULT_ARTICLE_PARENT, vB_Channel::ALBUM_CHANNEL] as $guid)
    if ($id = (int)$cl->fetchChannelIdByGUID($guid)) $fuera[] = $id;
  $t = $db->getRow('vBForum:node', ['parentid' => 26, 'urlident' => 'tejemanejes']);
  if ($t) $fuera[] = (int)$t['nodeid'];
  $cfg['module_filter_nodes'] = ['exclude' => $fuera, 'include_children' => true];
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
// sin esos dos, la columna de la derecha quedo vacia: la portada a una sola columna, para que lo de abajo
// ocupe todo el ancho de la cabecera (Constructor del sitio -> Editar pagina -> Diseño "Completo")
$completo = $db->getRow('screenlayout', ['varname' => 'full']);
$plantilla = $db->getRow('pagetemplate', ['pagetemplateid' => 1]);
if ($completo && $plantilla && (int)$plantilla['screenlayoutid'] !== (int)$completo['screenlayoutid']
    && !$db->getRow('widgetinstance', ['pagetemplateid' => 1, 'displaysection' => 1])) {
  $db->update('pagetemplate', ['screenlayoutid' => (int)$completo['screenlayoutid']], ['pagetemplateid' => 1]);
  $dijo('portada: una sola columna');
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
  // Los botones de arriba del menu del panel: en castellano no entraban y se cortaban (tablet, celu)
  'cpglobal' => [
    'save_prefs' => 'Guardar menú',
  ],
  'cphome' => [
    'revert_prefs' => 'Revertir menú',
    'control_panel_home' => 'Inicio del panel',
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

// 8b. Los temas, tambien sin tildes: la opcion de vBulletin "Usar caracteres ASCII en las URL" (Opciones ->
//     Configuracion de URL) para lo nuevo, y lo que ya estaba armado de nuevo con la misma funcion de vBulletin
//     (con la opcion prendida). vBulletin busca cada tema por su numero, asi que los enlaces viejos siguen andando
if ($opcion('asciiurls', 1)) { vB::getDatastore()->build_options(); $dijo('direcciones: opcion de solo ASCII prendida'); }
$q = $vbulletin->db->query_read("SELECT nodeid, title, urlident FROM " . TABLE_PREFIX . "node WHERE urlident REGEXP '[^ -~]' AND title <> ''");
$n = 0;
while ($r = $vbulletin->db->fetch_array($q)) {
  $nueva = vB_String::getUrlIdent(vB_String::unHtmlSpecialChars($r['title']));
  if ($nueva === '' || $nueva === $r['urlident'] || preg_match('/[^ -~]/', $nueva)) continue;
  $db->update('vBForum:node', ['urlident' => $nueva], ['nodeid' => (int)$r['nodeid']]);
  $n++;
}
if ($n) $dijo("direcciones: $n temas sin tildes");

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

// 10. tejemanejes: la compra/venta se mudo al Marketplace de CV Chat (panel: Foros -> Permisos del canal)
$teje = $db->getRow('vBForum:node', ['parentid' => $foroRaiz, 'urlident' => 'tejemanejes']);
if ($teje) {
  $tid = (int)$teje['nodeid'];
  $aviso = 'Archivo. La compra/venta se mudó al Marketplace: https://circulovicioso.club/marketplace';
  if ($teje['description'] !== $aviso) {
    $r = $canales->update($tid, ['description' => $aviso]);
    if (is_array($r) && isset($r['errors'])) { fwrite(STDERR, 'no se pudo cambiar tejemanejes: ' . json_encode($r['errors']) . "\n"); exit(1); }
    $dijo('tejemanejes: descripcion de archivo');
  }
  // Oculto del todo, para todos (tambien administradores): no se ve, no se busca y no sale en "Ultimos temas"
  // ni en lo nuevo. Los temas quedan guardados; se vuelve a mostrar borrando estos permisos del canal
  $cp = vB_ChannelPermission::instance();
  $oculto = 1 | 2 | 4 | 524288 | 16 | 32 | 16384; // canview, canviewothers, cansearch, canviewthreads, canpostnew, canreply, canpostpoll
  foreach ($db->assertQuery('vBForum:permission', ['nodeid' => 1]) as $raiz) {
    $g = (int)$raiz['groupid'];
    $quiero = (int)$raiz['forumpermissions'] & ~$oculto;
    $ya = $db->getRow('vBForum:permission', ['nodeid' => $tid, 'groupid' => $g]);
    if ($ya && (int)$ya['forumpermissions'] === $quiero) continue;
    $p = $raiz; unset($p['permissionid'], $p['nodeid'], $p['groupid']);
    $p['forumpermissions'] = $quiero;
    $cp->setPermissions($tid, $g, $p);
    $dijo("tejemanejes: oculto para el grupo $g");
  }
  // Y fuera de la lista de foros (los superadministradores se saltean los permisos): "Orden" 0 es no
  // mostrarlo (panel: Foros -> Administrador de foros)
  if ((int)$teje['displayorder'] !== 0) {
    $r = $canales->update($tid, ['displayorder' => 0]);
    if (is_array($r) && isset($r['errors'])) { fwrite(STDERR, 'no se pudo sacar tejemanejes de la lista: ' . json_encode($r['errors']) . "\n"); exit(1); }
    $dijo('tejemanejes: fuera de la lista de foros');
  }
}

// 11. La vista previa de los enlaces al foro (WhatsApp, Telegram, X, CV Chat...): en los temas y los foros, una
//     imagen con el titulo, quien lo escribio y el principio del texto (tools/puente/vistas.js, en CV Chat). Un
//     gancho de plantilla en la cabecera (panel: Productos y ganchos -> Ganchos, "CV: vista previa de los enlaces")
//     con su plantilla (cv_vista_previa); la imagen de siempre (Opciones -> Facebook, "Imagen") pasa a esa plantilla
//     para el resto de las paginas, asi no quedan dos. Se apaga desde el panel: desactivar el gancho y volver a poner la imagen
$vpTitulo = 'CV: vista previa de los enlaces';
if (!$db->getRow('hook', ['title' => $vpTitulo])) {
  $logo = (string) vB::getDatastore()->getOption('facebookfeedimageurl');
  if ($logo === '') { fwrite(STDERR, "vista previa: no hay imagen en Opciones -> Facebook: revisar a mano\n"); exit(1); }
  $tpl = '<vb:comment>La imagen de la vista previa de los enlaces (CV Chat arma la de los temas y los foros: tools/puente/vistas.js)</vb:comment>' . "\n"
    . '<vb:if condition="$vboptions[\'show_opengraph_tags\']">' . "\n"
    . '<vb:if condition="!empty($cvnodo) AND !empty($cvurl)">' . "\n"
    . '	<meta property="og:image" content="https://chat.circulovicioso.club/puente/vista/foro.jpg?u={vb:var cvurl}" />' . "\n"
    . '	<meta property="og:image:width" content="1200" />' . "\n"
    . '	<meta property="og:image:height" content="630" />' . "\n"
    . '	<meta name="twitter:card" content="summary_large_image" />' . "\n"
    . '<vb:else />' . "\n"
    . '	<meta property="og:image" content="' . htmlspecialchars($logo) . '" />' . "\n"
    . '</vb:if>' . "\n"
    . '</vb:if>';
  $tl = vB_Library::instance('template');
  $opts = ['forcenotextonly' => true, 'textonly' => 0];
  try { $tl->insert(-1, 'cv_vista_previa', $tpl, 'vbulletin', false, '', false, $opts); }
  catch (vB_Exception_Api $e) { $tl->update($tl->getTemplateID('cv_vista_previa', -1), 'cv_vista_previa', $tpl, 'vbulletin', false, false, '', false, $opts); }
  // Lo mismo que hace Productos y ganchos -> Agregar gancho (vB_Api_Hook::saveHook pide una sesion del panel)
  $hk = vB_Api::instanceInternal('Hook');
  $db->insert('hook', ['hookname' => 'header_head', 'title' => $vpTitulo, 'arguments' => serialize($hk->encodeArguments("cvurl=page.url\ncvnodo=page.nodeid")),
    'product' => 'vbulletin', 'active' => 1, 'template' => 'cv_vista_previa', 'hookorder' => 10]);
  vB::getDatastore()->build('hooks', serialize($db->getRows('getHookProductList')), 1);
  $opcion('facebookfeedimageurl', '');
  $dijo('vista previa de los enlaces: gancho agregado');
}

// 12. La cabecera de la web tambien en el foro (cabecera.html: el logo, "Circulo Vicioso" y el menu de la web),
//     asi el foro se siente parte de la pagina. Va en el "modulo de HTML de cabecera 2" (Constructor del sitio, o
//     Publicidad: "CV: cabecera de la web"); el logo, el buscador y la pestaña "Foros" de vBulletin se esconden
//     desde el estilo (css_additional.css) y el buscador pasa abajo, al renglon de "Nuevos temas". Si cambia
//     cabecera.html, este paso la actualiza. En la portada, sin el titulo "Circulo Vicioso" (ya esta arriba)
$cabTitulo = 'CV: cabecera de la web';
$cab = trim((string)@file_get_contents(__DIR__ . '/cabecera.html'));
if ($cab !== '') {
  $ya = $db->getRow('ad', ['title' => $cabTitulo]);
  if (!$ya && $db->getRow('ad', ['adlocation' => 'header2', 'active' => 1])) { fwrite(STDERR, "ya hay otro anuncio en la cabecera 2: revisar a mano\n"); exit(1); }
  if (!$ya || $ya['snippet'] !== $cab || !(int)$ya['active']) {
    if ($ya) { $adid = (int)$ya['adid']; $db->update('ad', ['snippet' => $cab, 'active' => 1], ['adid' => $adid]); }
    else { $adid = $db->insert('ad', ['title' => $cabTitulo, 'adlocation' => 'header2', 'displayorder' => 1, 'active' => 1, 'snippet' => $cab]); if (is_array($adid)) $adid = array_pop($adid); }
    // la plantilla ad_header2 como la arma vBulletin para un anuncio sin condiciones (igual que el paso 9)
    $tpl = '<div class="ad_header2_inner"><vb:literal>' . $cab . '</vb:literal><vb:if condition="$' . 'adsshown[] = ' . (int)$adid . '"></vb:if></div>';
    $tl = vB_Library::instance('template');
    $opts = ['forcenotextonly' => true, 'textonly' => 0];
    try { $tl->insert(-1, 'ad_header2', $tpl, 'vbulletin', false, '', false, $opts); }
    catch (vB_Exception_Api $e) { $tl->update($tl->getTemplateID('ad_header2', -1), 'ad_header2', $tpl, 'vbulletin', false, false, '', false, $opts); }
    $dijo('cabecera de la web: ' . ($ya ? 'actualizada' : 'agregada'));
  }
}
$titulo = $db->getRow('widgetinstance', ['pagetemplateid' => 1, 'widgetid' => 56]);
if ($titulo) {
  vB_Library::instance('widget')->deleteWidgetInstances([(int)$titulo['widgetinstanceid']]);
  $dijo('portada: sin el titulo "Circulo Vicioso"');
}

// Que el foro vuelva a leer todo (como Mantenimiento -> Borrar la cache del sistema)
vB::getDatastore()->build_options();
build_all_styles(0, 0, '', false, false);
vB_Cache::resetCache();
vB::getDatastore()->resetCache();
$dijo('listo');
