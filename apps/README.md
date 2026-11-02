# Apps de CV Chat (Android y Windows)

Las dos son una ventana propia que abre la página de CV Chat (`/app`), así que se actualizan
solas con cada cambio del servidor y no hace falta reinstalarlas. Se descargan desde
`/puente/descargar` (sin tiendas). En iPhone y iPad se instala desde Safari ("Agregar a inicio").

Las imágenes (íconos) y la clave de firma son propias de cada servidor y no están acá.

## Windows (`windows/`)

Electron con instalador NSIS (`CV-Chat-Windows.exe`). Cerrar la ventana la deja junto al reloj.

1. Poner el ícono de 512×512 en `windows/build/icon.png`.
2. `npm install` y `npm run armar`. El instalador queda en `windows/dist/`.

### Microsoft Store (sin el cartel de "Windows protegió su PC")

El `.exe` no está firmado y Windows lo avisa al instalarlo. La versión de la Microsoft Store la firma
Microsoft, así que no sale ningún aviso, y se actualiza desde la Store (`process.windowsStore`: sin el
actualizador propio).

1. Cuenta de desarrollador en Partner Center (para personas es gratis), y "Reservar nombre": CV Chat.
2. En la app, "Administración del producto → Identidad del producto": copiar `Package/Identity/Name`
   a `build.appx.identityName` y `Package/Identity/Publisher` (`CN=...`) a `build.appx.publisher` en
   `windows/package.json`.
3. `npm run tienda`: queda `windows/dist/CV-Chat-Store.appx`. Subirlo en "Paquetes" de un envío nuevo,
   con la descripción, capturas, clasificación por edad (mayores de 18) y la política de privacidad
   (https://circulovicioso.club/legal).
4. Cada versión nueva: subir `version` en `package.json`, `npm run tienda` y un envío nuevo.

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

## Actualizaciones

- **Windows** (desde la 1.0.2): al abrir, como Discord, una ventanita con el logo busca una versión nueva en `/puente/descargas/latest.yml`; si hay, la baja mostrando el avance, la instala sin preguntar y CV Chat se vuelve a abrir solo. Sin internet o si tarda, abre igual. Con la app abierta se fija cada 6 horas y ofrece "Reiniciar y actualizar". Hay que subir `latest.yml` y `CV-Chat-Windows.exe.blockmap` junto con el `.exe`.
- **Android** (desde la 1.0.4): al abrir se fija en `/puente/descargas.json` (la versión de `versiones.json`); si hay una más nueva que la instalada, muestra el logo con "Descargando la actualización..." y el avance, y abre el instalador de Android (que pide tocar "Actualizar"; la primera vez, además, permitir que CV Chat instale sus actualizaciones). Sin internet o si tarda más de 2,5 s, abre igual. Adentro de CV Chat sigue el aviso "Hay una versión nueva de la app" (la app abre `/app?app=android&v=<versión>`). En `AndroidManifest.xml`, el `v=` del `DEFAULT_URL` tiene que ser igual a `versionName`.

Para publicar una versión nueva: subir `versionCode`/`versionName` (Android) o `version`
(Windows), armar, copiar el archivo a `tools/puente/web/descargas/` como `CV-Chat-Android.apk`
o `CV-Chat-Windows.exe` y actualizar `tools/puente/web/descargas/versiones.json`.
