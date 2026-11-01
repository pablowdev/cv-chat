<?php
// Puente con CV Chat (tools/puente/foro.js y cuenta.js). Tres usos:
//
// 1. "Entrar con el foro" y vincular la cuenta: CV Chat manda aca con
//    ?estado=&para=&cuenta=&firma= (firmado por CV Chat). Si no hay sesion en el
//    foro, se inicia aca mismo con el inicio de sesion del foro (/auth/ajax-login).
//    Despues se pregunta si se quiere seguir, y se vuelve a CV Chat con quien es
//    (id, usuario, email, grupos, foto), firmado. Con &auto=1 (cuenta unica: quien
//    ya entro al foro entra tambien a CV Chat) no se pregunta ni se pide nada.
// 2. Cuenta unica (?sso=&s=): con la sesion de CV Chat se entra al foro con la
//    cuenta del foro unida. Si no hay una, se une la del mismo email (confirmado en
//    los dos lados) o se pregunta: entrar con la que ya tiene (las une) o crear una
//    nueva con el mismo usuario. Cada pedido sirve una sola vez.
// 3. Salir (?salir=1&volver=&t=&firma=): cierra la sesion del foro y vuelve.
// 4. Panel (?panel=&s=): CV Chat ya pidio la contraseña y el codigo de CV Chat
//    (/puente/foro/panel): se entra al foro con la cuenta unida y se abre el panel de
//    administracion (la sesion del panel de vBulletin), si esa cuenta es administradora.
//    El pedido vence a los 2 minutos y sirve una sola vez.
//
// La clave (CV_PUENTE_SECRETO) y la direccion de CV Chat (CV_CHAT_URL) llegan
// como variables de entorno del contenedor (puente.env); las vueltas son siempre
// a CV Chat o a las paginas propias (el foro y la web del mismo dominio).

$secret = (string) getenv('CV_PUENTE_SECRETO');
$chat = rtrim((string) getenv('CV_CHAT_URL'), '/');

header('Cache-Control: no-store');
// Solo adentro de las paginas propias del foro o de CV Chat (el foro adentro del chat), nunca de otra
header("Content-Security-Policy: frame-ancestors 'self'" . ($chat ? ' ' . $chat : ''));
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');

