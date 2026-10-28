<?php
// Vuelve a leer las opciones del foro de la tabla setting (despues de cambiarlas en la base)
chdir('/var/www/html/core');
define('CWD', '/var/www/html/core');
define('TIMENOW', time());
foreach (['SERVER_PORT' => 80, 'SERVER_NAME' => 'localhost', 'SCRIPT_NAME' => '', 'REQUEST_URI' => '', 'REQUEST_METHOD' => '', 'REMOTE_ADDR' => '127.0.0.1', 'HTTP_USER_AGENT' => 'vB CLI'] as $k => $v) if (!isset($_SERVER[$k])) $_SERVER[$k] = $v;
require_once(CWD . '/vb/vb.php');
vB::init();
require_once(CWD . '/includes/class_core.php');
vB::setRequest(new vB_Request_Web());
$vbulletin = vB::get_registry();
vB::getDatastore()->build_options();
$o = vB::getDatastore()->getValue('options');
echo "opciones rehechas: smtp_host=" . $o['smtp_host'] . " webmasteremail=" . $o['webmasteremail'] . " version=" . $o['templateversion'] . "\n";
