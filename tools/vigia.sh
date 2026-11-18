#!/bin/sh
# Vigia de afuera: si el chat entero no contesta, Haven no puede mandar sus alertas (tools/puente/alertas.js), asi
# que esto corre en el servidor, fuera de Docker (haven-vigia.timer, cada 5 minutos), y avisa por mail.
#  - Pregunta /puente/api/juegos/registro (una respuesta liviana, sin sesion).
#  - Con 2 fallas seguidas (unos 10 minutos caido) manda "CV Chat no responde"; cuando vuelve, "CV Chat volvio".
#    Un solo mail por caida.
#  - El mail sale por Resend y, si falla, por Brevo (las claves de /opt/haven/.env, como email.js).
#  - A ALERTA_MAIL (en .env), o al mail publico del club si no esta.
#   VIGIA_PRUEBA=1 tools/vigia.sh   -> manda un mail de prueba ahora
set -u
ENV=/opt/haven/.env
ESTADO=/opt/haven/tools/.vigia
val() { grep "^$1=" "$ENV" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
URL=$(val PUBLIC_URL); URL=${URL:-https://chat.circulovicioso.club}
PARA=$(val ALERTA_MAIL); PARA=${PARA:-pablowdev@gmail.com}
DE=$(val PUENTE_EMAIL_DE)
RESEND=$(val PUENTE_RESEND_KEY)
BREVO=$(val PUENTE_BREVO_KEY)

mandar() { # asunto, texto
  cuerpo=$(jq -n --arg de "$DE" --arg para "$PARA" --arg s "$1" --arg t "$2" '{from:$de,to:[$para],subject:$s,text:$t}')
  if [ -n "$RESEND" ] && curl -fsS -m 20 -o /dev/null -X POST https://api.resend.com/emails \
       -H "Authorization: Bearer $RESEND" -H 'Content-Type: application/json' -d "$cuerpo"; then return 0; fi
  if [ -n "$BREVO" ]; then
    nombre=$(printf '%s' "$DE" | sed -n 's/^ *"\{0,1\}\([^"<]*\)"\{0,1\} *<.*$/\1/p'); dir=$(printf '%s' "$DE" | sed -n 's/^.*<\([^>]*\)>.*$/\1/p')
    cuerpo=$(jq -n --arg n "${nombre:-CV Chat}" --arg e "${dir:-$DE}" --arg para "$PARA" --arg s "$1" --arg t "$2" '{sender:{name:$n,email:$e},to:[{email:$para}],subject:$s,textContent:$t}')
    curl -fsS -m 20 -o /dev/null -X POST https://api.brevo.com/v3/smtp/email -H "api-key: $BREVO" -H 'Content-Type: application/json' -d "$cuerpo" && return 0
  fi
  echo "vigia: no pude mandar el mail" >&2; return 1
}

AHORA=$(date -u '+%Y-%m-%d %H:%M UTC')
if [ "${VIGIA_PRUEBA:-0}" = "1" ]; then
  mandar "CV Chat: prueba del vigia" "Esto es una prueba del vigia de CV Chat ($AHORA). Si te llego, cuando el chat deje de contestar te va a llegar un mail como este." && echo "mail de prueba mandado"
  exit 0
fi

FALLAS=0; AVISADO=0
[ -f "$ESTADO" ] && . "$ESTADO"
CODIGO=$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$URL/puente/api/juegos/registro" || true)
if [ "$CODIGO" = "200" ]; then
  if [ "$AVISADO" = "1" ]; then mandar "CV Chat volvio" "CV Chat vuelve a contestar ($AHORA)."; fi
  FALLAS=0; AVISADO=0
else
  FALLAS=$((FALLAS + 1))
  if [ "$FALLAS" -ge 2 ] && [ "$AVISADO" = "0" ]; then
    ESTADO_HAVEN=$(docker inspect haven --format '{{.State.Status}} desde {{.State.StartedAt}}' 2>/dev/null || echo "no se pudo ver")
    if mandar "CV Chat no responde" "CV Chat no contesta desde hace unos 10 minutos ($AHORA; respuesta: ${CODIGO:-ninguna}).
Contenedor haven: $ESTADO_HAVEN.
Para mirar: docker logs --tail 100 haven"; then AVISADO=1; fi
  fi
fi
printf 'FALLAS=%s\nAVISADO=%s\n' "$FALLAS" "$AVISADO" > "$ESTADO"
