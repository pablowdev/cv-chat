package club.circulovicioso.chat;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.core.content.FileProvider;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Abre CV Chat (LauncherActivity de androidbrowserhelper). Antes de abrirla:
//  - la primera vez, en Android 13 o mas nuevo, pide el permiso de notificaciones: sin el, Chrome le
//    dice a la pagina que las notificaciones estan bloqueadas y el boton "Activar" no puede hacer nada;
//  - se fija si hay una version nueva de la app (/puente/descargas.json). Si hay, como
//    Discord, muestra el logo con "Descargando la actualizacion..." y el avance, y despues abre el
//    instalador de Android (que pide tocar "Actualizar": Android no deja instalar sin preguntar).
//    Si no hay, no hay internet o tarda, abre CV Chat como siempre.
public class Lanzador extends LauncherActivity {
    private static final int PEDIDO = 4021;
    private static final String SERVIDOR = "https://chat.circulovicioso.club/puente/";
    private static final int ESPERA_MS = 2500;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean abierta = false, esperandoPermiso = false, enInstalador = false;
    private File apk = null;
    private TextView texto;
    private ProgressBar barra;

    private boolean faltaPedir() {
        if (Build.VERSION.SDK_INT < 33) return false;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return false;
        return !getSharedPreferences("cvchat", MODE_PRIVATE).getBoolean("notificaciones_pedidas", false);
    }

    @Override
    protected boolean shouldLaunchImmediately() {
        return false; // primero el permiso y la actualizacion
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (faltaPedir()) {
            SharedPreferences.Editor e = getSharedPreferences("cvchat", MODE_PRIVATE).edit();
            e.putBoolean("notificaciones_pedidas", true).apply();
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, PEDIDO);
        } else {
            buscarActualizacion();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PEDIDO) buscarActualizacion();
    }

    // Abre CV Chat (una sola vez)
    private void abrir() {
        if (abierta || isFinishing()) return;
        abierta = true;
        launchTwa();
    }

    private void buscarActualizacion() {
        if (BuildConfig.TIENDA) { abrir(); return; } // la de Google Play se actualiza desde la tienda
        ui.postDelayed(this::abrir, ESPERA_MS); // sin respuesta a tiempo: se abre igual
        new Thread(() -> {
            try {
                String nueva = versionDelServidor();
                String mia = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                if (nueva != null && mia != null && esMasNueva(nueva, mia)) ui.post(() -> actualizar(nueva));
                else ui.post(this::abrir);
            } catch (Exception err) {
                ui.post(this::abrir);
            }
        }).start();
    }

    private String versionDelServidor() throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(SERVIDOR + "descargas.json").openConnection();
        c.setConnectTimeout(ESPERA_MS);
        c.setReadTimeout(ESPERA_MS);
        c.setUseCaches(false);
        try (InputStream in = c.getInputStream()) {
            byte[] b = new byte[4096];
            int n, total = 0;
            StringBuilder s = new StringBuilder();
            while ((n = in.read(b)) > 0 && total < 65536) { s.append(new String(b, 0, n, "UTF-8")); total += n; }
            // {"android":{"tam":...,"version":"1.0.4"},...}
            Matcher m = Pattern.compile("\"android\"\\s*:\\s*\\{[^}]*\"version\"\\s*:\\s*\"([0-9.]+)\"").matcher(s);
            return m.find() ? m.group(1) : null;
        } finally {
            c.disconnect();
        }
    }

    static boolean esMasNueva(String a, String b) {
        String[] x = a.split("\\."), y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? parse(x[i]) : 0, q = i < y.length ? parse(y[i]) : 0;
            if (p != q) return p > q;
        }
        return false;
    }

    private static int parse(String s) {
        try { return Integer.parseInt(s.replaceAll("[^0-9]", "")); } catch (Exception e) { return 0; }
    }

    // La pantalla de "Descargando la actualizacion...": el logo, el texto y la barra
    private void pantalla() {
        int fondo = getResources().getColor(R.color.fondo, getTheme());
        getWindow().setBackgroundDrawable(new ColorDrawable(fondo));
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(Gravity.CENTER);
        l.setBackgroundColor(fondo);
        int dp = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 1, getResources().getDisplayMetrics());
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.splash);
        logo.setAdjustViewBounds(true);
        l.addView(logo, new LinearLayout.LayoutParams(120 * dp, 120 * dp));
        texto = new TextView(this);
        texto.setTextColor(Color.parseColor("#F2F3F5"));
        texto.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        texto.setGravity(Gravity.CENTER);
        texto.setPadding(24 * dp, 24 * dp, 24 * dp, 12 * dp);
        l.addView(texto);
        barra = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        barra.setMax(100);
        barra.setIndeterminate(true);
        l.addView(barra, new LinearLayout.LayoutParams(220 * dp, LinearLayout.LayoutParams.WRAP_CONTENT));
        setContentView(l);
    }

    private void actualizar(String version) {
        if (abierta) return; // ya se abrio CV Chat (tardo mas de la cuenta)
        ui.removeCallbacksAndMessages(null);
        pantalla();
        texto.setText("Descargando la actualización " + version + "...");
        new Thread(() -> {
            try {
                File dir = new File(getCacheDir(), "actualizacion");
                dir.mkdirs();
                File destino = new File(dir, "CV-Chat-Android.apk");
                HttpURLConnection c = (HttpURLConnection) new URL(SERVIDOR + "descargas/CV-Chat-Android.apk").openConnection();
                c.setConnectTimeout(10000);
                c.setReadTimeout(30000);
                c.setUseCaches(false);
                long largo = c.getContentLength();
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(destino)) {
                    byte[] b = new byte[65536];
                    long hecho = 0;
                    int n, ultimo = -1;
                    while ((n = in.read(b)) > 0) {
                        out.write(b, 0, n);
                        hecho += n;
                        if (largo > 0) {
                            int pct = (int) (hecho * 100 / largo);
                            if (pct != ultimo) { ultimo = pct; ui.post(() -> { barra.setIndeterminate(false); barra.setProgress(pct); }); }
                        }
                    }
                } finally {
                    c.disconnect();
                }
                if (largo > 0 && destino.length() != largo) throw new Exception("descarga incompleta");
                apk = destino;
                ui.post(this::instalar);
            } catch (Exception err) {
                ui.post(this::abrir); // no se pudo: CV Chat como siempre (el aviso de adentro sigue)
            }
        }).start();
    }

    private void instalar() {
        texto.setText("Instalando la actualización...");
        barra.setIndeterminate(false);
        barra.setProgress(100);
        // Android 8 o mas nuevo pide, una sola vez, dejar que CV Chat instale sus actualizaciones
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            esperandoPermiso = true;
            texto.setText("Para actualizar, permití que CV Chat instale su actualización y volvé.");
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            } catch (Exception err) {
                esperandoPermiso = false;
                abrir();
            }
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            enInstalador = true;
            startActivity(i);
        } catch (Exception err) {
            enInstalador = false;
            abrir();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (esperandoPermiso) {
            esperandoPermiso = false;
            if (Build.VERSION.SDK_INT >= 26 && getPackageManager().canRequestPackageInstalls()) instalar();
            else abrir(); // no lo permitio: CV Chat como siempre
        } else if (enInstalador) {
            // Volvio del instalador sin actualizar (si actualizo, Android cierra la app y la vuelve a abrir)
            enInstalador = false;
            abrir();
        }
    }
}
