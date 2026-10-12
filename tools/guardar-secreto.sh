#!/bin/bash
# Guarda el Client Secret de la aplicacion de Discord en /opt/haven/.env sin mostrarlo.
set -e
read -rsp "Pega el Client Secret de Discord y pulsa Enter: " S; echo
[ -n "$S" ] || { echo "No escribiste nada."; exit 1; }
# Al pegar en algunas terminales el texto se repite: quedarse con una sola copia.
if [ ${#S} -gt 32 ] && [ $(( ${#S} % 32 )) -eq 0 ] && [ "$(printf %s "${S:0:32}" | awk -v n=$(( ${#S} / 32 )) '{for(i=0;i<n;i++) printf "%s", $0}')" = "$S" ]; then S=${S:0:32}; fi
[ ${#S} -eq 32 ] || { echo "El Client Secret de Discord tiene 32 caracteres y pegaste ${#S}. Proba de nuevo."; exit 1; }
case "$S" in *[!A-Za-z0-9_-]*) echo "Eso no parece un Client Secret (solo letras, numeros, - y _)."; exit 1;; esac
grep -v '^DISCORD_CLIENT_SECRET=' /opt/haven/.env > /opt/haven/.env.tmp || true
echo "DISCORD_CLIENT_SECRET=$S" >> /opt/haven/.env.tmp
chmod 600 /opt/haven/.env.tmp && chown ubuntu:ubuntu /opt/haven/.env.tmp && mv /opt/haven/.env.tmp /opt/haven/.env
echo "Guardado. Ya puedes cerrar esta ventana."
