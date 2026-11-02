# GlobalSiege (antes MissionRisk) en la sección Juegos

GlobalSiege es el juego de Doug Burner que antes se llamó MissionRisk (1998-2002, y "Misión Riesgo"
en castellano). En 2014 lo liberó como software libre bajo la **GNU GPL v3** ([LICENCIA-GPL3.txt](LICENCIA-GPL3.txt)).
El código original, en Visual Basic 6, está en https://github.com/labarks/globalsiege (copia del
repositorio original `eldougo/globalsiege`, también guardado en Software Heritage).

Lo que está acá es una adaptación para jugarlo en la web, de 2 a 6 ejércitos, con gente del chat y
con la compu. Los archivos que salen del juego original siguen bajo la GPL v3:

- `tools/puente/misionrisk-motor.js`: las reglas del original (el juego de fábrica, `Default War.mrk`)
  y una compu con las mismas ideas que la del original.
- `tools/puente/misionrisk.js`: las partidas en el servidor.
- `tools/puente/web/misionrisk/`: la pantalla (`juego.js`, `juego.css`), los datos del mapa (`mapa.js`)
  y el arte del mapa (`mapa.jpg`, `paises.png`, `tapa.jpg`).
- `armar-arte.js`: saca el arte del mapa del código original (`Mask4.frx`).
- `probar-motor.js`: juega cientos de partidas entre compus y revisa que no se rompa nada.

Las cartas y los dados son dibujos nuevos: los del original usan imágenes de soldaditos de John
O'Brien, que no están claramente incluidas en la licencia.

"Risk" es una marca de Hasbro; GlobalSiege no tiene relación con Hasbro ni con Parker Brothers.

## Rehacer el arte

```
npm install jpeg-js pngjs
node armar-arte.js <carpeta source del original> <salida>
```

Copiar `mapa.jpg`, `paises.png` y `tapa.jpg` a `tools/puente/web/misionrisk/`, y `enlace.jpg` al
servidor como `tools/puente/web/tapas/globalsiege.jpg` (la vista previa de `/app?juegos=globalsiege`).
