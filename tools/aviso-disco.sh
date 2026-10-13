#!/bin/sh
# Aviso de poco espacio en disco: si quedan menos de AVISO_DISCO_GB (20 por
# defecto) libres, publica un mensaje en el canal de Haven AVISO_CANAL
# ("admilinks" por defecto, un canal que solo ven los admins). Como mucho un
# aviso cada 3 dias. Lo ejecuta haven-aviso-disco.timer una vez al dia.
#   AVISO_PRUEBA=1 tools/aviso-disco.sh   -> manda un aviso de prueba ahora
set -eu
UMBRAL_GB=${AVISO_DISCO_GB:-20}
CANAL=${AVISO_CANAL:-admilinks}
STAMP=/opt/haven/tools/.aviso-disco
FREE=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
TOTAL=$(df -BG --output=size / | tail -1 | tr -dc 0-9)

if [ "${AVISO_PRUEBA:-0}" != "1" ]; then
  [ "$FREE" -lt "$UMBRAL_GB" ] || exit 0
  if [ -f "$STAMP" ] && [ $(( $(date +%s) - $(stat -c %Y "$STAMP") )) -lt 259200 ]; then exit 0; fi
fi

docker exec -i -u node -e FREE="$FREE" -e TOTAL="$TOTAL" -e CANAL="$CANAL" -e UMBRAL="$UMBRAL_GB" -e PRUEBA="${AVISO_PRUEBA:-0}" haven node -e '
const db = require("/app/node_modules/better-sqlite3")("/data/haven.db");
db.pragma("busy_timeout = 30000");
const ch = db.prepare("SELECT id FROM channels WHERE name = ? AND is_dm = 0").get(process.env.CANAL);
if (!ch) { console.error("No existe el canal " + process.env.CANAL); process.exit(1); }
const prueba = process.env.PRUEBA === "1" ? " (esto es una prueba)" : "";
const text = "⚠️ **Poco espacio en el servidor**" + prueba + ": quedan **" + process.env.FREE + " GB libres** de " + process.env.TOTAL + " GB" +
  " (el aviso salta por debajo de " + process.env.UMBRAL + " GB).\n" +
  "Opciones: borrar adjuntos viejos de Discord (se pueden volver a bajar), o ampliar el disco en Oracle.";
db.prepare("INSERT INTO messages (channel_id, user_id, content, is_webhook, webhook_username) VALUES (?, NULL, ?, 1, ?)").run(ch.id, text, "Servidor");
console.log("aviso publicado en #" + process.env.CANAL + ": " + process.env.FREE + " GB libres");
'
touch "$STAMP"
