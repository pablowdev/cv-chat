<?php
// Arma estilo-cv.xml: el estilo "Circulo Vicioso" del foro, hijo del Dark que se usa hoy.
// Toma cada variable que el Dark cambia y le pasa los colores a la paleta de la web (fondo bordo
// oscuro, crema, rosa), le saca las texturas, y encima pone las de la lista de abajo (letras,
// esquinas rectas, bordes). Las plantillas css_additional.css y css_fonts.css salen de los .css
// de esta carpeta. Se corre una vez contra el foro (php generar.php) y se guarda el XML.
// Uso: php generar.php [carpeta]   (por defecto la carpeta de este archivo)
$dir = rtrim($argv[1] ?? __DIR__, '/');
chdir('/var/www/html/core');
define('CWD', '/var/www/html/core');
define('TIMENOW', time());
foreach (['SERVER_PORT' => 80, 'SERVER_NAME' => 'localhost', 'SCRIPT_NAME' => '', 'REQUEST_URI' => '', 'REQUEST_METHOD' => '', 'REMOTE_ADDR' => '127.0.0.1', 'HTTP_USER_AGENT' => 'vB CLI'] as $k => $v) if (!isset($_SERVER[$k])) $_SERVER[$k] = $v;
require_once(CWD . '/vb/vb.php');
vB::init();
require_once(CWD . '/includes/class_core.php');
vB::setRequest(new vB_Request_Web());
$vbulletin = vB::get_registry();

const BG = '#211C1F'; const BG2 = '#2A2427'; const BG3 = '#332C30'; const BG4 = '#3D3539'; const HONDO = '#1A1619';
const FG = '#F3F7E2'; const FG2 = '#C9CCBA'; const FG3 = '#9A9A8E'; const ROSA = '#EE2D6F'; const ROSA_OSC = '#4A2133';
const MONO = '"Space Mono",ui-monospace,Menlo,Consolas,monospace';
const SERIF = '"Redaction 35","Redaction 50",Georgia,serif';
const SANS = 'Inter,"Helvetica Neue",Helvetica,Arial,sans-serif';

// Un color del Dark, a la paleta de la web: los grises por lo claros que son, los marrones y
// naranjas al rosa (oscuro si eran de fondo)
function recolor($c) {
  $t = trim($c);
  if ($t === '' || strcasecmp($t, 'transparent') === 0 || strcasecmp($t, 'inherit') === 0) return $c;
  $a = null;
  if (preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6})$/i', $t, $m)) {
    $h = strlen($m[1]) === 3 ? preg_replace('/(.)/', '$1$1', $m[1]) : $m[1];
    [$r, $g, $b] = array_map('hexdec', str_split($h, 2));
  } elseif (preg_match('/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i', $t, $m)) {
    [$r, $g, $b] = [(int)$m[1], (int)$m[2], (int)$m[3]]; $a = isset($m[4]) ? $m[4] : null;
  } else return $c;
  $mx = max($r, $g, $b) / 255; $mn = min($r, $g, $b) / 255; $l = ($mx + $mn) / 2;
  $s = $mx == $mn ? 0 : ($l > 0.5 ? ($mx - $mn) / (2 - $mx - $mn) : ($mx - $mn) / ($mx + $mn));
  // Las transparencias negras o blancas (sombras, velos) quedan como estan
  if ($a !== null && ($l < 0.05 || $l > 0.95)) return $c;
  if ($s > 0.3 && $l > 0.12 && $l < 0.9) $n = $l < 0.4 ? ROSA_OSC : ROSA;
  elseif ($l < 0.09) $n = HONDO; elseif ($l < 0.16) $n = BG; elseif ($l < 0.22) $n = BG2; elseif ($l < 0.3) $n = BG3;
  elseif ($l < 0.42) $n = BG4; elseif ($l < 0.62) $n = FG3; elseif ($l < 0.8) $n = FG2; else $n = FG;
  if ($a === null) return $n;
  [$r, $g, $b] = array_map('hexdec', str_split(substr($n, 1), 2));
  return "rgba($r, $g, $b, $a)";
}
function recolorAll($v) {
  foreach ($v as $k => $x) {
    if (preg_match('/^(gradient_[a-z]+_)?color$/', $k) && is_string($x)) $v[$k] = recolor($x);
    // las texturas y degradados del Dark se van; el logo y los iconos quedan
    if ($k === 'image' && is_string($x) && preg_match('#images/themes/dark/(?!logo)|gradient#', $x)) $v[$k] = '';
  }
  return $v;
}

$db = $vbulletin->db;
$master = []; $dark = [];
$q = $db->query_read("SELECT styleid, stylevarid, value FROM " . TABLE_PREFIX . "stylevar WHERE styleid IN (-1, 12)");
while ($row = $db->fetch_array($q)) { if ($row['styleid'] == -1) $master[$row['stylevarid']] = unserialize($row['value']); else $dark[$row['stylevarid']] = unserialize($row['value']); }
if (!$dark) { fwrite(STDERR, "no encuentro el estilo Dark (12)\n"); exit(1); }

$out = [];
foreach ($dark as $id => $v) if ($id !== 'titleimage' && $id !== 'favicon' && is_array($v)) $out[$id] = recolorAll($v);
// Parte de una variable: lo que tiene el Dark (o el original), con estos cambios
$set = function ($id, $cambios) use (&$out, $dark, $master) {
  $base = $out[$id] ?? $dark[$id] ?? $master[$id] ?? null;
  if ($base === null) { fwrite(STDERR, "no existe la variable $id\n"); exit(1); }
  foreach ($cambios as $k => $x) { $base[$k] = $x; foreach (['stylevar_', 'inherit_param_'] as $p) if (array_key_exists($p . $k, $base)) $base[$p . $k] = ''; }
  $out[$id] = $base;
};
$color = fn($c) => ['color' => $c];
$fam = fn($f) => ['family' => $f];
$borde = fn($w, $c) => ['units' => 'px', 'width' => (string)$w, 'style' => 'solid', 'color' => $c];

