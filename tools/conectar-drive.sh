#!/bin/sh
# Conecta un remoto de rclone (por defecto "personal", el del respaldo) con un cliente de
# Google propio, en vez del que comparten todos los que usan rclone (que Google limita).
# Se corre una sola vez, desde la compu, con el tunel para autorizar en el navegador:
#   ssh -t -L 53682:127.0.0.1:53682 <servidor> sudo /opt/haven/tools/conectar-drive.sh
# Pide el Client ID y el Client secret (no se ven al pegarlos), guarda una copia de
# rclone.conf, pausa la subida inicial si esta corriendo, y despues de autorizar prueba la
# conexion; si algo falla, deja todo como estaba. Nunca muestra ni anota el secreto.
set -eu
CONF=/opt/haven/tools/rclone.conf
REMOTO=${1:-personal}
[ "$(id -u)" = 0 ] || { echo "Correlo con sudo."; exit 1; }
grep -q "^\[$REMOTO\]$" "$CONF" || { echo "No hay un remoto [$REMOTO] en $CONF."; exit 1; }

leer() { printf '%s' "$1" >&2; stty -echo; read -r v; stty echo; echo >&2; printf '%s' "$v" | tr -d ' \r\t'; }
ID=$(leer 'Pegá el Client ID y tocá Enter (no se ve): ')
SECRETO=$(leer 'Pegá el Client secret y tocá Enter (no se ve): ')
case "$ID" in *.apps.googleusercontent.com) ;; *) echo "Ese Client ID no parece de Google (termina en .apps.googleusercontent.com). No cambié nada."; exit 1 ;; esac
[ ${#SECRETO} -ge 10 ] || { echo "El secreto quedó vacío o muy corto. No cambié nada."; exit 1; }

COPIA="$CONF.antes-cliente-propio-$(date +%Y%m%d-%H%M%S)"
cp -p "$CONF" "$COPIA"
SUBIDA=0
arrancar() {
  systemctl reset-failed cv-respaldo-inicial 2>/dev/null || true
  systemd-run --unit=cv-respaldo-inicial /bin/sh -c 'cd /opt/haven && rclone copy haven-data/uploads personal:CV-respaldo/uploads --config /opt/haven/tools/rclone.conf --transfers 6 --checkers 12 --bwlimit 20M --drive-chunk-size 16M --timeout 2m --retries 10 --exclude "*.part" --stats 5m --stats-one-line -v >> /opt/haven/tools/respaldo-inicial.log 2>&1' >/dev/null
  echo "La subida de fotos y videos sigue desde donde iba."
}
volver() { cp -p "$COPIA" "$CONF"; echo; echo "No se pudo conectar: dejé la conexión como estaba (copia en $COPIA)."; [ $SUBIDA = 0 ] || arrancar; exit 1; }
if systemctl is-active -q cv-respaldo-inicial; then
  SUBIDA=1; systemctl stop cv-respaldo-inicial; echo "Pausé la subida de fotos y videos mientras tanto."
fi

# El cliente nuevo en la seccion del remoto (sin tocar las demas)
ID="$ID" SECRETO="$SECRETO" R="[$REMOTO]" awk '
  /^\[/ { if (en) { if (!vi) print "client_id = " ENVIRON["ID"]; if (!vs) print "client_secret = " ENVIRON["SECRETO"] } en = ($0 == ENVIRON["R"]) }
  en && /^client_id *=/ { print "client_id = " ENVIRON["ID"]; vi = 1; next }
  en && /^client_secret *=/ { print "client_secret = " ENVIRON["SECRETO"]; vs = 1; next }
  { print }
  END { if (en) { if (!vi) print "client_id = " ENVIRON["ID"]; if (!vs) print "client_secret = " ENVIRON["SECRETO"] } }
' "$COPIA" > "$CONF.nuevo" || volver
cat "$CONF.nuevo" > "$CONF"; rm -f "$CONF.nuevo"

echo
echo "Ahora rclone te va a dar un enlace http://127.0.0.1:53682/... : abrilo en el navegador de esta compu"
echo "y entrá con la cuenta del Drive del respaldo. Si Google avisa que la app no está verificada:"
echo "Avanzado -> Ir a (la app) -> Permitir. A las preguntas de rclone: 'y' para usar el navegador"
echo "y 'n' a lo de Shared Drive."
echo
rclone config reconnect "$REMOTO:" --config "$CONF" || volver
rclone lsd "$REMOTO:" --config "$CONF" --max-depth 1 >/dev/null 2>&1 || volver
echo
echo "Listo: el respaldo ya usa tu propio permiso de Google."
[ $SUBIDA = 0 ] || arrancar
