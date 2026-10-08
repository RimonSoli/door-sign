package com.doorsign.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * Shows the door sign full screen, keeps the screen on, pins itself to the
 * screen, and sends the Back button to the sign's lock keypad instead of
 * leaving. The tablet menu (change address, reload, exit) opens only after
 * the lock code is entered on the sign.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "doorsign";
    private static final String KEY_URL = "sign_url";
    private static final String KEY_LOCKED = "locked";
    private static final long RETRY_MS = 30_000;

    private WebView web;
    private SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean pageReady = false;
    private boolean showingError = false;
    private AlertDialog openDialog;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        FrameLayout root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);

        web.addJavascriptInterface(new Bridge(), "DoorSignApp");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Stay on the sign's own site; ignore links that would lead anywhere else.
                Uri target = request.getUrl();
                Uri home = Uri.parse(signUrl());
                return target.getHost() == null || !target.getHost().equals(home.getHost());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!showingError) pageReady = true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }
        });

        loadSign();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemBars();
        pinToScreen();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /* ---------------- Back button ---------------- */

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Never leave directly. Ask the sign page to show its lock keypad.
        if (pageReady && !showingError) {
            web.evaluateJavascript(
                    "(function(){if(window.doorSignBack){window.doorSignBack();return 'ok';}return 'none';})()",
                    result -> {
                        if (result == null || result.contains("none")) fallbackBack();
                    });
        } else {
            fallbackBack();
        }
    }

    /** The page isn't loaded (no internet). Open the menu only if no lock code has ever been set. */
    private void fallbackBack() {
        if (!prefs.getBoolean(KEY_LOCKED, false)) {
            showMenu();
        } else {
            Toast.makeText(this, "The sign is locked. Reconnect to the internet to unlock it.", Toast.LENGTH_LONG).show();
        }
    }

    /* ---------------- Page bridge ---------------- */

    private class Bridge {
        /** The sign tells the app whether a lock code is set. */
        @JavascriptInterface
        public void setLocked(boolean locked) {
            prefs.edit().putBoolean(KEY_LOCKED, locked).apply();
        }

        /** The correct lock code was entered (or there is no lock). */
        @JavascriptInterface
        public void unlocked() {
            runOnUiThread(MainActivity.this::showMenu);
        }
    }

    /* ---------------- Tablet menu ---------------- */

    private void showMenu() {
        if (isFinishing()) return;
        dismissDialog();
        String[] items = {
                "Back to the sign",
                "Reload the sign",
                "Change sign address",
                "Exit and unlock the tablet"
        };
        openDialog = new AlertDialog.Builder(this)
                .setTitle("Tablet menu")
                .setItems(items, (d, which) -> {
                    switch (which) {
                        case 1: loadSign(); break;
                        case 2: askForUrl(); break;
                        case 3: exitKiosk(); break;
                        default: break;
                    }
                })
                .setOnDismissListener(d -> hideSystemBars())
                .show();
    }

    private void askForUrl() {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setText(signUrl());
        input.setSelectAllOnFocus(true);
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        FrameLayout box = new FrameLayout(this);
        box.setPadding(pad, pad / 2, pad, 0);
        box.addView(input);
        dismissDialog();
        openDialog = new AlertDialog.Builder(this)
                .setTitle("Sign address")
                .setMessage("The web address of your sign page.")
                .setView(box)
                .setPositiveButton("Save", (d, w) -> {
                    String url = input.getText().toString().trim();
                    if (!url.startsWith("https://")) {
                        Toast.makeText(this, "The address must start with https://", Toast.LENGTH_LONG).show();
                        return;
                    }
                    prefs.edit().putString(KEY_URL, url).apply();
                    loadSign();
                })
                .setNegativeButton("Cancel", null)
                .setOnDismissListener(d -> hideSystemBars())
                .show();
    }

    private void exitKiosk() {
        try { stopLockTask(); } catch (Exception ignored) { }
        Toast.makeText(this, "Door Sign closed. Open it again to lock the tablet.", Toast.LENGTH_LONG).show();
        finishAndRemoveTask();
    }

    private void dismissDialog() {
        if (openDialog != null && openDialog.isShowing()) openDialog.dismiss();
        openDialog = null;
    }

    /* ---------------- Loading ---------------- */

    private String signUrl() {
        return prefs.getString(KEY_URL, getString(R.string.default_sign_url));
    }

    private void loadSign() {
        handler.removeCallbacksAndMessages(null);
        showingError = false;
        pageReady = false;
        web.loadUrl(signUrl());
    }

    private void showOffline() {
        showingError = true;
        pageReady = false;
        String html = "<html><body style=\"margin:0;height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#1d211e;color:#e8ebe6;font-family:sans-serif;text-align:center\">"
                + "<div><div style=\"font-size:48px\">📶</div><p style=\"font-size:22px\">Can't reach the sign.<br>Trying again in 30 seconds…</p></div>"
                + "</body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
        handler.postDelayed(this::loadSign, RETRY_MS);
    }

    /* ---------------- Full screen and pinning ---------------- */

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            //noinspection deprecation
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    /** Pins the app (Android asks to confirm the first time). Home, Recents and the taskbar stop working. */
    private void pinToScreen() {
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (am != null && am.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) {
            try { startLockTask(); } catch (Exception ignored) { }
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        dismissDialog();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
