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

En el Caddy de CV Chat: el servicio `caddy` también en la red `foro-frente` (externa) y un bloque
`foro.ejemplo.com { reverse_proxy foro-web:80 }`.

El sitio principal (`../sitio`) son páginas fijas servidas por un Caddy chico de solo lectura en la misma
red `foro-frente`.

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
