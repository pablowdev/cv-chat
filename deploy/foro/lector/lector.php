<?php
// Lector del foro para CV Chat (tools/puente/foro-lector.js): solo lee, y solo lo publico del foro
// (lo que ve un visitante sin cuenta, dentro de "Foro"). Corre en su propio contenedor, con un usuario
// de la base que solo puede leer las tablas de los temas, las direcciones de los foros y el nombre, los
// mensajes y la fecha de alta de cada usuario (no los emails ni las contraseñas). CV Chat le
// llega por la red foro-lector; el foro no tiene como llegar a CV Chat.
//
//  GET /novedades?desde=<nodeid>&limite=<n>  temas y respuestas nuevos
//  GET /ultimo                               el ultimo nodeid (para empezar sin publicar lo viejo)
//  GET /tema?id=<nodeid>                     un tema o respuesta (para la vista previa de un enlace)
//  GET /buscar?q=<texto>                     temas que lo mencionan
//  GET /canal?ruta=<forum/...>               un foro (o la portada, con ruta vacia): nombre, cuentas y el ultimo tema
//  GET /miembro?id=<userid>                  nombre, foto, mensajes y desde cuando (lo que se ve al lado de cada mensaje)
//  GET /vivo                                 el ultimo tema o respuesta publico (el foro se actualiza solo cuando cambia)
//
// Pide la cabecera X-Lector-Clave (LECTOR_CLAVE).

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$clave = (string) getenv('LECTOR_CLAVE');
if (strlen($clave) < 32 || !hash_equals($clave, (string) ($_SERVER['HTTP_X_LECTOR_CLAVE'] ?? ''))) { http_response_code(403); echo '{"error":"no"}'; exit; }

const FORO = 2;                                   // el canal "Foro" (no blogs, grupos ni mensajes privados)
const TIPOS = '22,24,25,26,28';                   // texto, encuesta, galeria, video, enlace
$base = rtrim((string) getenv('FORO_URL'), '/');

