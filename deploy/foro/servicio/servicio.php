<?php
// Servicio del foro para CV Chat (tools/puente/foro-servicio.js): lo que CV Chat necesita hacer en el foro
// con el codigo del propio vBulletin. Corre en su propio contenedor (la misma imagen del foro, el codigo de
// solo lectura); CV Chat le llega por la red foro-lector y el foro no tiene como llegar a CV Chat.
// Cada pedido lleva X-Servicio-Clave (SERVICIO_CLAVE).
//
//  GET  /usuarios?ids=1,2           nombre, nombre visible y fecha del avatar de esas cuentas
//  POST /avatar   {id, imagen}      pone ese avatar (imagen en base64) a la cuenta
//  POST /nombre   {id, nombre}      pone el nombre visible
//  GET  /avisos?desde=&ids=         notificaciones nuevas del foro de esas cuentas
//  GET  /tejemanejes?desde=         los avisos de compra/venta (tema, texto entero, fotos)
//  POST /tema     {id, titulo, texto}            publica un tema en compra/venta como esa cuenta
//  POST /editar   {nodo, id, titulo, texto}      lo cambia (solo temas propios de compra/venta)
//  GET  /privados?id=               los mensajes privados de esa cuenta (para leerlos en CV Chat)
//  POST /privado  {id, para, texto, conversacion}  manda un privado como esa cuenta: sigue esa conversacion
//                                   (si es suya) o empieza una con esas cuentas (para: [ids])
//  GET  /privados-nuevos?desde=&ids=  los privados que les llegaron a esas cuentas desde esa fecha (ms)

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$clave = (string) getenv('SERVICIO_CLAVE');
if (strlen($clave) < 32 || !hash_equals($clave, (string) ($_SERVER['HTTP_X_SERVICIO_CLAVE'] ?? ''))) { http_response_code(403); echo '{"error":"no"}'; exit; }

