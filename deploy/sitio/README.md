# La web (circulovicioso.club)

Fuente de la web en `fuente/` (paginas, estilos y scripts; las fotos y fuentes tipograficas no estan en el repositorio). `node fuente/armar.js <salida>` arma las paginas con la misma cabecera y pie. Se sirve con un Caddy chico de solo lectura (`Caddyfile`): la wiki es una sola pagina para todas sus direcciones (la llena `tools/puente/web/wiki.js`) y "Mi cuenta" (`/cuenta`) usa la cuenta unica (`tools/puente/cuenta.js`).
