<?php
// La puerta de iniciar sesion y recuperar la contraseña del foro (el .htaccess del foro manda aca esas
// direcciones, ver htaccess-puerta.txt). Una cuenta del foro unida a CV Chat es la misma cuenta de todo el
// sistema: si tiene la verificacion en dos pasos, entra solo por CV Chat (cvchat.php), que pide el codigo; la
// contraseña del foro ya no le sirve para entrar, ni se recupera aca. Las demas siguen como siempre (y asi
// se pueden unir). La lista la deja el servicio del foro (servicio.php, /unidas).
// Lo demas sigue de largo al foro (index.php), igual que antes.

$cv_ruta = trim((string) ($_GET['routestring'] ?? ''), '/');

function cv_unidas()
{
	$d = @json_decode((string) @file_get_contents(__DIR__ . '/cache/.cv_unidas.json'), true);
	return is_array($d) ? $d : null;
}
function cv_es_unida($d)
{
	$ids = array_flip(array_map('intval', (array) ($d['ids'] ?? [])));
	$claves = array_flip((array) ($d['claves'] ?? []));
	$id = (int) ($_POST['userid'] ?? $_GET['userid'] ?? 0);
	if ($id && isset($ids[$id])) return true;
	foreach (['username', 'email'] as $campo)
	{
		$x = trim((string) ($_POST[$campo] ?? ''));
		if ($x === '') continue;
		foreach ([$x, htmlspecialchars($x, ENT_QUOTES, 'UTF-8')] as $y)
			if (isset($claves[hash('sha256', mb_strtolower($y, 'UTF-8'))])) return true;
	}
	return false;
}

$cv_d = cv_unidas();
if ($cv_d && cv_es_unida($cv_d))
{
	$chat = rtrim((string) getenv('CV_CHAT_URL'), '/');
	$msg = 'Esta cuenta del foro está unida a tu cuenta de Círculo Vicioso, que tiene la verificación en dos pasos: se entra por CV Chat (te pide el código) y la contraseña se recupera desde ahí.';
	header('Cache-Control: no-store');
	if ($cv_ruta === 'auth/ajax-login' || $cv_ruta === 'auth/login-external' || $cv_ruta === 'auth/login-and-associate')
	{
		http_response_code(403);
		header('Content-Type: application/json; charset=utf-8');
		echo json_encode(['errors' => [[$msg]], 'cvchat' => $chat . '/'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}
	http_response_code(403);
	header('Content-Type: text/html; charset=utf-8');
	echo '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Círculo Vicioso</title>'
		. '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1e1f1f;color:#c9c7c6;font:15px/1.5 Arial,Helvetica,sans-serif;padding:16px}'
		. '.c{max-width:440px;background:#2b2d2c;border:1px solid #3a3c3b;border-radius:10px;padding:24px}a{display:inline-block;margin-top:12px;padding:9px 16px;border-radius:6px;background:#ee2d6f;color:#fff;font-weight:700;text-decoration:none}</style></head>'
		. '<body><div class="c"><p>' . htmlspecialchars($msg, ENT_QUOTES, 'UTF-8') . '</p><a href="' . htmlspecialchars($chat . '/', ENT_QUOTES, 'UTF-8') . '">Ir a CV Chat</a></div></body></html>';
	exit;
}

// Como siempre
require __DIR__ . '/index.php';