function cv_e($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function cv_texto($s) { return html_entity_decode((string) $s, ENT_QUOTES, 'UTF-8'); }
function cv_b64($s) { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function cv_firmar($datos) { global $secret; return hash_hmac('sha256', $datos, $secret); }
function cv_ir($url) { header('Location: ' . $url, true, 303); exit; }

function cv_pagina($titulo, $cuerpo)
{
	header('Content-Type: text/html; charset=utf-8');
	echo '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
		. '<meta name="robots" content="noindex"><title>' . cv_e($titulo) . ' · Foro de Círculo Vicioso</title><style>'
		. ':root{color-scheme:dark}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;'
		. 'background:#121214;color:#f2f3f5;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
		. '.card{width:100%;max-width:420px;background:#1e1f22;border:1px solid #2e3035;border-radius:14px;padding:28px 24px}'
		. 'h1{font-size:1.3rem;margin:0 0 6px}h2{font-size:1.05rem;margin:18px 0 8px}p{margin:0 0 16px;color:#b5bac1}.chico{font-size:.875rem;color:#949ba4}'
		. '.perfil{display:flex;align-items:center;gap:14px;margin:0 0 18px;padding:12px;border-radius:10px;background:#2b2d31}'
		. '.perfil img{width:56px;height:56px;border-radius:50%;object-fit:cover;background:#3f4147}.perfil b{font-size:1.1rem}'
		. 'label{display:block;font-size:.8rem;font-weight:700;text-transform:uppercase;color:#b5bac1;margin:0 0 12px}'
		. 'input{display:block;width:100%;margin-top:6px;padding:11px 12px;border-radius:8px;border:1px solid #3f4147;background:#121214;color:#f2f3f5;font:inherit}'
		. 'button,.btn{display:block;width:100%;border:0;border-radius:8px;padding:12px 16px;font:inherit;font-weight:600;cursor:pointer;'
		. 'background:#7c3aed;color:#fff;text-align:center;text-decoration:none;margin:0 0 10px}'
		. 'button.sec,.btn.sec{background:transparent;color:#f2f3f5;border:1px solid #4e5058}button:disabled{opacity:.6;cursor:wait}'
		. '.error{background:#3a1a1e;color:#ffaab1;padding:10px 12px;border-radius:8px;margin:0 0 14px}a{color:#00a8fc}'
		. '</style></head><body><main class="card">' . $cuerpo . '</main></body></html>';
	exit;
}

// El inicio de sesion del foro (el mismo de vBulletin, por /auth/ajax-login): al entrar, recarga
function cv_form_entrar($token, $base, $abajo)
{
	return '<div class="error" id="error" hidden></div>'
		. '<form id="entrar"><label>Usuario<input name="username" autocomplete="username" required></label>'
		. '<label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>'
		. '<label id="codigo" hidden>Código de verificación<input name="mfa_authcode" inputmode="numeric" autocomplete="one-time-code"></label>'
		. '<input type="hidden" name="securitytoken" value="' . cv_e($token) . '"><input type="hidden" name="rememberme" value="1">'
		. '<button type="submit">Iniciar sesión</button></form>' . $abajo
		. '<p class="chico"><a href="' . cv_e($base) . '/lostpw" target="_blank" rel="noopener">¿Olvidaste tu contraseña del foro?</a></p>'
		. '<script>(function(){var f=document.getElementById("entrar"),e=document.getElementById("error");'
		. 'f.addEventListener("submit",function(ev){ev.preventDefault();var b=f.querySelector("button");b.disabled=true;e.hidden=true;'
		. 'fetch(' . json_encode($base . '/auth/ajax-login') . ',{method:"POST",credentials:"same-origin",body:new URLSearchParams(new FormData(f))})'
		. '.then(function(r){return r.json()}).then(function(d){if(d&&d.success){location.reload();return}'
		. 'var t=d&&d.errors&&d.errors[0];t=String(Array.isArray(t)?t[0]:t||"");b.disabled=false;f.password.value="";'
		. 'if(/mfa/i.test(t)){document.getElementById("codigo").hidden=false;e.textContent="Escribí el código de verificación de tu cuenta.";}'
		. 'else if(t==="strikes"){e.textContent="Hubo demasiados intentos. Esperá 15 minutos y probá de nuevo.";}'
		. 'else{e.textContent="El usuario o la contraseña no son correctos.";}e.hidden=false;})'
		. '.catch(function(){b.disabled=false;e.textContent="No se pudo iniciar sesión. Probá de nuevo.";e.hidden=false;});});})();</script>';
}

if (strlen($secret) < 32 || !preg_match('#^https://#', $chat))
{
	cv_pagina('No disponible', '<h1>No disponible</h1><p>La conexión con CV Chat todavía no está configurada.</p>');
}

// Las paginas a las que se puede volver: el foro, la web (con y sin www) y CV Chat
$hostChat = (string) parse_url($chat, PHP_URL_HOST);
$dominio = preg_replace('/^[^.]+\./', '', $hostChat);
function cv_volver_ok($url)
{
	global $dominio, $hostChat;
	$p = parse_url((string) $url);
	if (!$p || ($p['scheme'] ?? '') !== 'https' || empty($p['host'])) return false;
	return in_array(strtolower($p['host']), [$dominio, 'www.' . $dominio, 'foro.' . $dominio, $hostChat], true);
}

// Que pidio CV Chat (y que la firma sea buena) antes de cargar el foro
$modo = null;
if (isset($_REQUEST['salir']))
{
	$volver = (string) ($_REQUEST['volver'] ?? '');
	$t = (string) ($_REQUEST['t'] ?? '');
	if (!cv_volver_ok($volver) || !ctype_digit($t) || abs(time() - (int) $t) > 120
		|| !hash_equals(cv_firmar("salir|$volver|$t"), (string) ($_REQUEST['firma'] ?? '')))
	{
		cv_ir($chat . '/');
	}
	$modo = 'salir';
}
else if (isset($_REQUEST['sso']))
{
	$sso = (string) $_REQUEST['sso'];
	$pedido = hash_equals(cv_firmar($sso), (string) ($_REQUEST['s'] ?? '')) ? json_decode(base64_decode(strtr($sso, '-_', '+/')), true) : null;
	// Con la cuenta del foro ya unida, 2 minutos; si hay que elegir, 15
	$vence = (!empty($pedido['foro']) ? 120 : 900);
	if (!is_array($pedido) || ($pedido['accion'] ?? '') !== 'sso' || empty($pedido['haven']) || !cv_volver_ok($pedido['volver'] ?? '')
		|| abs(time() - (int) ($pedido['t'] ?? 0)) > $vence || !preg_match('/^[0-9a-f]{24}$/', (string) ($pedido['n'] ?? '')))
	{
		cv_ir(is_array($pedido) && cv_volver_ok($pedido['volver'] ?? '') ? $pedido['volver'] : $chat . '/');
	}
	$modo = 'sso';
}
else if (isset($_REQUEST['panel']))
{
	$d = (string) $_REQUEST['panel'];
	$pedido = hash_equals(cv_firmar($d), (string) ($_REQUEST['s'] ?? '')) ? json_decode(base64_decode(strtr($d, '-_', '+/')), true) : null;
	if (!is_array($pedido) || ($pedido['accion'] ?? '') !== 'panel' || empty($pedido['foro']) || abs(time() - (int) ($pedido['t'] ?? 0)) > 120
		|| !preg_match('/^[0-9a-f]{24}$/', (string) ($pedido['n'] ?? '')))
	{
		cv_pagina('Enlace vencido', '<h1>Se venció el paso</h1><p>Volvé a entrar al panel desde CV Chat.</p>'
			. '<a class="btn" href="' . cv_e($chat) . '/puente/foro/panel">Entrar al panel</a>');
	}
	$modo = 'panel';
}
else
{
	$estado = (string) ($_REQUEST['estado'] ?? '');
	$para = (string) ($_REQUEST['para'] ?? '');
	$cuenta = (string) ($_REQUEST['cuenta'] ?? '');
	$firma = (string) ($_REQUEST['firma'] ?? '');
	$auto = ($_REQUEST['auto'] ?? '') === '1' && $para === 'entrar';
	if (!preg_match('/^[0-9a-f]{48}$/', $estado) || !in_array($para, ['entrar', 'vincular'], true) || strlen($cuenta) > 80
		|| !hash_equals(cv_firmar("$estado|$para|$cuenta" . ($auto ? '|auto' : '')), $firma))
	{
		cv_pagina('Enlace no válido', '<h1>Enlace no válido</h1><p>Volvé a CV Chat y tocá otra vez el botón del foro.</p>'
			. '<a class="btn" href="' . cv_e($chat) . '/">Ir a CV Chat</a>');
	}
	$modo = 'entrar';
}

// vBulletin, como en index.php
chdir(__DIR__);
require_once(__DIR__ . '/includes/vb5/autoloader.php');
vB5_Autoloader::register(__DIR__);
vB5_Frontend_Application::init(__DIR__);
$api = Api_InterfaceAbstract::instance();
$yo = vB5_User::instance();
$userid = (int) $yo['userid'];
$token = (string) $yo['securitytoken']; // el de vBulletin: lo revisa el foro mismo en cada envio (cambia en cada pedido)
// El de los formularios de esta pagina: firmado, para esta cuenta del foro y este pedido de CV Chat
function cv_clave_form($que) { global $userid; return cv_firmar("form|$userid|$que"); }
$base = rtrim((string) vB5_Template_Options::instance()->get('options.frontendurl'), '/');

// Quien es en el foro, para mandarlo a CV Chat
function cv_datos_foro($userid)
{
	global $api, $base;
	$info = $api->callApi('user', 'fetchUserinfo', ['userid' => $userid]);
	$av = $api->callApi('user', 'fetchAvatar', [$userid]);
	$usuario = cv_texto($info['username'] ?? '');
	return [
		'info' => $info,
		'id' => (int) $userid,
		'usuario' => $usuario,
		'nombre' => cv_texto($info['displayname'] ?? '') ?: $usuario,
		'email' => (string) ($info['email'] ?? ''),
		'grupos' => array_values(array_filter(array_map('intval', array_merge([$info['usergroupid'] ?? 0], explode(',', (string) ($info['membergroupids'] ?? '')))))),
		'foto' => (!empty($av['hascustom']) && !empty($av['avatarpath'])) ? $base . '/' . ltrim($av['avatarpath'], '/') : null,
	];
}

// Entrar al foro como una cuenta (cuenta unica), con "recordarme", igual que el inicio de sesion del foro
function cv_entrar_como($id)
{
	$row = vB::getDbAssertor()->getRow('user', ['userid' => (int) $id]);
	if (!$row) return false;
	$recordar = vB_Library::instance('login')->generateRememberMeToken($row['token'], vB_Request_Web::$COOKIE_SALT);
	$sesion = vB::getRequest()->createSessionForUser((int) $id);
	$info = $sesion->fetch_userinfo();
	$res = vB_User::processNewLogin(['userid' => (int) $id, 'password' => $recordar, 'lastvisit' => $info['lastvisit'], 'lastactivity' => $info['lastactivity']]);
	vB5_Auth::setLoginCookies($res, '', true);
	return true;
}

// Cada pedido de la cuenta unica sirve una vez (se anota en la cache del foro, que es escribible)
function cv_usar_pedido($n)
{
	$dir = __DIR__ . '/cache/cvchat';
	if (!is_dir($dir)) @mkdir($dir, 0700);
	foreach ((array) glob($dir . '/*') as $f) { if (is_file($f) && filemtime($f) < time() - 3600) @unlink($f); }
	$f = $dir . '/' . $n;
	if (file_exists($f)) return false;
	return @touch($f);
}

// ── 4. Panel ──
if ($modo === 'panel')
{
	$id = (int) $pedido['foro'];
	$row = vB::getDbAssertor()->getRow('user', ['userid' => $id]);
	if (!$row || (int) $row['usergroupid'] === 8 || !cv_usar_pedido($pedido['n'])) cv_ir($base . '/');
	// Como el inicio de sesion del panel de vBulletin (login.php, "cplogin"): la sesion del foro y la del panel
	$recordar = vB_Library::instance('login')->generateRememberMeToken($row['token'], vB_Request_Web::$COOKIE_SALT);
	$sesion = vB::getRequest()->createSessionForUser($id);
	$info = $sesion->fetch_userinfo();
	$res = vB_User::processNewLogin(['userid' => $id, 'password' => $recordar, 'lastvisit' => $info['lastvisit'], 'lastactivity' => $info['lastactivity']], 'cplogin');
	if (empty($res['cpsession']))
	{
		cv_pagina('Sin permiso', '<h1>Sin permiso</h1><p>Tu cuenta del foro no es administradora: no tiene panel.</p><a class="btn" href="' . cv_e($base) . '/">Ir al foro</a>');
	}
	vB5_Auth::setLoginCookies($res, 'cplogin', true);
	cv_ir($base . '/admincp/');
}

// ── 3. Salir ──
if ($modo === 'salir')
{
	if ($userid)
	{
		$info = $api->callApi('user', 'fetchUserinfo', ['userid' => $userid]);
		$api->callApi('user', 'logout', [(string) ($info['logouthash'] ?? '')]);
		vB5_Cookie::deleteAll();
	}
	cv_ir((string) $_REQUEST['volver']);
}

// ── 2. Cuenta unica ──
if ($modo === 'sso')
{
	$volver = (string) $pedido['volver'];
	$grupoDe = function ($id) {
		$r = vB::getDbAssertor()->getRow('user', ['userid' => (int) $id]);
		return $r ? (int) $r['usergroupid'] : 0;
	};
	// Le avisa a CV Chat con que cuenta del foro quedo (y CV Chat las une), y vuelve
	$avisar = function ($id, $como) use ($pedido, $volver, $chat) {
		$f = cv_datos_foro($id);
		$datos = cv_b64(json_encode(['para' => 'sso', 'haven' => (int) $pedido['haven'], 'id' => $f['id'], 'usuario' => $f['usuario'],
			'nombre' => $f['nombre'], 'grupos' => $f['grupos'], 'foto' => $f['foto'], 'como' => $como, 'volver' => $volver, 't' => time()],
			JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
		cv_ir($chat . '/puente/foro/sso-vuelta?' . http_build_query(['d' => $datos, 's' => cv_firmar($datos)]));
	};

	// Ya unida: entra (si no esta baneada) y vuelve
	if (!empty($pedido['foro']))
	{
		if (!cv_usar_pedido($pedido['n'])) cv_ir($volver);
		if ($userid !== (int) $pedido['foro'] && $grupoDe($pedido['foro']) !== 8) cv_entrar_como($pedido['foro']);
		cv_ir($volver);
	}

	// Recien entro con su cuenta del foro en esta misma pagina ("ya tengo cuenta"): las une
	if ($userid && ($_POST['accion'] ?? '') === '' && isset($_GET['entro']))
	{
		if (!cv_usar_pedido($pedido['n'])) cv_ir($volver);
		$avisar($userid, 'entrando');
	}

	// El mismo email, confirmado en los dos lados: es la misma persona
	$email = (string) ($pedido['email'] ?? '');
	if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL))
	{
		$iguales = vB::getDbAssertor()->getRows('user', ['email' => $email]);
		$buenas = array_values(array_filter((array) $iguales, function ($r) { return !in_array((int) $r['usergroupid'], [3, 4, 8], true); }));
		if (count($buenas) === 1)
		{
			if (!cv_usar_pedido($pedido['n'])) cv_ir($volver);
			cv_entrar_como($buenas[0]['userid']);
			$avisar($buenas[0]['userid'], 'email');
		}
	}

	$aca = '?' . http_build_query(['sso' => $_REQUEST['sso'], 's' => $_REQUEST['s']]);
	$nombre = (string) $pedido['nombre'];

	// La cuenta del foro con el mismo usuario (si esta tomado, con un numero al final)
	$crear = function () use ($pedido, $email) {
		$base_usuario = (string) $pedido['usuario'];
		for ($i = 1; $i < 50; $i++)
		{
			$prueba = $i === 1 ? $base_usuario : $base_usuario . $i;
			if (vB::getDbAssertor()->getRow('user', ['username' => $prueba])) continue;
			try
			{
				$nuevo = (int) vB_Library::instance('user')->save(0, bin2hex(random_bytes(24)),
					['username' => $prueba, 'email' => $email, 'usergroupid' => 2],
					[], [], ['skipactivationemail' => true]);
				if ($nuevo) return ['id' => $nuevo, 'error' => ''];
			}
			catch (Throwable $e)
			{
				$m = $e->getMessage();
				if (stripos($m, 'email') !== false) return ['id' => 0, 'error' => 'Ya hay una cuenta del foro con tu email: entrá con ella acá arriba y se unen.'];
				error_log('cvchat: no se pudo crear la cuenta del foro: ' . $m);
			}
		}
		return ['id' => 0, 'error' => 'No se pudo crear la cuenta del foro. Probá de nuevo más tarde.'];
	};

	// Cuenta nueva (creada desde que hay cuenta unica): sirve para todo, la del foro se crea sola, sin
	// preguntar. Solo se pregunta si en el foro ya hay alguien con ese usuario (puede ser la misma persona)
	// o si ya hay una sesion del foro con otra cuenta. Sin email confirmado todavia, se crea cuando lo confirme.
	if (!empty($pedido['nueva']) && !$userid && ($_POST['accion'] ?? '') === '')
	{
		if ($email === '') cv_ir($volver);
		if (!vB::getDbAssertor()->getRow('user', ['username' => (string) $pedido['usuario']]))
		{
			if (!cv_usar_pedido($pedido['n'])) cv_ir($volver);
			$r = $crear();
			if ($r['id'])
			{
				cv_entrar_como($r['id']);
				$avisar($r['id'], 'nueva');
			}
			error_log('cvchat: cuenta nueva sin cuenta del foro: ' . $r['error']);
			cv_ir($volver);
		}
	}

	// Crear la cuenta del foro con el mismo usuario
	$error = '';
	if (($_POST['accion'] ?? '') === 'crear' && hash_equals(cv_clave_form($pedido['n']), (string) ($_POST['clave'] ?? '')))
	{
		if ($email === '')
		{
			$error = 'Para crear tu cuenta del foro necesitás tener un email confirmado en CV Chat.';
		}
		else if (cv_usar_pedido($pedido['n']))
		{
			$r = $crear();
			if ($r['id'])
			{
				cv_entrar_como($r['id']);
				$avisar($r['id'], 'nueva');
			}
			$error = $r['error'];
		}
		else
		{
			cv_ir($volver);
		}
	}

	// Ya tiene sesion en el foro con otra cuenta (no la unida): se ofrece unir esa
	if ($userid)
	{
		$f = cv_datos_foro($userid);
		cv_pagina('Unir tus cuentas', '<h1>Unir tus cuentas</h1>'
			. '<p>Estás en el foro como <b>' . cv_e($f['usuario']) . '</b>. ¿Es tu cuenta? Unila con tu cuenta de CV Chat <b>' . cv_e($nombre) . '</b> y quedan como una sola.</p>'
			. '<a class="btn" href="' . cv_e($aca . '&entro=1') . '">Sí, unir ' . cv_e($f['usuario']) . ' con ' . cv_e($nombre) . '</a>'
			. '<a class="btn sec" href="' . cv_e($volver) . '" onclick="try{localStorage.setItem(&quot;cv_unir_no&quot;,&quot;1&quot;)}catch(e){}">Ahora no</a>');
	}

	cv_pagina('Tu cuenta del foro', '<h1>¡Hola, ' . cv_e($nombre) . '!</h1>'
		. '<p>Tu cuenta de CV Chat todavía no está unida a una cuenta del foro.</p>'
		. ($error ? '<div class="error">' . cv_e($error) . '</div>' : '')
		. '<h2>¿Ya tenés cuenta en el foro?</h2><p class="chico">Entrá con ella y quedan unidas: vas a usar una sola cuenta para todo.</p>'
		. str_replace('location.reload()', 'location.href=' . json_encode($aca . '&entro=1'), cv_form_entrar($token, $base, ''))
		. '<h2>¿No tenés?</h2>'
		. '<form method="post" action="' . cv_e($aca) . '"><input type="hidden" name="securitytoken" value="' . cv_e($token) . '"><input type="hidden" name="clave" value="' . cv_e(cv_clave_form($pedido['n'])) . '">'
		. '<button name="accion" value="crear">Crear mi cuenta del foro como ' . cv_e($pedido['usuario']) . '</button></form>'
		. '<a class="btn sec" href="' . cv_e($volver) . '">Ahora no</a>');
}

// ── 1. Entrar con el foro / vincular ──
$vuelta = $chat . '/puente/foro/vuelta';
$ocultos = '<input type="hidden" name="estado" value="' . cv_e($estado) . '"><input type="hidden" name="para" value="' . cv_e($para) . '">'
	. '<input type="hidden" name="cuenta" value="' . cv_e($cuenta) . '"><input type="hidden" name="firma" value="' . cv_e($firma) . '">';
$que = $para === 'vincular'
	? 'Vas a vincular tu cuenta del foro con la cuenta de CV Chat <b>' . cv_e($cuenta) . '</b>.'
	: 'Vas a entrar a CV Chat con tu cuenta del foro.';
$devolver = function ($userid) use ($estado, $para, $vuelta) {
	$f = cv_datos_foro($userid);
	$datos = cv_b64(json_encode(['estado' => $estado, 'para' => $para, 'id' => $f['id'], 'usuario' => $f['usuario'], 'nombre' => $f['nombre'],
		'email' => $f['email'], 'grupos' => $f['grupos'], 'foto' => $f['foto'], 't' => time()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
	cv_ir($vuelta . '?' . http_build_query(['estado' => $estado, 'd' => $datos, 's' => cv_firmar($datos)]));
};

// Cancelar (o automatico sin sesion en el foro): vuelve a CV Chat sin datos
if (($_POST['accion'] ?? '') === 'cancelar' || ($auto && !$userid))
{
	cv_ir($vuelta . '?' . http_build_query(['estado' => $estado, 'error' => 'cancelado']));
}
if ($auto) $devolver($userid);

if (!$userid)
{
	// Sin sesion: el inicio de sesion del foro, aca mismo
	cv_pagina('Iniciar sesión', '<h1>Iniciá sesión en el foro</h1><p>' . $que . '</p>'
		. cv_form_entrar($token, $base, '<form method="post">' . $ocultos . '<button class="sec" name="accion" value="cancelar">Cancelar</button></form>'));
}

if (($_POST['accion'] ?? '') === 'seguir')
{
	if (!hash_equals(cv_clave_form($estado), (string) ($_POST['clave'] ?? '')))
	{
		cv_pagina('Se venció el paso', '<h1>Se venció el paso</h1><p>Volvé a CV Chat y tocá otra vez el botón del foro.</p>');
	}
	$devolver($userid);
}

// Con sesion: confirmar
$f = cv_datos_foro($userid);
$salir = $base . '/auth/logout?logouthash=' . rawurlencode((string) ($f['info']['logouthash'] ?? ''));
cv_pagina('Seguir a CV Chat', '<h1>CV Chat</h1><p>' . $que . '</p>'
	. '<div class="perfil">' . ($f['foto'] ? '<img src="' . cv_e($f['foto']) . '" alt="">' : '<img alt="">') . '<div><b>' . cv_e($f['usuario']) . '</b>'
	. '<div class="chico">Cuenta del foro</div></div></div>'
	. '<p class="chico">CV Chat va a recibir tu usuario, tu foto y tu email del foro. Tu contraseña no sale del foro.</p>'
	. '<form method="post">' . $ocultos . '<input type="hidden" name="securitytoken" value="' . cv_e($token) . '"><input type="hidden" name="clave" value="' . cv_e(cv_clave_form($estado)) . '">'
	. '<button name="accion" value="seguir">Seguir como ' . cv_e($f['usuario']) . '</button>'
	. '<button class="sec" name="accion" value="cancelar">Cancelar</button></form>'
	. '<p class="chico">¿No sos vos? <a href="' . cv_e($salir) . '">Cerrar sesión en el foro</a></p>');
