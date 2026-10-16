# Puente Discord ↔ Haven

Herramientas para **migrar una comunidad de Discord a [Haven](https://github.com/ancsemi/Haven)** sin cortar con Discord: las dos plataformas funcionan a la vez, en tiempo real y con la identidad de cada persona verificada. Funcionan sobre Haven 4.24 **sin modificar sus archivos** (salvo un parche pequeño, explicado abajo).

> **English summary for Haven developers:** a Discord ↔ Haven bridge that runs inside the Haven process. It hooks `initFerry` through a `--require` preload to reach the same `db` and `io`, so no core files are touched. It adds live two-way relay (including threads, edits and deletes), Discord account linking via OAuth2 `identify`, unforgeable verified identity on relayed messages, channel access mirrored from Discord permissions, Discord-based password recovery, full-history sync and member counter channels. See the issues on ancsemi/Haven for the bugs and proposals that came out of this work.

## Qué hace

| Parte | Archivo | Descripción |
|---|---|---|
| Puente en tiempo real | `tools/puente/puente.js` | Discord → Haven por el gateway de Discord, y Haven → Discord con un webhook por canal. Pasa mensajes, respuestas, hilos, ediciones y borrados (un mensaje de Discord que alguien borra en Haven también se borra en Discord; el bot necesita "Gestionar mensajes"), y guarda el ID de Discord de cada mensaje, así que nunca duplica. |
| Entrar con Discord | `tools/puente/vincular.js`, `tools/puente/web/entrar.*`, `tools/puente/web/login.js` | Botón "Entrar con Discord" (y "Crear cuenta con Discord") en la pantalla de inicio. Si ese Discord ya está vinculado, entra con un clic; si no, se crea la cuenta en un paso (con el registro de Haven: elegir el usuario, aceptar las condiciones), queda vinculada, con su historial, su foto y su email de Discord ya confirmado. Los administradores y las cuentas con verificación en dos pasos entran con contraseña. La sesión pasa por un código de un solo uso, nunca por la URL. |
| Vinculación de cuentas | `tools/puente/vincular.js` | Botón "Conectar con Discord" (OAuth2, solo el permiso `identify`). Al vincular, el historial de esa persona en Discord pasa a su cuenta de Haven. Una cuenta de Discord solo puede vincularse a una de Haven. |
| Identidad verificada | `tools/puente/puente.js` | En Discord, los mensajes de cuentas vinculadas salen con su nombre y avatar de Discord y la línea `✅ desde Haven · @usuario` (el texto se cambia con `PUENTE_FIRMA`), una mención real que no notifica a nadie. Las menciones escritas a mano se convierten en texto, así que la línea no se puede falsificar. Las cuentas sin vincular salen como "Nombre (Haven, sin verificar)", o no salen. |
| Accesos según Discord | `tools/puente/accesos.js` | En modo migración, cada cuenta vinculada ve exactamente los canales que ve en Discord, con el mismo cálculo de permisos que usa Discord (roles y permisos por canal). También copia quién puede escribir, escribir en hilos, reaccionar y adjuntar archivos en cada canal: Haven rechaza lo que Discord no permitiría y el cuadro de escribir avisa "No tenés permiso para enviar mensajes en este canal". Se actualiza en vivo con los cambios de roles, expulsiones y baneos. Bloquea la entrada por código a esos canales. |
| Recuperar contraseña con Discord | `tools/puente/vincular.js` | Haven no trae recuperación por email (ver la fila siguiente). Quien tiene la cuenta vinculada puede poner una contraseña nueva iniciando sesión con Discord. Por seguridad no se permite para administradores ni para cuentas con verificación en dos pasos. |
| Email de recuperación | `tools/puente/email.js` | Con `PUENTE_RESEND_KEY` (una clave de [Resend](https://resend.com) con permiso solo de envío) y `PUENTE_EMAIL_DE` (el remitente, con un dominio verificado en Resend): el registro pide un email obligatorio y manda un mail para confirmarlo; quien ya tiene cuenta ve un cartel para agregarlo (escrito a mano o el de su cuenta de Discord, que ya viene confirmado), y "¿Olvidaste tu contraseña?" manda un enlace de un solo uso que vale 1 hora. Igual que la recuperación con Discord, no vale para administradores ni cuentas con verificación en dos pasos. Con `PUENTE_EMAIL_OBLIGATORIO=1`, quien todavía no tiene email (salvo los invitados) no puede cerrar el cartel sin poner uno. Los emails quedan solo en la base de datos. |
| Aviso dentro de Haven | `tools/puente/web/` | Muestra "Vinculá tu cuenta de Discord" en la aplicación y "¿Olvidaste tu contraseña?" en la pantalla de inicio de sesión. |
| Contadores | `tools/puente/estadisticas.js` | Canales "👥 haven-N" y "🔗 vinculados-N". También copia en vivo los nombres de los canales de Discord, por ejemplo los contadores de miembros. |
| Reenvíos y avatares | `tools/puente/adjuntos.js` | Los mensajes reenviados en Discord se muestran como "↪ Reenviado" con el texto citado y sus adjuntos. Al vincular la cuenta, si no tiene avatar en Haven, se usa el de Discord. |
| Nombres como en Discord | `tools/puente/cargar.js`, `tools/puente/web/aviso.js` | Haven solo acepta nombres para mostrar de 2 a 20 caracteres con letras, números, espacios y "_". Acá se aceptan los mismos que en Discord: de 1 a 32 caracteres, cualquiera (sin caracteres de control), también al cambiarlo en "Editar perfil". Haven los muestra siempre como texto (se probó con nombres que llevan HTML). |
| Vistas previas como en Discord | `tools/puente/embeds.js`, `tools/puente/web/aviso.js` | El puente guarda el embed que arma Discord para cada enlace (llega con el mensaje o enseguida, de los dos lados; los mensajes viejos se le piden a Discord una vez) y CV Chat lo dibuja igual que Discord, al instante, en vez de buscar cada enlace en internet. Donde no hay embed de Discord queda la vista previa de Haven. |
| Imágenes livianas | `tools/puente/miniaturas.js` | En el chat, las fotos se ven en una versión reducida (WebP de hasta 960 px, hecha con [sharp](https://sharp.pixelplumbing.com/)); al abrirlas o descargarlas, la original. Hay que instalar sharp una vez en `tools/puente/vendor` (ver el comentario del archivo); sin sharp se usan las originales. |
| Enlaces a mensajes | `tools/puente/enlaces.js`, `tools/puente/web/aviso.js` | "Copiar enlace del mensaje" en el menú del mensaje (PC y celular), en todos los canales. Tocar un enlace a un mensaje o canal, de CV Chat o de Discord, lo abre en CV Chat mismo (también dentro de un hilo), y esos enlaces se ven como "#canal › mensaje", como en Discord. Al pasar a Discord, el puente cambia los enlaces de CV Chat por los del mismo mensaje en Discord. |
| Un nombre por persona | `tools/puente/nombres.js`, `tools/nombres-vinculados.js` | En las cuentas vinculadas, el nombre que se ve en CV Chat es el nombre para mostrar de Discord, exacto (emojis, puntos y símbolos incluidos), salvo que la persona se haya puesto uno propio en CV Chat. Todos sus mensajes, también los que escribió en Discord, se ven con ese nombre, como en Discord. Si cambia su nombre en Discord, se actualiza. El script lo aplica una vez a las cuentas que ya estaban vinculadas (con `--aplicar`; sin eso solo muestra lo que haría). |
| Stickers | `tools/puente/stickers.js` | Copia los stickers del servidor de Discord a los de Haven (un paquete con el nombre del servidor) al conectarse y cada 6 horas: los nuevos se agregan, los renombrados se renombran y los borrados salen del selector. Un sticker mandado en Discord se ve como sticker en Haven (antes ese mensaje no llegaba, porque no tenía texto). |
| Sincronización completa | `tools/sincronizar-discord.js` | Importa todo el historial (canales, hilos y foros, con categorías y orden) y luego trae solo lo nuevo, cada 10 minutos, como respaldo del puente. Guarda de a 100 mensajes, así que gasta poca memoria. |
| Menciones | `tools/puente/adjuntos.js`, `tools/menciones-discord.js` | Las menciones de Discord (`<@id>`, `<#id>`, `<@&id>`) se muestran como `@usuario` de Haven si la cuenta está vinculada, `@Nombre` si no, `#canal` y `@rol`. El puente lo hace con los mensajes nuevos; el script, una vez, con el historial importado (guarda el texto original para poder deshacerlo). |
| Hilos de la importación oficial | `tools/hilos-discord.js` | Convierte en hilos de verdad los canales sueltos que crea el importador de Haven, y marca como privados los canales que eran privados en Discord. |
| Control de accesos | `tools/auditoria-accesos.js` | Una vez al día recalcula con los datos de Discord quién puede ver cada canal y lo compara con Haven: avisa en el canal de admins si un canal de Discord es público, si hay alguien sin vincular adentro o si alguien ve un canal que en Discord no puede ver. |
| Copias de seguridad | `tools/backup.sh` | Copia diaria de la base de datos (consistente aunque Haven esté funcionando) y de la configuración, subida con rclone. |

## Tema Discord+ (`theme/`)

Un tema de archivo de Haven con colores, tipografía y disposición parecidos a Discord. Solo cambia el aspecto: canales sin cursiva y con letra Inter, categorías sin recuadro, respuestas con línea curva, mensajes sin separadores, etiquetas DISCORD discretas, sin código de canal ni avisos de apps en la barra superior. Con la preferencia de Haven **barra compacta**, la barra de escribir queda con el **+** a la izquierda y GIF y emoji a la derecha. En el celular, el menú lateral queda como el de la app de Discord: la tarjeta del usuario abajo, sin la sección "Servidores" ni la barra de estado.

La app de Android de Haven (Google Play) es nativa y no usa temas. Para tener el tema en el celular, la página se instala como app desde Chrome ("Instalar app"); con `PUENTE_TITULO` configurado, esa app lleva el nombre elegido, el icono del servidor y los colores del tema (`tools/puente/instalable.js`). En ese caso, los carteles de bienvenida de Haven que recomiendan su app de Android y la de PC se reemplazan por uno propio para instalar esta app, en la PC y en el celular (`tools/puente/web/instalar.js`).

Con `PUENTE_TEMA_FIJO=1`, todos ven siempre el tema por defecto del servidor y no se puede elegir otro: se ocultan el botón de temas, la barra de temas del inicio de sesión y la lista de temas en Configuración (`tools/puente/tema-fijo.js`). El admin lo sigue cambiando para todos desde **Settings → Server Branding**. Además, las opciones de diseño de Configuración (disposición, densidad, accesibilidad, iconos, imágenes...) quedan solo para los administradores, y lo que elige un administrador se aplica a todos, por separado en la PC y en pantallas táctiles.

Al entrar se abre el último canal que se usó en ese navegador, en vez de la pantalla de bienvenida de Haven; la primera vez, el primero de `PUENTE_CANAL_INICIO` que la persona puede ver (por ejemplo `general,bienvenida`).

Instalación: copiar `theme/discord-plus.theme.css` a `/opt/haven/tema/` y descargar allí la fuente Inter (OFL) de [Fontsource](https://fontsource.org/fonts/inter): `inter-latin-wght-normal.woff2` e `inter-latin-ext-wght-normal.woff2`. Están montados en `deploy/docker-compose.yml`. Después, en Haven: publicar el tema y elegirlo; y en **Settings → Server Branding**, compartirlo, junto con la barra compacta, como valor por defecto para los miembros.

## Parches a Haven (`patches/`)

- `import-timeout.js`: evita que la importación se corte a los 2 minutos. Solo afecta a `/api/import/discord/*`.

Los parches anteriores del importador (canales con hilos y leer 4 canales a la vez) ya vienen en Haven 4.23.

**Al pasar de Haven 4.22 a 4.23:** antes de arrancar la 4.23 por primera vez hay que guardar `import_authors_cleared = 1` en la tabla `server_settings`. Esa migración de Haven le quita el dueño a todos los mensajes importados de Discord, y acá son del usuario `discord-historial` a propósito (de eso dependen la vinculación de cuentas y las reacciones de la gente sin vincular).

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
