# Foro (vBulletin) en el mismo servidor, aislado de CV Chat

Va en `/opt/foro`, con su propio `docker compose` (proyecto `foro`):

- **web** (`imagen/`): PHP 8.2 + Apache, para que las `.htaccess` de vBulletin funcionen tal cual.
  - El código (`codigo/`, el `upload/` del paquete de vBulletin) se monta de solo lectura.
  - Solo se puede escribir en `escribible/cache` y `escribible/core-cache`.
  - PHP no puede ejecutar comandos (`disable_functions`).
  - En las carpetas de imágenes, archivos y cachés no se ejecuta PHP.
- **db**: MariaDB.
- **correo**: Postfix que reenvía a Resend, el mismo servicio de CV Chat, con la clave de solo envío.
  - El foro le manda por SMTP sin contraseña (`smtp_host` = `foro-correo`, puerto 25, sin TLS).
  - La clave queda en este contenedor, no en el foro.

Redes:

- `foro-frente` (sin salida a internet): Caddy ↔ web.
- `foro-datos` (sin salida): web ↔ db ↔ correo.
- `foro-salida`: solo el correo.
- El foro no puede salir a internet ni llegar a CV Chat.

`.env` (solo root): `MARIADB_ROOT_PASSWORD`, `MARIADB_PASSWORD` y `RELAYHOST_PASSWORD` (la clave de Resend).

## Entrar a CV Chat con la cuenta del foro

`cvchat.php` va en `codigo/` (junto a `index.php`). Es el puente de `tools/puente/foro.js`: pide
iniciar sesión en el foro si hace falta, pregunta si se quiere seguir y vuelve a CV Chat con quién es,
firmado. Lee `puente.env` (solo root, solo para `web`):

```
CV_PUENTE_SECRETO=<la misma que FORO_PUENTE_SECRETO de CV Chat>
CV_CHAT_URL=https://chat.ejemplo.com
```

Al actualizar vBulletin, `cvchat.php` queda (no viene en el paquete).

La barra de arriba de Círculo Vicioso (la de la web, `tools/puente/web/barra.*`) la agrega Apache a cada
página del foro (`imagen/apache-foro.conf`, con `mod_substitute`), menos a los paneles de control: no hace
falta tocar las plantillas de vBulletin.

En el Caddy de CV Chat: el servicio `caddy` también en la red `foro-frente` (externa) y un bloque para el
foro que además corta las direcciones de los ataques conocidos a vBulletin 5 (el foro ya trae el arreglo; es una
traba más):

```
foro.ejemplo.com {
	@ataque expression {uri}.matches("(?i)replaceAdTemplate|widget_php")
	respond @ataque 403
	reverse_proxy foro-web:80
}
```

El lector (`lector/`, para CV Chat) entra a la base con un usuario que solo puede leer lo que necesita:

```
GRANT SELECT ON foro.node TO lector; GRANT SELECT ON foro.closure TO lector; GRANT SELECT ON foro.text TO lector;
GRANT SELECT ON foro.permission TO lector; GRANT SELECT (visible, userid, dateline) ON foro.customavatar TO lector;
GRANT SELECT (routeid, prefix, contentid, class, redirect301) ON foro.routenew TO lector;
GRANT SELECT (userid, username, posts, joindate) ON foro.user TO lector;
```

El sitio principal (`../sitio`) son páginas fijas servidas por un Caddy chico de solo lectura en la misma
red `foro-frente`.

## El estilo "Círculo Vicioso"

El foro usa un estilo propio (`estilo/`), hijo del Dark con el logo del club, con los colores y las letras
de la web: fondo bordó oscuro, crema, rosa, Space Mono en menús y botones, la serif Redaction en los
títulos e Inter en los mensajes. Es un estilo normal de vBulletin: se cambia desde el panel (Estilos →
Administrador de estilos → Círculo Vicioso). Casi todo sale de la paleta (variables `global_palette_*`);
lo que las variables no alcanzan está en la plantilla `css_additional.css`.

- `estilo-cv.xml`: el estilo, como lo exporta el panel (Estilos → Descargar/Subir). Se puede subir desde ahí.
- `generar.php`: lo arma desde el Dark (le pasa los colores a la paleta de la web) y los dos `.css`.
- `instalar.php`: lo sube como el estilo "Círculo Vicioso" (o lo pisa si ya está) y rehace las hojas de estilo.
  Con `--predeterminado` queda como el de todos; con `--volver` vuelve el Dark (el estilo nuevo queda, sin usar).

Se corren montando la carpeta en `/estilo`, como el actualizador de abajo (sin `:ro` para `generar.php`):

```
docker run --rm --network foro-datos --user 33:33 -v /opt/foro/codigo:/var/www/html:ro \
  -v /opt/foro/escribible/cache:/var/www/html/cache -v /opt/foro/escribible/core-cache:/var/www/html/core/cache \
  -v /ruta/a/estilo:/estilo:ro -w /var/www/html/core foro-web:local php /estilo/instalar.php --predeterminado /estilo
```

La serif viene de `circulovicioso.club/fonts`, que por eso deja que el foro la use (`../sitio/Caddyfile`).
Si se cambia el estilo desde el panel, conviene volver a exportarlo a `estilo-cv.xml`.

`ajustes.php` (se corre igual, despues de `instalar.php`) deja el foro como esta hoy, con las mismas funciones que usa
el panel, asi todo se ve y se cambia desde ahi: un solo estilo y un solo idioma, el menu sin Blogs, Articulos,
Grupos ni Calendario, los ultimos temas arriba en la portada, "Varios" con los foros de menos movimiento (sus
direcciones no cambian) y textos que estaban en ingles en castellano. Se puede correr mas de una vez.

## Actualizar vBulletin

1. Copiar el `upload/` del paquete nuevo en `codigo/`, sin pisar `config.php` ni `core/includes/config.php`.
2. Correr el actualizador como el usuario del servidor web:

   ```
   docker run --rm --network foro-datos --user 33:33 -v /opt/foro/codigo:/var/www/html:ro \
     -v /opt/foro/escribible/cache:/var/www/html/cache -v /opt/foro/escribible/core-cache:/var/www/html/core/cache \
     -w /var/www/html/core/install foro-web:local sh -c '(echo 2; yes "") | php upgrade.php'
   ```

   (El `2` es para seguir aunque avise que hay archivos propios del foro, como los emojis.)

Si se cambian opciones directo en la tabla `setting`, `herramientas/rehacer-opciones.php` hace que
vBulletin las vuelva a leer (montando `herramientas/` en `/herramientas`).

La copia diaria (`tools/backup.sh`) incluye la base del foro y `/opt/foro` + `/opt/sitio`.