try {
	$db = new PDO('mysql:host=' . getenv('DB_HOST') . ';dbname=' . getenv('DB_NAME') . ';charset=utf8mb4', getenv('DB_USER'), getenv('DB_PASS'),
		[PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
} catch (Throwable $e) { http_response_code(503); echo '{"error":"base"}'; exit; }

function salir($x) { echo json_encode($x, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
$texto = function ($s) { return html_entity_decode((string) $s, ENT_QUOTES, 'UTF-8'); };

// El texto sin BBCode, sin las citas, en un renglon, cortado
function resumen($raw, $max = 280)
{
	$s = (string) $raw;
	for ($i = 0; $i < 5 && preg_match('#\[quote[^\]]*\].*?\[/quote\]#is', $s); $i++) $s = preg_replace('#\[quote[^\]]*\](?:(?!\[quote).)*?\[/quote\]#is', ' ', $s);
	$s = preg_replace('#\[(img|video|attach)[^\]]*\].*?\[/\1\]#is', ' ', $s);
	$s = preg_replace('#\[url=([^\]]*)\](.*?)\[/url\]#is', '$2', $s);
	$s = preg_replace('#\[/?[a-z*]+(?:=[^\]]*)?\]#i', '', $s);
	$s = html_entity_decode($s, ENT_QUOTES, 'UTF-8');
	$s = trim(preg_replace('/\s+/u', ' ', $s));
	return mb_strlen($s) > $max ? rtrim(mb_substr($s, 0, $max - 1)) . '…' : $s;
}

// ¿Lo ve un visitante sin cuenta? (el permiso del canal mas cercano que tenga uno para invitados)
$visible = [];
function publico($canal)
{
	global $db, $visible;
	if (!isset($visible[$canal])) {
		$q = $db->prepare('SELECT p.forumpermissions FROM closure c JOIN permission p ON p.nodeid = c.parent AND p.groupid = 1 WHERE c.child = ? ORDER BY c.depth LIMIT 1');
		$q->execute([$canal]);
		$fp = $q->fetchColumn();
		$visible[$canal] = $fp !== false && (((int) $fp) & 3) === 3;
	}
	return $visible[$canal];
}
function foto($userid)
{
	global $db, $base;
	static $q = null;
	if (!$q) $q = $db->prepare('SELECT dateline FROM customavatar WHERE userid = ? AND visible = 1');
	$q->execute([(int) $userid]);
	$d = $q->fetchColumn();
	return $d ? $base . '/image.php?userid=' . (int) $userid . '&dateline=' . (int) $d : null;
}
$sql = 'SELECT n.nodeid, n.starter, n.userid, n.authorname, n.publishdate, n.title, n.textcount, n.lastcontent, s.title AS tema, s.parentid AS canal, ch.title AS canal_nombre, t.rawtext
	FROM node n JOIN closure f ON f.child = n.nodeid AND f.parent = ' . FORO . '
	JOIN node s ON s.nodeid = n.starter JOIN node ch ON ch.nodeid = s.parentid LEFT JOIN text t ON t.nodeid = n.nodeid
	WHERE n.contenttypeid IN (' . TIPOS . ') AND n.protected = 0 AND n.showpublished = 1 AND n.showapproved = 1 AND n.approved = 1
	  AND n.starter > 0 AND s.showpublished = 1 AND s.showapproved = 1 AND s.protected = 0';
$armar = function ($r) use ($texto, $base) {
	return [
		'id' => (int) $r['nodeid'], 'tema_id' => (int) $r['starter'], 'es_tema' => (int) $r['nodeid'] === (int) $r['starter'],
		'tema' => $texto($r['tema']), 'canal' => $texto($r['canal_nombre']),
		'autor' => $texto($r['authorname']), 'autor_id' => (int) $r['userid'], 'foto' => foto($r['userid']),
		'fecha' => (int) $r['publishdate'] * 1000, 'texto' => resumen($r['rawtext']),
		'respuestas' => (int) $r['nodeid'] === (int) $r['starter'] ? (int) $r['textcount'] : null,
		'url' => $base . '/node/' . (int) $r['nodeid'],
	];
};
$ruta = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($ruta === '/ultimo') {
	salir(['ultimo' => (int) $db->query('SELECT MAX(nodeid) FROM node')->fetchColumn()]);
}

if ($ruta === '/vivo') {
	salir(['ultimo' => (int) $db->query('SELECT MAX(n.nodeid) FROM node n JOIN closure f ON f.child = n.nodeid AND f.parent = ' . FORO . '
		WHERE n.contenttypeid IN (' . TIPOS . ') AND n.protected = 0 AND n.showpublished = 1 AND n.approved = 1')->fetchColumn()]);
}

if ($ruta === '/novedades') {
	$desde = max(0, (int) ($_GET['desde'] ?? 0));
	$limite = min(100, max(1, (int) ($_GET['limite'] ?? 30)));
	$q = $db->prepare($sql . ' AND n.nodeid > ? ORDER BY n.nodeid LIMIT ' . $limite);
	$q->execute([$desde]);
	$out = []; $hasta = $desde;
	foreach ($q->fetchAll() as $r) { $hasta = max($hasta, (int) $r['nodeid']); if (publico((int) $r['canal'])) $out[] = $armar($r); }
	salir(['novedades' => $out, 'hasta' => $hasta]);
}

if ($ruta === '/tema') {
	$q = $db->prepare($sql . ' AND n.nodeid = ?');
	$q->execute([(int) ($_GET['id'] ?? 0)]);
	$r = $q->fetch();
	if (!$r || !publico((int) $r['canal'])) { http_response_code(404); salir(['error' => 'no esta']); }
	$x = $armar($r);
	if (!$x['es_tema']) {
		$s = $db->prepare('SELECT textcount FROM node WHERE nodeid = ?'); $s->execute([$x['tema_id']]); $x['respuestas'] = (int) $s->fetchColumn();
	}
	salir(['tema' => $x]);
}

if ($ruta === '/buscar') {
	$t = trim((string) ($_GET['q'] ?? ''));
	if (mb_strlen($t) < 2) salir(['resultados' => []]);
	$like = '%' . addcslashes($t, '%_\\') . '%';
	// Los temas cuyo titulo o algun mensaje lo menciona; primero los del titulo, despues los mas nuevos
	$q = $db->prepare('SELECT n.starter AS id, MAX(n.title LIKE ?) AS en_titulo, MAX(n.nodeid) AS ultimo
		FROM node n JOIN closure f ON f.child = n.nodeid AND f.parent = ' . FORO . ' LEFT JOIN text t ON t.nodeid = n.nodeid
		WHERE n.contenttypeid IN (' . TIPOS . ') AND n.protected = 0 AND n.showpublished = 1 AND n.showapproved = 1 AND n.approved = 1 AND n.starter > 0
		  AND (n.title LIKE ? OR t.rawtext LIKE ?)
		GROUP BY n.starter ORDER BY en_titulo DESC, ultimo DESC LIMIT 40');
	$q->execute([$like, $like, $like]);
	$out = [];
	$uno = $db->prepare($sql . ' AND n.nodeid = ?');
	foreach ($q->fetchAll() as $r) {
		$uno->execute([(int) $r['id']]);
		$x = $uno->fetch();
		if ($x && publico((int) $x['canal'])) $out[] = $armar($x);
		if (count($out) >= 12) break;
	}
	salir(['resultados' => $out]);
}

if ($ruta === '/canal') {
	// La portada ("" o "forum") es el canal Foro entero; si no, el foro de esa direccion
	$r = trim((string) ($_GET['ruta'] ?? ''), '/');
	if ($r === '' || $r === 'forum') $id = FORO;
	else {
		$q = $db->prepare("SELECT contentid FROM routenew WHERE prefix = ? AND class = 'vB5_Route_Channel' LIMIT 1");
		$q->execute([$r]);
		$id = (int) $q->fetchColumn();
	}
	$q = $db->prepare('SELECT n.nodeid, n.title, n.description, n.textcount, n.totalcount, n.lastcontentid FROM node n JOIN closure f ON f.child = n.nodeid AND f.parent = ' . FORO . ' WHERE n.nodeid = ?');
	$q->execute([$id]);
	$c = $q->fetch();
	if (!$c || !publico((int) $c['nodeid'])) { http_response_code(404); salir(['error' => 'no esta']); }
	// Los temas y mensajes de todo lo que tiene adentro (las cuentas del canal son solo de su primer nivel)
	$t = $db->prepare('SELECT COUNT(*) AS temas, COALESCE(SUM(n.textcount), 0) AS respuestas FROM node n JOIN closure f ON f.child = n.nodeid AND f.parent = ?
		WHERE n.contenttypeid IN (' . TIPOS . ') AND n.starter = n.nodeid AND n.protected = 0 AND n.showpublished = 1 AND n.showapproved = 1');
	$t->execute([(int) $c['nodeid']]);
	$k = $t->fetch();
	$ult = null;
	$u = $db->prepare($sql . ' AND n.nodeid = n.starter AND n.nodeid IN (SELECT f.child FROM closure f WHERE f.parent = ?) ORDER BY n.lastcontent DESC LIMIT 1');
	$u->execute([(int) $c['nodeid']]);
	if (($x = $u->fetch()) && publico((int) $x['canal'])) $ult = $armar($x);
	salir(['canal' => [
		'id' => (int) $c['nodeid'], 'portada' => (int) $c['nodeid'] === FORO, 'nombre' => $texto($c['title']), 'descripcion' => resumen($c['description'], 200),
		'temas' => (int) $k['temas'], 'mensajes' => (int) $k['temas'] + (int) $k['respuestas'], 'ultimo' => $ult,
	]]);
}

if ($ruta === '/miembro') {
	$q = $db->prepare('SELECT userid, username, posts, joindate FROM user WHERE userid = ?');
	$q->execute([(int) ($_GET['id'] ?? 0)]);
	$m = $q->fetch();
	if (!$m) { http_response_code(404); salir(['error' => 'no esta']); }
	salir(['miembro' => ['id' => (int) $m['userid'], 'nombre' => $texto($m['username']), 'foto' => foto($m['userid']),
		'mensajes' => (int) $m['posts'], 'desde' => (int) $m['joindate'] * 1000]]);
}

http_response_code(404);
salir(['error' => 'no esta']);
