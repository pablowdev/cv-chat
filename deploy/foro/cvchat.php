<?php
// Puente con CV Chat (tools/puente/foro.js): "Entrar con el foro" y vincular la cuenta.
//
// CV Chat manda aca con ?estado=&para=&cuenta=&firma= (firmado por CV Chat). Si no
// hay sesion en el foro, se inicia aca mismo con el inicio de sesion del foro
// (/auth/ajax-login). Despues se pregunta si se quiere seguir, y se vuelve a
// CV Chat con quien es (id, usuario, email, grupos, foto), firmado.
//
// La clave (CV_PUENTE_SECRETO) y la direccion de CV Chat (CV_CHAT_URL) llegan
// como variables de entorno del contenedor (puente.env); la vuelta es siempre a
// CV_CHAT_URL, nunca a una direccion que venga en el pedido.

$secret = (string) getenv('CV_PUENTE_SECRETO');
$chat = rtrim((string) getenv('CV_CHAT_URL'), '/');

header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');

function cv_e($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function cv_texto($s) { return html_entity_decode((string) $s, ENT_QUOTES, 'UTF-8'); }
function cv_b64($s) { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }

function cv_pagina($titulo, $cuerpo)
{
	header('Content-Type: text/html; charset=utf-8');
	echo '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
		. '<meta name="robots" content="noindex"><title>' . cv_e($titulo) . ' · Foro de Círculo Vicioso</title><style>'
		. ':root{color-scheme:dark}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;'
		. 'background:#121214;color:#f2f3f5;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
		. '.card{width:100%;max-width:420px;background:#1e1f22;border:1px solid #2e3035;border-radius:14px;padding:28px 24px}'
		. 'h1{font-size:1.3rem;margin:0 0 6px}p{margin:0 0 16px;color:#b5bac1}.chico{font-size:.875rem;color:#949ba4}'
		. '.perfil{display:flex;align-items:center;gap:14px;margin:0 0 18px;padding:12px;border-radius:10px;background:#2b2d31}'
		. '.perfil img{width:56px;height:56px;border-radius:50%;object-fit:cover;background:#3f4147}.perfil b{font-size:1.1rem}'
		. 'label{display:block;font-size:.8rem;font-weight:700;text-transform:uppercase;color:#b5bac1;margin:0 0 12px}'
		. 'input{display:block;width:100%;margin-top:6px;padding:11px 12px;border-radius:8px;border:1px solid #3f4147;background:#121214;color:#f2f3f5;font:inherit}'
		. 'button,.btn{display:block;width:100%;border:0;border-radius:8px;padding:12px 16px;font:inherit;font-weight:600;cursor:pointer;'
		. 'background:#7c3aed;color:#fff;text-align:center;text-decoration:none;margin:0 0 10px}'
		. 'button.sec{background:transparent;color:#f2f3f5;border:1px solid #4e5058}button:disabled{opacity:.6;cursor:wait}'
		. '.error{background:#3a1a1e;color:#ffaab1;padding:10px 12px;border-radius:8px;margin:0 0 14px}a{color:#00a8fc}'
		. '</style></head><body><main class="card">' . $cuerpo . '</main></body></html>';
	exit;
}

$estado = (string) ($_REQUEST['estado'] ?? '');
$para = (string) ($_REQUEST['para'] ?? '');
$cuenta = (string) ($_REQUEST['cuenta'] ?? '');
$firma = (string) ($_REQUEST['firma'] ?? '');

if (strlen($secret) < 32 || !preg_match('#^https://#', $chat))
{
	cv_pagina('No disponible', '<h1>No disponible</h1><p>La conexión con CV Chat todavía no está configurada.</p>');
}
if (!preg_match('/^[0-9a-f]{48}$/', $estado) || !in_array($para, ['entrar', 'vincular'], true) || strlen($cuenta) > 80
	|| !hash_equals(hash_hmac('sha256', "$estado|$para|$cuenta", $secret), $firma))
{
	cv_pagina('Enlace no válido', '<h1>Enlace no válido</h1><p>Volvé a CV Chat y tocá otra vez el botón del foro.</p>'
		. '<a class="btn" href="' . cv_e($chat) . '/">Ir a CV Chat</a>');
}

// vBulletin, como en index.php
chdir(__DIR__);
require_once(__DIR__ . '/includes/vb5/autoloader.php');
vB5_Autoloader::register(__DIR__);
vB5_Frontend_Application::init(__DIR__);
$api = Api_InterfaceAbstract::instance();
$yo = vB5_User::instance();
$userid = (int) $yo['userid'];
$token = (string) $yo['securitytoken'];
$base = rtrim((string) vB5_Template_Options::instance()->get('options.frontendurl'), '/');
$vuelta = $chat . '/puente/foro/vuelta';
$ocultos = '<input type="hidden" name="estado" value="' . cv_e($estado) . '"><input type="hidden" name="para" value="' . cv_e($para) . '">'
	. '<input type="hidden" name="cuenta" value="' . cv_e($cuenta) . '"><input type="hidden" name="firma" value="' . cv_e($firma) . '">';
$que = $para === 'vincular'
	? 'Vas a vincular tu cuenta del foro con la cuenta de CV Chat <b>' . cv_e($cuenta) . '</b>.'
	: 'Vas a entrar a CV Chat con tu cuenta del foro.';

// Cancelar: vuelve a CV Chat sin datos
if (($_POST['accion'] ?? '') === 'cancelar')
{
	header('Location: ' . $vuelta . '?' . http_build_query(['estado' => $estado, 'error' => 'cancelado']), true, 303);
	exit;
}

if (!$userid)
{
	// Sin sesion: el inicio de sesion del foro, aca mismo
	cv_pagina('Iniciar sesión', '<h1>Iniciá sesión en el foro</h1><p>' . $que . '</p>'
		. '<div class="error" id="error" hidden></div>'
		. '<form id="entrar"><label>Usuario<input name="username" autocomplete="username" required></label>'
		. '<label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>'
		. '<label id="codigo" hidden>Código de verificación<input name="mfa_authcode" inputmode="numeric" autocomplete="one-time-code"></label>'
		. '<input type="hidden" name="securitytoken" value="' . cv_e($token) . '"><input type="hidden" name="rememberme" value="1">'
		. '<button type="submit">Iniciar sesión</button></form>'
		. '<form method="post">' . $ocultos . '<button class="sec" name="accion" value="cancelar">Cancelar</button></form>'
		. '<p class="chico"><a href="' . cv_e($base) . '/lostpw" target="_blank" rel="noopener">¿Olvidaste tu contraseña?</a> · '
		. '<a href="' . cv_e($base) . '/register" target="_blank" rel="noopener">Crear una cuenta en el foro</a></p>'
		. '<script>(function(){var f=document.getElementById("entrar"),e=document.getElementById("error");'
		. 'f.addEventListener("submit",function(ev){ev.preventDefault();var b=f.querySelector("button");b.disabled=true;e.hidden=true;'
		. 'fetch(' . json_encode($base . '/auth/ajax-login') . ',{method:"POST",credentials:"same-origin",body:new URLSearchParams(new FormData(f))})'
		. '.then(function(r){return r.json()}).then(function(d){if(d&&d.success){location.reload();return}'
		. 'var t=d&&d.errors&&d.errors[0];t=String(Array.isArray(t)?t[0]:t||"");b.disabled=false;f.password.value="";'
		. 'if(/mfa/i.test(t)){document.getElementById("codigo").hidden=false;e.textContent="Escribí el código de verificación de tu cuenta.";}'
		. 'else if(t==="strikes"){e.textContent="Hubo demasiados intentos. Esperá 15 minutos y probá de nuevo.";}'
		. 'else{e.textContent="El usuario o la contraseña no son correctos.";}e.hidden=false;})'
		. '.catch(function(){b.disabled=false;e.textContent="No se pudo iniciar sesión. Probá de nuevo.";e.hidden=false;});});})();</script>');
}

$info = $api->callApi('user', 'fetchUserinfo', ['userid' => $userid]);
$av = $api->callApi('user', 'fetchAvatar', [$userid]);
$foto = (!empty($av['hascustom']) && !empty($av['avatarpath'])) ? $base . '/' . ltrim($av['avatarpath'], '/') : null;
$usuario = cv_texto($info['username'] ?? '');

if (($_POST['accion'] ?? '') === 'seguir')
{
	if (!hash_equals($token, (string) ($_POST['securitytoken'] ?? '')))
	{
		cv_pagina('Se venció el paso', '<h1>Se venció el paso</h1><p>Volvé a CV Chat y tocá otra vez el botón del foro.</p>');
	}
	$grupos = array_values(array_filter(array_map('intval', array_merge([$info['usergroupid'] ?? 0], explode(',', (string) ($info['membergroupids'] ?? ''))))));
	$datos = cv_b64(json_encode([
		'estado' => $estado,
		'para' => $para,
		'id' => $userid,
		'usuario' => $usuario,
		'nombre' => cv_texto($info['displayname'] ?? '') ?: $usuario,
		'email' => (string) ($info['email'] ?? ''),
		'grupos' => $grupos,
		'foto' => $foto,
		't' => time(),
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
	header('Location: ' . $vuelta . '?' . http_build_query(['estado' => $estado, 'd' => $datos, 's' => hash_hmac('sha256', $datos, $secret)]), true, 303);
	exit;
}

// Con sesion: confirmar
$salir = $base . '/auth/logout?logouthash=' . rawurlencode((string) ($info['logouthash'] ?? ''));
cv_pagina('Seguir a CV Chat', '<h1>CV Chat</h1><p>' . $que . '</p>'
	. '<div class="perfil">' . ($foto ? '<img src="' . cv_e($foto) . '" alt="">' : '<img alt="">') . '<div><b>' . cv_e($usuario) . '</b>'
	. '<div class="chico">Cuenta del foro</div></div></div>'
	. '<p class="chico">CV Chat va a recibir tu usuario, tu foto y tu email del foro. Tu contraseña no sale del foro.</p>'
	. '<form method="post">' . $ocultos . '<input type="hidden" name="securitytoken" value="' . cv_e($token) . '">'
	. '<button name="accion" value="seguir">Seguir como ' . cv_e($usuario) . '</button>'
	. '<button class="sec" name="accion" value="cancelar">Cancelar</button></form>'
	. '<p class="chico">¿No sos vos? <a href="' . cv_e($salir) . '">Cerrar sesión en el foro</a></p>');
