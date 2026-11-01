<?php
// Sube estilo-cv.xml al foro como el estilo "Circulo Vicioso" (hijo del Dark que se usa hoy), igual
// que Estilos -> Descargar/Subir en el panel. Si ya esta, lo pisa con lo del XML.
// Uso: php instalar.php [--predeterminado | --volver] [carpeta]
//   --predeterminado  lo deja como el estilo de todos
//   --volver          deja otra vez el Dark como el de todos (el estilo nuevo queda, sin usar)
$args = array_slice($argv, 1);
$pred = in_array('--predeterminado', $args); $volver = in_array('--volver', $args);
$args = array_values(array_filter($args, fn($a) => $a[0] !== '-'));
$dir = rtrim($args[0] ?? __DIR__, '/');
chdir('/var/www/html/core');
define('CWD', '/var/www/html/core');
define('TIMENOW', time());
define('VB_AREA', 'AdminCP');
foreach (['SERVER_PORT' => 80, 'SERVER_NAME' => 'localhost', 'SCRIPT_NAME' => '', 'REQUEST_URI' => '', 'REQUEST_METHOD' => '', 'REMOTE_ADDR' => '127.0.0.1', 'HTTP_USER_AGENT' => 'vB CLI'] as $k => $v) if (!isset($_SERVER[$k])) $_SERVER[$k] = $v;
require_once(CWD . '/vb/vb.php');
vB::init();
require_once(CWD . '/includes/class_core.php');
vB::setRequest(new vB_Request_Web());
// Rehacer los estilos pide una sesion (la de un visitante alcanza)
vB::setCurrentSession(vB_Session_Cli::getSession(0));
$vbulletin = vB::get_registry();
require_once(CWD . '/includes/adminfunctions.php');
require_once(CWD . '/includes/adminfunctions_template.php');

const TITULO = 'Círculo Vicioso';
const PADRE = 13; // el Dark con el logo del club
$db = vB::getDbAssertor();
$padre = $db->getRow('style', ['styleid' => PADRE]);
if (!$padre) { fwrite(STDERR, "no encuentro el estilo " . PADRE . "\n"); exit(1); }
$ya = $db->getRow('style', ['title' => TITULO]);

if (!$volver) {
  $xml = file_get_contents("$dir/estilo-cv.xml");
  if (!$xml) { fwrite(STDERR, "falta estilo-cv.xml\n"); exit(1); }
  preg_match_all('/<stylevar name="([^"]+)" value="([^"]*)"/', $xml, $m, PREG_SET_ORDER);
  preg_match_all('/<template name="([^"]+)"[^>]*><!\[CDATA\[(.*?)\]\]><\/template>/s', $xml, $t, PREG_SET_ORDER);
  // vBulletin guarda las plantillas con CRLF y sin el salto del final
  $norm = fn($s) => trim(str_replace("\r\n", "\n", $s));
  // Al pisar un estilo que ya esta, si cambian sus datos (la fecha del XML, por ejemplo) vBulletin
  // 5.7.5 se confunde y sube las plantillas y variables al estilo 1 ("Default Style"): se dejan antes
  // los datos como los va a poner, asi no cambia nada y sube todo al estilo que es
  if ($ya) {
    preg_match('/<style [^>]*dateline="(\d+)"/', $xml, $d);
    $db->update('style', ['title' => TITULO, 'parentid' => PADRE, 'displayorder' => 2, 'userselect' => 1,
      'styleattributes' => vB_Library_Style::ATTR_DEFAULT, 'dateline' => (int)($d[1] ?? 0)], ['styleid' => $ya['styleid']]);
  }
  // Lo que ya hay en los demas estilos, para ver despues que no se toco
  $otros = function () use ($vbulletin, $ya) {
    $id = $ya ? (int)$ya['styleid'] : 0; $h = '';
    foreach (["SELECT styleid, stylevarid, value FROM " . TABLE_PREFIX . "stylevar WHERE styleid <> $id ORDER BY styleid, stylevarid",
      "SELECT styleid, title, MD5(template_un) FROM " . TABLE_PREFIX . "template WHERE styleid NOT IN (-1, -10, $id) ORDER BY styleid, title"] as $sql) {
      $q = $vbulletin->db->query_read($sql);
      while ($r = $vbulletin->db->fetch_row($q)) $h = md5($h . implode('|', $r));
    }
    return $h;
  };
  $antes = $otros();
  try {
    xml_import_style($xml, $ya ? (int)$ya['styleid'] : -1, PADRE, TITULO, true, 2, true, null, null, true);
  } catch (Exception $e) { fwrite(STDERR, 'no se pudo subir: ' . $e->getMessage() . "\n"); exit(1); }
  $nuevo = !$ya;
  $ya = $db->getRow('style', ['title' => TITULO]);
  if (!$ya) { fwrite(STDERR, "no quedo el estilo\n"); exit(1); }
  if (!$nuevo && $otros() !== $antes) { fwrite(STDERR, "la subida toco otros estilos: revisar (hay copia antes de correr esto?)\n"); exit(1); }
  $mal = 0;
  foreach ($m as [, $id, $v]) { $r = $db->getRow('stylevar', ['styleid' => $ya['styleid'], 'stylevarid' => $id]); if (!$r || $r['value'] !== base64_decode($v)) $mal++; }
  foreach ($t as [, $id, $v]) { $r = $db->getRow('template', ['styleid' => $ya['styleid'], 'title' => $id]); if (!$r || $norm($r['template_un']) !== $norm($v)) $mal++; }
  if ($mal) { fwrite(STDERR, "$mal variables o plantillas no quedaron como en el XML\n"); exit(1); }
  echo "estilo " . $ya['styleid'] . " subido (" . count($m) . " variables, " . count($t) . " plantillas)\n";
}
if ($pred || $volver) {
  $id = $volver ? PADRE : (int)$ya['styleid'];
  $db->update('setting', ['value' => $id], ['varname' => 'styleid']);
  vB::getDatastore()->build_options();
  echo "estilo de todos: $id\n";
}
// Rehace las hojas de estilo de todos los estilos (como "Reconstruir estilos" en el panel)
try { build_all_styles(0, 0, '', false, false); }
catch (Throwable $e) { fwrite(STDERR, $e->getMessage() . "\n" . $e->getTraceAsString() . "\n"); exit(1); }
echo "estilos rehechos\n";