// La paleta (casi todo el foro sale de aca: se puede cambiar en el panel)
foreach ([
  'global_palette_fill_01' => BG, 'global_palette_fill_02' => BG2,
  'global_palette_text_01' => FG, 'global_palette_text_02' => FG3, 'global_palette_text_04' => FG, 'global_palette_text_05' => ROSA,
  'global_palette_accent_01' => ROSA_OSC, 'global_palette_accent_02' => ROSA, 'global_palette_accent_03' => '#F48AAE',
  'global_palette_contrast_01' => BG4, 'global_palette_contrast_02' => BG2,
] as $id => $c) $set($id, $color($c));
$set('body_background', ['color' => BG, 'image' => '']);
$set('body_link_color_hover', $color(ROSA));
$set('header_subtabbar_background', ['color' => BG, 'image' => '']);
$set('header_tabbar_background', $color(BG));
$set('header_tab_background_hover', $color(BG2));
$set('header_tab_background_active', $color(FG));
$set('header_tab_text_color', $color(FG));
$set('header_tab_text_color_hover', $color(ROSA));
$set('header_tab_text_color_active', $color(BG));
$set('header_subtabbar_text_color', $color(FG2));
$set('module_header_text_color', $color(ROSA));
$set('module_header_border', $borde(1, 'rgba(243, 247, 226, 0.9)'));
$set('module_content_border', $borde(1, 'rgba(243, 247, 226, 0.9)'));
$set('module_tab_background', $color(BG));
$set('module_tab_background_active', $color(FG));
$set('module_tab_text_color', $color(FG2));
$set('module_tab_text_color_active', $color(BG));
$set('module_tab_border_active', $borde(1, FG));
$set('button_primary_background', ['color' => ROSA, 'image' => '']);
$set('button_primary_text_color', $color(FG));
$set('button_primary_text_color_hover', $color(FG));
$set('form_field_background', $color(BG));
$set('form_field_text_color', $color(FG));
$set('form_field_border', $borde(1, 'rgba(243, 247, 226, 0.5)'));
$set('postbit_background', $color(BG));
// El primer mensaje de cada tema: el Dark lo calcula desde un color de la paleta y con la nueva daba verde
$set('thread_starter_background', $color(BG3));
// Sin degradados en las barras ni en el interruptor
$set('toolbar_background', ['color' => BG2, 'gradient_type' => '']);
$set('toggle_slider_yes_background', ['color' => ROSA, 'gradient_type' => '']);
$set('notice_background', $color(BG2));
$set('notice_border', $borde(1, 'rgba(243, 247, 226, 0.18)'));
$set('placeholder_text_color', $color(FG3));
// Esquinas rectas, como los recuadros de la web
foreach (['header_tab_border_radius_size', 'header_tab_bottom_border_radius_size', 'module_border_radius_size', 'module_tabbar_border_radius_size', 'module_tab_border_radius_size'] as $id) $set($id, ['size' => '0']);
// Las letras: la de maquina de escribir de la web en menus, pestanas y botones, la serif en los
// titulos grandes, y una comoda para leer en los mensajes
$set('global_text_font', $fam(SANS));
$set('post_content_font', $fam(SANS));
foreach (['header_tab_font', 'header_subtabbar_font', 'module_tab_font', 'breadcrumb_font', 'footer_font_style', 'button_font', 'module_header_font', 'forum_list_header_font', 'toolbar_font'] as $id) $set($id, $fam(MONO));
$set('primary_module_header_font', ['family' => SERIF, 'size' => '2.6', 'weight' => 'normal']);

// El XML, como lo exporta el panel (Estilos -> Descargar/Subir)
$x = "<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?>\r\n\r\n";
$x .= '<style name="Circulo Vicioso" vbversion="' . $vbulletin->options['templateversion'] . "\" product=\"vbulletin\" type=\"custom\" dateline=\"" . TIMENOW . "\">\r\n";
$x .= "\t<templategroup name=\"Css\">\r\n";
foreach (['css_additional.css', 'css_fonts.css'] as $t) {
  $css = file_get_contents("$dir/$t");
  if ($css === false || preg_match('/[^\x09\x0A\x0D\x20-\x7E]/', $css)) { fwrite(STDERR, "$t: falta o tiene caracteres fuera de ASCII\n"); exit(1); }
  $x .= "\t\t<template name=\"$t\" templatetype=\"template\" date=\"" . TIMENOW . "\" username=\"Circulo Vicioso\" version=\"" . $vbulletin->options['templateversion'] . "\"><![CDATA[" . str_replace(']]>', ']]]]><![CDATA[>', $css) . "]]></template>\r\n";
}
$x .= "\t</templategroup>\r\n\t<stylevardfns>\r\n\t</stylevardfns>\r\n\t<stylevars>\r\n";
ksort($out);
foreach ($out as $id => $v) $x .= "\t\t<stylevar name=\"" . htmlspecialchars($id) . '" value="' . base64_encode(serialize($v)) . "\" />\r\n";
$x .= "\t</stylevars>\r\n</style>\r\n";
file_put_contents("$dir/estilo-cv.xml", $x);
echo count($out) . " variables, estilo-cv.xml listo\n";
