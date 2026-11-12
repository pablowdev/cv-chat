#!/bin/sh
# Copia de seguridad diaria de Haven, subida con rclone (por ejemplo a Google Drive).
# BACKUP_REMOTE: destino rclone (por defecto gdrive:Haven-backups).
#  - Base de datos: copia en caliente con la API de backup de SQLite (consistente
#    aunque Haven este funcionando), comprimida con zstd.
#  - Configuracion: docker-compose.yml, Caddyfile, .env, parches, herramientas,
#    certificados de Caddy y archivos subidos a Haven.
#  - Foro (/opt/foro, vBulletin) y sitio principal (/opt/sitio), si estan en este
#    servidor: la base del foro en caliente (mariadb-dump) y su configuracion y codigo.
# Guarda las 3 ultimas en el servidor y 30 dias en Google Drive.
# Ademas, todos los archivos subidos (uploads/, con el historial de Discord) van a
# <remoto>/uploads y se suman cada noche solo los nuevos: rclone copy, que nunca borra
# alla lo que ya subio. La primera vez son unos 70 GB.
# Como salio la ultima copia: haven-data/puente-respaldo.json ({ ok, fecha, error }).
set -eu
umask 077
cd /opt/haven
STAMP=$(date -u +%Y-%m-%d_%H%M)
# (personal2: el Drive personal con el cliente de Google del club, que no comparte el limite con todos
# los que usan rclone; personal:CV-respaldo es la carpeta de antes, con el cliente de rclone)
REMOTE=${BACKUP_REMOTE:-personal2:CV-respaldo-2}
ESTADO=/opt/haven/haven-data/puente-respaldo.json
# Si algo falla, queda anotado (el estado se pisa con "ok" al final)
trap 'r=$?; [ $r -eq 0 ] || printf "{\"ok\":false,\"fecha\":\"%s\",\"error\":\"la copia termino con error %s (ver tools/backup.log)\"}\n" "$(date -u +%FT%TZ)" "$r" > "$ESTADO"; chmod 644 "$ESTADO" 2>/dev/null || true' EXIT
OUT=/opt/haven/backup-local
TMPDB=haven-data/backup-en-curso.db

echo "== $(date -u '+%F %T') inicio"
rm -f "$TMPDB"
docker exec -u node haven node -e "require('/app/node_modules/better-sqlite3')('/data/haven.db').backup('/data/backup-en-curso.db').then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})"
zstd -q -T0 -10 --rm "$TMPDB" -o "$OUT/haven-db_$STAMP.db.zst"

tar --zstd -cf "$OUT/haven-config_$STAMP.tar.zst" \
  --exclude='haven-data/haven.db*' --exclude='haven-data/backups' --exclude='haven-data/backup-en-curso.db*' \
  --exclude='haven-data/media-cache' --exclude='haven-data/tmp-restore' --exclude='haven-data/uploads/discord' \
  docker-compose.yml Caddyfile .env patches tools haven-data caddy-data \
  $( [ -d bacity-datos ] && echo bacity-datos bacity.env )  # (BACITY, si esta: las cuentas del juego y su clave)

if [ -f /opt/foro/.env ]; then
  FORO_PWD=$(grep '^MARIADB_ROOT_PASSWORD=' /opt/foro/.env | cut -d= -f2-)
  docker exec -e MYSQL_PWD="$FORO_PWD" foro-db mariadb-dump -uroot --single-transaction --quick --routines --triggers foro > "$OUT/foro-db_$STAMP.sql"
  [ "$(wc -c < "$OUT/foro-db_$STAMP.sql")" -gt 1000000 ] || { echo "la copia del foro salio vacia"; exit 1; }
  zstd -q -T0 -10 --rm "$OUT/foro-db_$STAMP.sql" -o "$OUT/foro-db_$STAMP.sql.zst"
  tar --zstd -cf "$OUT/foro-config_$STAMP.tar.zst" -C /opt --exclude=foro/db --exclude=foro/paquete --exclude=foro/escribible foro sitio
fi

# Mantener solo las 3 copias locales mas recientes de cada tipo
for p in haven-db_ haven-config_ foro-db_ foro-config_; do ls -1t "$OUT"/$p* 2>/dev/null | tail -n +4 | xargs -r rm -f; done

# Sube las copias locales que todavia no estan en Drive (no solo las de hoy): si una noche Google
# no dejo subir alguna, se completa sola la noche siguiente. Si falla, se sigue igual con lo demas
# (la segunda copia sobre todo) y al final queda anotado como error.
ERROR1=""
if ! timeout 1h rclone copy "$OUT" "$REMOTE" --max-depth 1 --include "haven-db_*" --include "haven-config_*" --include "foro-db_*" --include "foro-config_*" \
     --config /opt/haven/tools/rclone.conf --drive-chunk-size 16M --timeout 2m --retries 5; then
  ERROR1="la subida a Drive no termino (Google limito la cantidad de pedidos); lo que falto se sube la noche siguiente"
  echo "!! $ERROR1"
fi
rclone delete "$REMOTE" --min-age 30d --exclude "uploads/**" --config /opt/haven/tools/rclone.conf || echo "!! no pude borrar las copias viejas de Drive"
# Los archivos subidos (fotos, videos, el historial de Discord): solo los que faltan.
# Mientras corre la subida inicial (cv-respaldo-inicial) no: dos copias a la vez duplican archivos en Drive
if systemctl is-active -q cv-respaldo-inicial 2>/dev/null; then
  echo "archivos subidos: los esta copiando la subida inicial"
else
  timeout 80m rclone copy haven-data/uploads "$REMOTE/uploads" --config /opt/haven/tools/rclone.conf \
    --transfers 4 --checkers 8 --bwlimit 12M --drive-chunk-size 16M --timeout 2m --retries 5 --exclude "*.part" \
    || echo "!! los archivos subidos no terminaron de copiarse; siguen la noche siguiente"
fi
# Segunda copia, solo la base de datos y 7 dias, en la cuenta del club (BACKUP_REMOTE2, por defecto
# gdrive:Haven-backups, 15 GB): si falla, la principal ya esta y solo queda anotado
REMOTE2=${BACKUP_REMOTE2:-gdrive:Haven-backups}
AVISO2=""
if ! { timeout 30m rclone copy "$OUT" "$REMOTE2" --include "haven-db_$STAMP.*" --config /opt/haven/tools/rclone.conf --drive-chunk-size 16M --timeout 2m --retries 5 \
       && rclone delete "$REMOTE2" --min-age 7d --config /opt/haven/tools/rclone.conf; }; then
  AVISO2=',"aviso":"la segunda copia (cuenta del club) no se pudo subir"'
fi
if [ -n "$ERROR1" ]; then
  printf '{"ok":false,"fecha":"%s","error":"%s"%s}\n' "$(date -u +%FT%TZ)" "$ERROR1" "$AVISO2" > "$ESTADO"
else
  printf '{"ok":true,"fecha":"%s"%s}\n' "$(date -u +%FT%TZ)" "$AVISO2" > "$ESTADO"
fi
chmod 644 "$ESTADO" # (lo lee el chat, que no corre como root)
echo "== $(date -u '+%F %T') ok: $(du -h "$OUT"/haven-db_$STAMP.db.zst | cut -f1) base de datos, $(du -h "$OUT"/haven-config_$STAMP.tar.zst | cut -f1) configuracion$( [ -f "$OUT/foro-db_$STAMP.sql.zst" ] && echo ", foro $(du -h "$OUT"/foro-db_$STAMP.sql.zst | cut -f1)")"
