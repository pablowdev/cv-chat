# Apps de CV Chat (Android y Windows)

Las dos son una ventana propia que abre la página de CV Chat (`/app`), así que se actualizan
solas con cada cambio del servidor y no hace falta reinstalarlas. Se descargan desde
`/puente/descargar` (sin tiendas). En iPhone y iPad se instala desde Safari ("Agregar a inicio").

Las imágenes (íconos) y la clave de firma son propias de cada servidor y no están acá.

## Windows (`windows/`)

Electron con instalador NSIS (`CV-Chat-Windows.exe`). Cerrar la ventana la deja junto al reloj.

1. Poner el ícono de 512×512 en `windows/build/icon.png`.
2. `npm install` y `npm run armar`. El instalador queda en `windows/dist/`.

## Android (`android/`)

Trusted Web Activity (androidbrowserhelper): la página a pantalla completa, con sus notificaciones.

1. Poner los íconos en `app/src/main/res/mipmap-*/ic_launcher.png` (y `ic_launcher_foreground.png`, el logo al 80% sobre 108dp para el ícono adaptable) y el de la pantalla de
   carga en `app/src/main/res/drawable/splash.png`.
2. Crear la clave: `keytool -genkeypair -keystore cvchat.keystore -alias cvchat -keyalg RSA -validity 36500`
   y un `firma.properties` al lado de `build.gradle` (raíz) con `archivo=`, `alias=` y `clave=`.
   **Guardar la clave**: sin ella no se pueden publicar versiones nuevas que actualicen la instalada.
3. `local.properties` con `sdk.dir=` (el SDK de Android) y `gradle assembleRelease` (Java 17).
4. En el servidor, `PUENTE_ANDROID_PAQUETE` y `PUENTE_ANDROID_SHA256` (la huella SHA-256 del
   certificado, de `keytool -list -v`): con eso `/.well-known/assetlinks.json` deja abrir la
   página sin la barra del navegador.

Para publicar una versión nueva: subir `versionCode`/`versionName` (Android) o `version`
(Windows), armar, copiar el archivo a `tools/puente/web/descargas/` como `CV-Chat-Android.apk`
o `CV-Chat-Windows.exe` y actualizar `tools/puente/web/descargas/versiones.json`.
