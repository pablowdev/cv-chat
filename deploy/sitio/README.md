# La web (circulovicioso.club)

Fuente de la web en `fuente/` (paginas, estilos y scripts; las fotos y fuentes tipograficas no estan en el repositorio). `node fuente/armar.js <salida>` arma las paginas con la misma cabecera y pie. Se sirve con un Caddy chico de solo lectura (`Caddyfile`): la wiki es una sola pagina para todas sus direcciones (la llena `tools/puente/web/wiki.js`) y "Mi cuenta" (`/cuenta`) usa la cuenta unica (`tools/puente/cuenta.js`).

Vistas previas de los enlaces: cada pagina tiene su imagen (`imagen` en `paginas/paginas.js`, la arma `tools/puente/vistas.js` en el chat). Las entradas y categorias de la wiki (`/wiki/*`, `/wiki-categorias/*`) pasan por el chat en el Caddy principal (`handle` con `rewrite * /puente/vista/pagina{path}` hacia `haven:3000`), que devuelve `wiki.html` con el titulo y la imagen de esa entrada; si el chat no contesta, `handle_response` y `handle_errors` dan `wiki.html` tal cual.
