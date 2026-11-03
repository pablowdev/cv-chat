<?php
// El mapa del sitio del foro, para Google: lo prende con las opciones del panel (Opciones -> Mapa del sitio:
// armarlo con la tarea programada, todos los dias) y lo arma ya, como la tarea "sitemap". Los archivos van en
// core/store_sitemap (escribible/sitemap en docker-compose.yml) y se ven en /core/xmlsitemap.php, que nombra
// el robots.txt del foro. Se puede correr mas de una vez.
//
// Uso (como el usuario del servidor web): docker exec -i -u 33 foro-web php < mapa-del-sitio.php
chdir('/var/www/html/core');
define('CWD', '/var/www/html/core');
define('TIMENOW', time());
define('VB_AREA', 'AdminCP');
foreach (['SERVER_PORT' => 443, 'SERVER_NAME' => 'foro.circulovicioso.club', 'HTTP_HOST' => 'foro.circulovicioso.club', 'SCRIPT_NAME' => '', 'REQUEST_URI' => '', 'REQUEST_METHOD' => '', 'REMOTE_ADDR' => '127.0.0.1', 'HTTP_USER_AGENT' => 'vB CLI'] as $k => $v) if (!isset($_SERVER[$k])) $_SERVER[$k] = $v;
require_once(CWD . '/vb/vb.php');
vB::init();
require_once(CWD . '/includes/class_core.php');
vB::setRequest(new vB_Request_Web());
vB::setCurrentSession(vB_Session_Cli::getSession(1));
$vbulletin = vB::get_registry();
require_once(CWD . '/includes/adminfunctions.php');
require_once(CWD . '/includes/functions_cron.php');

$db = vB::getDbAssertor();
$cambio = false;
foreach (['sitemap_cron_enable' => 1, 'sitemap_cron_frequency' => 1] as $nombre => $valor) {
  $r = $db->getRow('setting', ['varname' => $nombre]);
  if (!$r) { fwrite(STDERR, "no existe la opcion $nombre\n"); exit(1); }
  if ((string)$r['value'] !== (string)$valor) { $db->update('setting', ['value' => $valor], ['varname' => $nombre]); $cambio = true; }
}
if ($cambio) { vB::getDatastore()->build_options(); echo "mapa del sitio: prendido, todos los dias\n"; }
// (las opciones ya cargadas en esta corrida, al dia)
$vbulletin->options['sitemap_cron_enable'] = 1;
$vbulletin->options['sitemap_cron_frequency'] = 1;

// Armarlo ahora, como la tarea programada
$cron = $db->getRow('cron', ['varname' => 'sitemap']);
if (!$cron) { fwrite(STDERR, "no esta la tarea sitemap\n"); exit(1); }
require_once(CWD . '/includes/class_sitemap.php');
$runner = new vB_SiteMapRunner_Cron($vbulletin);
$runner->set_cron_item($cron);
$estado = $runner->check_environment();
if ($estado['error']) { fwrite(STDERR, 'no se pudo: ' . $estado['error'] . "\n"); exit(1); }
$n = 0;
while (!$runner->is_finished) { $runner->generate(); $n++; }
echo "mapa del sitio: armado ($n " . ($n === 1 ? 'parte' : 'partes') . ")\n";
