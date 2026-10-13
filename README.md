# Puente Discord ↔ Haven

Herramientas para **migrar una comunidad de Discord a [Haven](https://github.com/ancsemi/Haven)** sin cortar con Discord: las dos plataformas funcionan a la vez, en tiempo real y con la identidad de cada persona verificada. Funcionan sobre Haven 4.21 y 4.22 **sin modificar sus archivos** (salvo tres parches pequeños, explicados abajo).

> **English summary for Haven developers:** a Discord ↔ Haven bridge that runs inside the Haven process. It hooks `initFerry` through a `--require` preload to reach the same `db` and `io`, so no core files are touched. It adds live two-way relay (including threads, edits and deletes), Discord account linking via OAuth2 `identify`, unforgeable verified identity on relayed messages, channel access mirrored from Discord permissions, Discord-based password recovery, full-history sync and member counter channels. See the issues on ancsemi/Haven for the bugs and proposals that came out of this work.

## Qué hace

| Parte | Archivo | Descripción |
|---|---|---|
| Puente en tiempo real | `tools/puente/puente.js` | Discord → Haven por el gateway de Discord, y Haven → Discord con un webhook por canal. Pasa mensajes, respuestas, hilos, ediciones y borrados, y guarda el ID de Discord de cada mensaje, así que nunca duplica. |
| Vinculación de cuentas | `tools/puente/vincular.js` | Botón "Conectar con Discord" (OAuth2, solo el permiso `identify`). Al vincular, el historial de esa persona en Discord pasa a su cuenta de Haven. Una cuenta de Discord solo puede vincularse a una de Haven. |
| Identidad verificada | `tools/puente/puente.js` | En Discord, los mensajes de cuentas vinculadas salen con su nombre y avatar de Discord y la línea `✅ desde Haven · @usuario` (el texto se cambia con `PUENTE_FIRMA`), una mención real que no notifica a nadie. Las menciones escritas a mano se convierten en texto, así que la línea no se puede falsificar. Las cuentas sin vincular salen como "Nombre (Haven, sin verificar)", o no salen. |
| Accesos según Discord | `tools/puente/accesos.js` | En modo migración, cada cuenta vinculada ve exactamente los canales que ve en Discord, con el mismo cálculo de permisos que usa Discord (roles y permisos por canal). Se actualiza en vivo con los cambios de roles, expulsiones y baneos. Bloquea la entrada por código a esos canales. |
| Recuperar contraseña con Discord | `tools/puente/vincular.js` | Haven no tiene recuperación por email. Quien tiene la cuenta vinculada puede poner una contraseña nueva iniciando sesión con Discord. Por seguridad no se permite para administradores ni para cuentas con verificación en dos pasos. |
| Aviso dentro de Haven | `tools/puente/web/` | Muestra "Vinculá tu cuenta de Discord" en la aplicación y "¿Olvidaste tu contraseña?" en la pantalla de inicio de sesión. |
| Contadores | `tools/puente/estadisticas.js` | Canales "👥 haven-N" y "🔗 vinculados-N". También copia en vivo los nombres de los canales de Discord, por ejemplo los contadores de miembros. |
| Reenvíos y avatares | `tools/puente/adjuntos.js` | Los mensajes reenviados en Discord se muestran como "↪ Reenviado" con el texto citado y sus adjuntos. Al vincular la cuenta, si no tiene avatar en Haven, se usa el de Discord. |
| Sincronización completa | `tools/sincronizar-discord.js` | Importa todo el historial (canales, hilos y foros, con categorías y orden) y luego trae solo lo nuevo, cada 10 minutos, como respaldo del puente. Guarda de a 100 mensajes, así que gasta poca memoria. |
| Menciones | `tools/puente/adjuntos.js`, `tools/menciones-discord.js` | Las menciones de Discord (`<@id>`, `<#id>`, `<@&id>`) se muestran como `@usuario` de Haven si la cuenta está vinculada, `@Nombre` si no, `#canal` y `@rol`. El puente lo hace con los mensajes nuevos; el script, una vez, con el historial importado (guarda el texto original para poder deshacerlo). |
| Hilos de la importación oficial | `tools/hilos-discord.js` | Convierte en hilos de verdad los canales sueltos que crea el importador de Haven, y marca como privados los canales que eran privados en Discord. |
| Copias de seguridad | `tools/backup.sh` | Copia diaria de la base de datos (consistente aunque Haven esté funcionando) y de la configuración, subida con rclone. |

## Tema Discord+ (`theme/`)

Un tema de archivo de Haven con colores, tipografía y disposición parecidos a Discord. Solo cambia el aspecto: canales sin cursiva y con letra Inter, categorías sin recuadro, respuestas con línea curva, mensajes sin separadores, etiquetas DISCORD discretas, sin código de canal ni avisos de apps en la barra superior. Con la preferencia de Haven **barra compacta**, la barra de escribir queda con el **+** a la izquierda y GIF y emoji a la derecha. En el celular, el menú lateral queda como el de la app de Discord: la tarjeta del usuario abajo, sin la sección "Servidores" ni la barra de estado.

La app de Android de Haven (Google Play) es nativa y no usa temas. Para tener el tema en el celular, la página se instala como app desde Chrome ("Instalar app"); con `PUENTE_TITULO` configurado, esa app lleva el nombre elegido, el icono del servidor y los colores del tema (`tools/puente/instalable.js`). En ese caso, los carteles de bienvenida de Haven que recomiendan su app de Android y la de PC se reemplazan por uno propio para instalar esta app, en la PC y en el celular (`tools/puente/web/instalar.js`).

Con `PUENTE_TEMA_FIJO=1`, todos ven siempre el tema por defecto del servidor y no se puede elegir otro: se ocultan el botón de temas, la barra de temas del inicio de sesión y la lista de temas en Configuración (`tools/puente/tema-fijo.js`). El admin lo sigue cambiando para todos desde **Settings → Server Branding**.

Al entrar se abre el último canal que se usó en ese navegador, en vez de la pantalla de bienvenida de Haven; la primera vez, el primero de `PUENTE_CANAL_INICIO` que la persona puede ver (por ejemplo `general,bienvenida`).

Instalación: copiar `theme/discord-plus.theme.css` a `/opt/haven/tema/` y descargar allí la fuente Inter (OFL) de [Fontsource](https://fontsource.org/fonts/inter): `inter-latin-wght-normal.woff2` e `inter-latin-ext-wght-normal.woff2`. Están montados en `deploy/docker-compose.yml`. Después, en Haven: publicar el tema y elegirlo; y en **Settings → Server Branding**, compartirlo, junto con la barra compacta, como valor por defecto para los miembros.

## Parches a Haven (`patches/`)

- `app-discord-import.js`: corrige el error "t is not a function" al listar canales con hilos en *Import Discord History*.
- `import.js`: la importación de Discord lee 4 canales a la vez.
- `import-timeout.js`: evita que la importación se corte a los 2 minutos. Solo afecta a `/api/import/discord/*`.

Están reportados o propuestos en el repositorio de Haven. Cuando Haven los incorpore, basta con quitar las líneas de `deploy/docker-compose.yml`.

## Instalación (resumen)

Requisitos: un servidor Linux con Docker, un dominio y una aplicación de Discord con su bot. En el [Developer Portal](https://discord.com/developers/applications):
- **Bot:** activar **Message Content Intent** y **Server Members Intent**, y desactivar **Public Bot**.
- **OAuth2 → Redirects:** añadir `https://TU-DOMINIO/puente/discord/callback`.
- **Invitar el bot** con permisos de Ver canales, Leer el historial, Enviar mensajes, Gestionar webhooks, Crear hilos públicos y Enviar mensajes en hilos.

Pasos:
1. Copiar el contenido de este repositorio a `/opt/haven`. Copiar `deploy/docker-compose.yml` y `deploy/Caddyfile` a `/opt/haven`, y poner tu dominio en el Caddyfile.
2. Crear `/opt/haven/.env` a partir de `deploy/env.example`.
3. `docker compose up -d`. Registrar tu cuenta de admin en Haven y, en **Settings → Ferry**, pegar el token del bot. **Ferry tiene que quedar apagado**, porque el puente lo reemplaza.
4. Guardar el *Client Secret* de OAuth2 con `sudo tools/guardar-secreto.sh` y reiniciar: `docker compose up -d`.
5. Instalar los temporizadores: copiar `deploy/systemd/*` a `/etc/systemd/system/` y ejecutar `systemctl enable --now haven-sync.timer haven-hilos.timer haven-backup.timer`. Para la copia de seguridad hace falta configurar un remoto de rclone en `tools/rclone.conf`.
6. La primera sincronización importa todo el historial. Se puede lanzar a mano con `systemctl start haven-sync.service` y seguir en `tools/sincronizacion.log`.

Los mensajes importados se guardan a nombre de un usuario técnico `discord-historial` (sin permisos ni contraseña). Hay que crearlo en la tabla `users` antes de la primera importación: así los mensajes no salen con la etiqueta del admin y el conteo de no leídos sigue siendo rápido.

## Limitaciones conocidas

- Los adjuntos de Discord se importan como enlaces a Discord, y esos enlaces caducan con el tiempo.
- En Discord, lo que se envía desde Haven lleva la etiqueta "APP" de los webhooks. Discord no permite publicar como la cuenta real de un usuario.
- Los hilos privados de Discord no se puentean.
- La sincronización no aplica las ediciones o borrados que se hicieron en Discord mientras el puente estaba apagado.

## Licencia

[AGPL-3.0](LICENSE), igual que Haven. Si ofrecés una versión modificada de Haven a otras personas, la licencia te pide poner a su disposición el código de esas modificaciones. Este repositorio sirve justamente para eso.
