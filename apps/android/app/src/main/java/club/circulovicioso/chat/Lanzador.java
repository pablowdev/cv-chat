package club.circulovicioso.chat;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

// Abre CV Chat (LauncherActivity de androidbrowserhelper). La primera vez, en Android 13 o mas
// nuevo, antes pide el permiso de notificaciones: sin el, Chrome le dice a la pagina que las
// notificaciones estan bloqueadas y el boton "Activar" no puede hacer nada.
public class Lanzador extends LauncherActivity {
    private static final int PEDIDO = 4021;

    private boolean faltaPedir() {
        if (Build.VERSION.SDK_INT < 33) return false;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return false;
        return !getSharedPreferences("cvchat", MODE_PRIVATE).getBoolean("notificaciones_pedidas", false);
    }

    @Override
    protected boolean shouldLaunchImmediately() {
        return !faltaPedir();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!shouldLaunchImmediately()) {
            SharedPreferences.Editor e = getSharedPreferences("cvchat", MODE_PRIVATE).edit();
            e.putBoolean("notificaciones_pedidas", true).apply();
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, PEDIDO);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PEDIDO) launchTwa();
    }
}
