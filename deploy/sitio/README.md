# La web (circulovicioso.club)

Páginas fijas exportadas de Webflow, en `/opt/sitio/web` (el contenido de la web no está en este
repositorio), servidas por un Caddy chico de solo lectura (`Caddyfile`):

- Las direcciones de antes sin `.html` siguen andando (`/legal`, `/full-fat-search`...).
- La wiki usa sus páginas para cada entrada (`/wiki/<entrada>` → `detail_wiki.html`) y categoría
  (`/wiki-categorias/<categoría>` → `detail_wiki-categorias.html`); las llena `tools/puente/web/wiki.js`
  con lo que guarda CV Chat (`tools/puente/wiki.js`).

`editar-web.js` hace los cambios a las páginas exportadas (la barra de la cuenta única, la wiki, sin
Memberstack, sin tienda ni Discord en la portada). Si se vuelve a exportar de Webflow:

```
node editar-web.js <carpeta de la web exportada> https://chat.ejemplo.com
```