const TEJEMANEJES = 3323;   // la seccion compra/venta del foro
function salir($x, $codigo = 200) { http_response_code($codigo); echo json_encode($x, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function texto($s) { return html_entity_decode((string) $s, ENT_QUOTES, 'UTF-8'); }
$cuerpo = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$ruta = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// vBulletin, como lo arranca el foro
$base = rtrim((string) getenv('FORO_URL'), '/');
$_SERVER['HTTP_HOST'] = parse_url($base, PHP_URL_HOST); $_SERVER['SERVER_NAME'] = $_SERVER['HTTP_HOST'];
$_SERVER['HTTPS'] = 'on'; $_SERVER['SERVER_PORT'] = 443; $_SERVER['REMOTE_ADDR'] = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
chdir('/var/www/html');
require_once('/var/www/html/includes/vb5/autoloader.php');
vB5_Autoloader::register('/var/www/html');
vB5_Frontend_Application::init('/var/www/html');
$api = Api_InterfaceAbstract::instance();
$api->callApi('user', 'fetchUserinfo', ['userid' => 1]); // carga el nucleo
$db = vB::getDbAssertor();

// Hacer algo como una cuenta (publicar un tema): una sesion de esa cuenta, sin cookies
function como($id)
{
	$s = vB::getRequest()->createSessionForUser((int) $id);
	vB::setCurrentSession($s);
	return $s;
}
function foto($id)
{
	global $db, $base;
	$r = $db->getRow('customavatar', ['userid' => (int) $id]);
	return $r && $r['visible'] ? ['url' => $base . '/image.php?userid=' . (int) $id . '&dateline=' . (int) $r['dateline'], 'fecha' => (int) $r['dateline']] : null;
}
function ids($s) { return array_values(array_filter(array_map('intval', explode(',', (string) $s)))); }
// El texto para el foro: lo que viene de CV Chat (Markdown simple) en BBCode
function bbcode($t)
{
	$t = str_replace(["\r\n", "\r"], "\n", (string) $t);
	$t = preg_replace('/\*\*([^*\n]+)\*\*/', '[B]$1[/B]', $t);
	$t = preg_replace('/(^|[^*])\*([^*\n]+)\*(?!\*)/', '$1[I]$2[/I]', $t);
	return $t;
}
// Las fotos de un tema (adjuntos del tema y sus fotos sueltas)
function fotosDe($nodo)
{
	global $db, $base;
	$out = [];
	foreach ((array) $db->getRows('vBForum:node', ['parentid' => (int) $nodo, 'contenttypeid' => [15, 16]]) as $h) {
		$out[] = $base . '/filedata/fetch?id=' . (int) $h['nodeid'];
	}
	return $out;
}

try {

if ($ruta === '/usuarios') {
	$out = [];
	foreach (ids($_GET['ids'] ?? '') as $id) {
		$u = $db->getRow('user', ['userid' => $id]);
		if (!$u) continue;
		$f = foto($id);
		$out[] = ['id' => $id, 'usuario' => texto($u['username']), 'nombre' => texto($u['displayname'] ?: $u['username']), 'foto' => $f ? $f['url'] : null, 'foto_fecha' => $f ? $f['fecha'] : 0];
	}
	salir(['usuarios' => $out]);
}

if ($ruta === '/avatar' && $_SERVER['REQUEST_METHOD'] === 'POST') {
	$id = (int) ($cuerpo['id'] ?? 0);
	$bin = base64_decode((string) ($cuerpo['imagen'] ?? ''), true);
	if (!$id || !$bin || strlen($bin) > 6 * 1024 * 1024) salir(['error' => 'datos'], 400);
	// vBulletin reconoce la foto por la extension del archivo
	$tipo = (new finfo(FILEINFO_MIME_TYPE))->buffer($bin);
	$ext = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/gif' => 'gif', 'image/webp' => 'webp'][$tipo] ?? null;
	if (!$ext) salir(['error' => 'no es una foto'], 400);
	$tmp = sys_get_temp_dir() . '/cvav' . bin2hex(random_bytes(6)) . '.' . $ext;
	file_put_contents($tmp, $bin);
	como(1);
	// Con el nombre original (como el formulario del foro): la copia interna no tiene extension
	vB_Library::instance('user')->uploadAvatar($tmp, ['org_file_info' => pathinfo($tmp)], $id, true);
	@unlink($tmp);
	$f = foto($id);
	salir(['ok' => true, 'foto' => $f ? $f['url'] : null, 'foto_fecha' => $f ? $f['fecha'] : 0]);
}

if ($ruta === '/nombre' && $_SERVER['REQUEST_METHOD'] === 'POST') {
	$id = (int) ($cuerpo['id'] ?? 0);
	$nombre = trim((string) ($cuerpo['nombre'] ?? ''));
	if (!$id || $nombre === '' || mb_strlen($nombre) > 50) salir(['error' => 'datos'], 400);
	$db->update('user', ['displayname' => htmlspecialchars($nombre, ENT_QUOTES, 'UTF-8')], ['userid' => $id]);
	vB_Library::instance('user')->clearUserInfo([$id]);
	salir(['ok' => true]);
}

if ($ruta === '/avisos') {
	$desde = max(0, (int) ($_GET['desde'] ?? 0));
	$quienes = ids($_GET['ids'] ?? '');
	if (!$quienes) {
		// Sin cuentas: solo hasta donde hay (para empezar desde ahora)
		$ult = $db->getRow('vBForum:notification', [vB_dB_Query::COLUMNS_KEY => ['notificationid']], ['field' => 'notificationid', 'direction' => vB_dB_Query::SORT_DESC]);
		salir(['avisos' => [], 'hasta' => $ult ? (int) $ult['notificationid'] : $desde]);
	}
	$filas = (array) $db->getRows('vBForum:notification', [vB_dB_Query::CONDITIONS_KEY => [
		['field' => 'notificationid', 'value' => $desde, 'operator' => vB_dB_Query::OPERATOR_GT],
		['field' => 'recipient', 'value' => $quienes],
		['field' => 'typeid', 'value' => [1, 2, 3, 4, 5, 6, 8, 9]],
	]], ['field' => 'notificationid', 'direction' => vB_dB_Query::SORT_ASC], false, 100);
	$TIPO = [1 => 'te mencionó', 2 => 'te citó', 3 => 'respondió tu tema', 4 => 'escribió en un tema que seguís', 5 => 'comentó tu respuesta', 6 => 'comentó en tu tema', 8 => 'le gustó lo que escribiste', 9 => 'te dejó un mensaje en tu perfil'];
	$out = []; $hasta = $desde;
	foreach ($filas as $n) {
		$hasta = max($hasta, (int) $n['notificationid']);
		$nodo = $n['sentbynodeid'] ? $db->getRow('vBForum:node', ['nodeid' => (int) $n['sentbynodeid']]) : null;
		$tema = $nodo && $nodo['starter'] ? $db->getRow('vBForum:node', ['nodeid' => (int) $nodo['starter']]) : null;
		$de = $n['sender'] ? $db->getRow('user', ['userid' => (int) $n['sender']]) : null;
		$t = $db->getRow('vBForum:text', ['nodeid' => (int) $n['sentbynodeid']]);
		$out[] = ['id' => (int) $n['notificationid'], 'para' => (int) $n['recipient'], 'de' => $de ? texto($de['displayname'] ?: $de['username']) : 'Alguien',
			'que' => $TIPO[(int) $n['typeid']] ?? 'te avisó', 'tema' => $tema ? texto($tema['title']) : null,
			'texto' => $t ? mb_substr(trim(preg_replace('/\s+/u', ' ', preg_replace('#\[/?[a-z*]+(?:=[^\]]*)?\]#i', '', texto($t['rawtext'])))), 0, 160) : null,
			'url' => $n['sentbynodeid'] ? $base . '/node/' . (int) $n['sentbynodeid'] : $base . '/'];
	}
	salir(['avisos' => $out, 'hasta' => $hasta]);
}

if ($ruta === '/tejemanejes') {
	$desde = max(0, (int) ($_GET['desde'] ?? 0));
	$filas = (array) $db->getRows('vBForum:node', [vB_dB_Query::CONDITIONS_KEY => [
		['field' => 'parentid', 'value' => TEJEMANEJES], ['field' => 'nodeid', 'value' => $desde, 'operator' => vB_dB_Query::OPERATOR_GT],
		['field' => 'contenttypeid', 'value' => [22, 25, 28, 26]], ['field' => 'showpublished', 'value' => 1], ['field' => 'approved', 'value' => 1],
	]], ['field' => 'nodeid', 'direction' => vB_dB_Query::SORT_ASC], false, 200);
	$out = [];
	foreach ($filas as $n) {
		if ((int) $n['nodeid'] !== (int) $n['starter']) continue;
		$t = $db->getRow('vBForum:text', ['nodeid' => (int) $n['nodeid']]);
		$out[] = ['nodo' => (int) $n['nodeid'], 'id' => (int) $n['userid'], 'autor' => texto($n['authorname']), 'titulo' => texto($n['title']),
			'texto' => $t ? texto($t['rawtext']) : '', 'fecha' => (int) $n['publishdate'] * 1000, 'editado' => (int) $n['lastupdate'] * 1000,
			'fotos' => fotosDe($n['nodeid']), 'url' => $base . '/node/' . (int) $n['nodeid']];
	}
	salir(['temas' => $out]);
}

if (($ruta === '/tema' || $ruta === '/editar') && $_SERVER['REQUEST_METHOD'] === 'POST') {
	$id = (int) ($cuerpo['id'] ?? 0);
	$titulo = trim((string) ($cuerpo['titulo'] ?? ''));
	$txt = bbcode($cuerpo['texto'] ?? '');
	if (!$id || $titulo === '' || trim($txt) === '') salir(['error' => 'datos'], 400);
	como($id);
	if ($ruta === '/tema') {
		$r = $api->callApi('content_text', 'add', [['parentid' => TEJEMANEJES, 'title' => $titulo, 'rawtext' => $txt], ['nl2br' => true]]);
	} else {
		$nodo = (int) ($cuerpo['nodo'] ?? 0);
		// Solo los temas propios de compra/venta
		$n = $db->getRow('vBForum:node', ['nodeid' => $nodo]);
		if (!$n || (int) $n['userid'] !== $id || (int) $n['parentid'] !== TEJEMANEJES) salir(['error' => 'no es suyo'], 403);
		vB_Library::instance('content_text')->update($nodo, ['title' => $titulo, 'rawtext' => $txt]);
		$r = $nodo;
	}
	if (is_array($r) && isset($r['errors'])) salir(['error' => json_encode($r['errors'])], 400);
	salir(['ok' => true, 'nodo' => (int) $r, 'url' => $base . '/node/' . (int) $r]);
}

if ($ruta === '/privados') {
	$id = (int) ($_GET['id'] ?? 0);
	if (!$id) salir(['error' => 'datos'], 400);
	// Los mensajes (no las notificaciones) que esa cuenta mando o recibio, con quien
	$mios = (array) $db->getRows('vBForum:sentto', ['userid' => $id]);
	$nodos = array_values(array_unique(array_map(function ($r) { return (int) $r['nodeid']; }, $mios)));
	$out = [];
	foreach (array_chunk($nodos, 200) as $grupo) {
		foreach ((array) $db->getRows('vBForum:privatemessage', ['nodeid' => $grupo, 'msgtype' => 'message']) as $pm) {
			$n = $db->getRow('vBForum:node', ['nodeid' => (int) $pm['nodeid']]);
			if (!$n) continue;
			$t = $db->getRow('vBForum:text', ['nodeid' => (int) $pm['nodeid']]);
			$para = array_values(array_filter(array_map(function ($r) { return (int) $r['userid']; }, (array) $db->getRows('vBForum:sentto', ['nodeid' => (int) $pm['nodeid']])), function ($u) use ($n) { return $u !== (int) $n['userid']; }));
			$out[] = ['nodo' => (int) $pm['nodeid'], 'conversacion' => (int) $n['starter'], 'de' => (int) $n['userid'], 'de_nombre' => texto($n['authorname']),
				'para' => $para, 'titulo' => texto($n['title'] ?? ''), 'texto' => $t ? texto($t['rawtext']) : '', 'fecha' => (int) $n['publishdate'] * 1000];
		}
	}
	usort($out, function ($a, $b) { return $a['fecha'] <=> $b['fecha']; });
	// Los nombres de con quienes hablo
	$gente = [];
	foreach ($out as $m) foreach (array_merge([$m['de']], $m['para']) as $u) $gente[$u] = true;
	$nombres = [];
	foreach (array_keys($gente) as $u) { $x = $db->getRow('user', ['userid' => $u]); if ($x) $nombres[$u] = texto($x['displayname'] ?: $x['username']); }
	salir(['mensajes' => $out, 'nombres' => $nombres]);
}

if ($ruta === '/privado' && $_SERVER['REQUEST_METHOD'] === 'POST') {
	$id = (int) ($cuerpo['id'] ?? 0);
	$conv = (int) ($cuerpo['conversacion'] ?? 0);
	$para = array_values(array_filter(array_map('intval', (array) ($cuerpo['para'] ?? []))));
	$txt = bbcode($cuerpo['texto'] ?? '');
	if (!$id || trim($txt) === '' || (!$conv && !$para)) salir(['error' => 'datos'], 400);
	$data = ['rawtext' => $txt];
	if ($conv) {
		// Solo una conversacion de esa cuenta
		$n = $db->getRow('vBForum:node', ['nodeid' => $conv]);
		if (!$n || (int) $n['starter'] !== $conv || !$db->getRow('vBForum:sentto', ['nodeid' => $conv, 'userid' => $id])) salir(['error' => 'no es suya'], 403);
		$data['parentid'] = $conv;
		$data['respondto'] = $conv;
	} else {
		$nombres = [];
		foreach ($para as $u) { $x = $db->getRow('user', ['userid' => $u]); if (!$x) salir(['error' => 'no esta'], 404); $nombres[] = $x['username']; }
		$data['msgRecipients'] = implode(';', $nombres);
		$data['title'] = trim((string) ($cuerpo['titulo'] ?? '')) ?: 'Mensaje';
	}
	como($id);
	$r = $api->callApi('content_privatemessage', 'add', [$data, ['nl2br' => true]]);
	if (is_array($r) && isset($r['errors'])) salir(['error' => json_encode($r['errors'])], 400);
	salir(['ok' => true, 'nodo' => (int) $r]);
}

if ($ruta === '/privados-nuevos') {
	$desde = (int) floor(((int) ($_GET['desde'] ?? 0)) / 1000);
	$ids = ids($_GET['ids'] ?? '');
	if (!$ids) salir(['mensajes' => [], 'hasta' => time() * 1000]);
	$hasta = time();
	$tipo = (int) vB_Types::instance()->getContentTypeID('vBForum_PrivateMessage');
	$out = [];
	$nuevos = (array) $db->getRows('vBForum:node', [vB_dB_Query::CONDITIONS_KEY => [
		['field' => 'contenttypeid', 'value' => $tipo],
		['field' => 'publishdate', 'value' => $desde, 'operator' => vB_dB_Query::OPERATOR_GT],
		['field' => 'publishdate', 'value' => $hasta, 'operator' => vB_dB_Query::OPERATOR_LTE],
	]]);
	foreach (array_slice($nuevos, 0, 300) as $n) {
		$pm = $db->getRow('vBForum:privatemessage', ['nodeid' => (int) $n['nodeid']]);
		if (!$pm || $pm['msgtype'] !== 'message') continue;
		$t = $db->getRow('vBForum:text', ['nodeid' => (int) $n['nodeid']]);
		foreach ((array) $db->getRows('vBForum:sentto', ['nodeid' => (int) $n['nodeid']]) as $r) {
			$u = (int) $r['userid'];
			if ($u === (int) $n['userid'] || !in_array($u, $ids, true)) continue;
			$out[] = ['para' => $u, 'de' => (int) $n['userid'], 'de_nombre' => texto($n['authorname']), 'texto' => $t ? texto($t['rawtext']) : '', 'nodo' => (int) $n['nodeid']];
		}
	}
	salir(['mensajes' => $out, 'hasta' => $hasta * 1000]);
}

salir(['error' => 'no esta'], 404);

} catch (Throwable $e) {
	error_log('servicio del foro: ' . $e->getMessage());
	salir(['error' => $e->getMessage()], 500);
}
