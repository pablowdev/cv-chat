#!/bin/sh
# Copia de seguridad diaria de Haven, subida con rclone (por ejemplo a Google Drive).
# BACKUP_REMOTE: destino rclone (por defecto gdrive:Haven-backups).
#  - Base de datos: copia en caliente con la API de backup de SQLite (consistente
#    aunque Haven este funcionando), comprimida con zstd.
#  - Configuracion: docker-compose.yml, Caddyfile, .env, parches, herramientas,
#    certificados de Caddy y archivos subidos a Haven.
# Guarda las 3 ultimas en el servidor y 14 dias en Google Drive.
set -eu
umask 077
cd /opt/haven
STAMP=$(date -u +%Y-%m-%d_%H%M)
REMOTE=${BACKUP_REMOTE:-gdrive:Haven-backups}
OUT=/opt/haven/backup-local
TMPDB=haven-data/backup-en-curso.db

echo "== $(date -u '+%F %T') inicio"
rm -f "$TMPDB"
docker exec -u node haven node -e "require('/app/node_modules/better-sqlite3')('/data/haven.db').backup('/data/backup-en-curso.db').then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})"
zstd -q -T0 -10 --rm "$TMPDB" -o "$OUT/haven-db_$STAMP.db.zst"

tar --zstd -cf "$OUT/haven-config_$STAMP.tar.zst" \
  --exclude='haven-data/haven.db*' --exclude='haven-data/backups' --exclude='haven-data/backup-en-curso.db*' \
  --exclude='haven-data/media-cache' --exclude='haven-data/tmp-restore' \
  docker-compose.yml Caddyfile .env patches tools haven-data caddy-data

# Mantener solo las 3 copias locales mas recientes de cada tipo
for p in haven-db_ haven-config_; do ls -1t "$OUT"/$p* 2>/dev/null | tail -n +4 | xargs -r rm -f; done

timeout 1h rclone copy "$OUT" "$REMOTE" --include "*_$STAMP.*" --config /opt/haven/tools/rclone.conf --drive-chunk-size 16M --timeout 2m --retries 5
rclone delete "$REMOTE" --min-age 14d --config /opt/haven/tools/rclone.conf
echo "== $(date -u '+%F %T') ok: $(du -h "$OUT"/haven-db_$STAMP.db.zst | cut -f1) base de datos, $(du -h "$OUT"/haven-config_$STAMP.tar.zst | cut -f1) configuracion"
