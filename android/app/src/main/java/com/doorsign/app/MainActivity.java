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
import android.os.SystemClock;
import android.text.InputType;
import android.view.MotionEvent;
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

import java.net.URL;

/**
 * One app, two device types, chosen on first launch and remembered:
 *
 * Tablet on the door (DISPLAY): shows the sign full screen, keeps the screen
 * on, pins itself, and sends Back to the sign's lock keypad. After the lock
 * code, the tablet menu can open the editor. Editing returns to the sign
 * after saving, on Back, or after two idle minutes, so the code is needed
 * every time.
 *
 * Phone (REMOTE): opens straight into the editor like a normal app. No lock
 * code; the editor stays signed in after the first sign-in.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "doorsign";
    private static final String KEY_URL = "sign_url";
    private static final String KEY_LOCKED = "locked";
    private static final String KEY_MODE = "device_mode";
    private static final String MODE_DISPLAY = "display";
    private static final String MODE_REMOTE = "remote";
    private static final long RETRY_MS = 30_000;
    private static final long EDIT_IDLE_MS = 120_000;

    private WebView web;
    private FrameLayout root;
    private SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Handler idleHandler = new Handler(Looper.getMainLooper());
    private boolean pageReady = false;
    private boolean showingError = false;
    /** Tablet only: the editor is open instead of the sign. */
    private boolean editing = false;
    private long lastTouch = 0;
    private AlertDialog openDialog;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // On the phone, keep the page clear of the status bar, navigation bar and keyboard.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (isRemote() && Build.VERSION.SDK_INT >= 35) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else {
                v.setPadding(0, 0, 0, 0);
            }
            return insets;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        android.webkit.CookieManager.getInstance().setAcceptCookie(true);

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

        if (mode() == null) askForMode(false);
        else applyMode();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (isDisplay()) {
            hideSystemBars();
            pinToScreen();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && isDisplay()) hideSystemBars();
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        lastTouch = SystemClock.uptimeMillis();
        return super.dispatchTouchEvent(ev);
    }

    /* ---------------- Device type ---------------- */

    private String mode() { return prefs.getString(KEY_MODE, null); }
    private boolean isDisplay() { return MODE_DISPLAY.equals(mode()); }
    private boolean isRemote() { return MODE_REMOTE.equals(mode()); }

    private void askForMode(boolean cancelable) {
        dismissDialog();
        String[] items = {
                "This is the tablet on the door",
                "This is my phone"
        };
        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle("How will you use Door Sign here?")
                .setItems(items, (d, which) -> {
                    prefs.edit().putString(KEY_MODE, which == 0 ? MODE_DISPLAY : MODE_REMOTE).apply();
                    applyMode();
                })
                .setCancelable(cancelable);
        if (cancelable) b.setNegativeButton("Cancel", null);
        openDialog = b.show();
    }

    private void applyMode() {
        editing = false;
        idleHandler.removeCallbacksAndMessages(null);
        if (isDisplay()) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN);
            hideSystemBars();
            pinToScreen();
            loadSign();
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
            unpin();
            showSystemBars();
            loadEditor();
        }
        root.requestApplyInsets();
    }

    /* ---------------- Back button ---------------- */

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (isRemote()) {
            // Phone: behave like a normal app.
            if (web.canGoBack()) web.goBack();
            else super.onBackPressed();
            return;
        }
        if (mode() == null) return;
        if (editing) {
            // Tablet editor: Back returns to the sign.
            loadSign();
            return;
        }
        // Tablet sign: never leave directly. Ask the sign page to show its lock keypad.
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
            showTabletMenu();
        } else {
            Toast.makeText(this, "The sign is locked. Reconnect to the internet to unlock it.", Toast.LENGTH_LONG).show();
        }
    }

    /* ---------------- Page bridge ---------------- */

    private class Bridge {
        /** Which device type this is: "display", "remote" or "". */
        @JavascriptInterface
        public String mode() {
            String m = MainActivity.this.mode();
            return m == null ? "" : m;
        }

        /** The sign tells the app whether a lock code is set. */
        @JavascriptInterface
        public void setLocked(boolean locked) {
            prefs.edit().putBoolean(KEY_LOCKED, locked).apply();
        }

        /** The correct lock code was entered on the sign (or there is no lock). */
        @JavascriptInterface
        public void unlocked() {
            runOnUiThread(() -> { if (isDisplay() && !editing) showTabletMenu(); });
        }

        /** The editor published a new status. On the tablet, go back to the sign. */
        @JavascriptInterface
        public void saved() {
            runOnUiThread(() -> {
                if (isDisplay() && editing) handler.postDelayed(MainActivity.this::loadSign, 1200);
            });
        }

        /** The editor's "Back to sign" button (tablet). */
        @JavascriptInterface
        public void doneEditing() {
            runOnUiThread(() -> { if (isDisplay()) loadSign(); });
        }

        /** The editor's "App settings" button (phone). */
        @JavascriptInterface
        public void openMenu() {
            runOnUiThread(() -> { if (isRemote()) showPhoneMenu(); });
        }
    }

    /* ---------------- Menus ---------------- */

    private void showTabletMenu() {
        if (isFinishing()) return;
        dismissDialog();
        String[] items = {
                "Back to the sign",
                "Edit the status",
                "Reload the sign",
                "Change sign address",
                "Use this device as my phone instead",
                "Exit and unlock the tablet"
        };
        openDialog = new AlertDialog.Builder(this)
                .setTitle("Tablet menu")
                .setItems(items, (d, which) -> {
                    switch (which) {
                        case 1: loadEditor(); break;
                        case 2: loadSign(); break;
                        case 3: askForUrl(); break;
                        case 4: switchMode(MODE_REMOTE); break;
                        case 5: exitKiosk(); break;
                        default: break;
                    }
                })
                .setOnDismissListener(d -> { if (isDisplay()) hideSystemBars(); })
                .show();
    }

    private void showPhoneMenu() {
        if (isFinishing()) return;
        dismissDialog();
        String[] items = {
                "Reload the editor",
                "Change sign address",
                "Use this device as the door tablet"
        };
        openDialog = new AlertDialog.Builder(this)
                .setTitle("App settings")
                .setItems(items, (d, which) -> {
                    switch (which) {
                        case 0: loadEditor(); break;
                        case 1: askForUrl(); break;
                        case 2: switchMode(MODE_DISPLAY); break;
                        default: break;
                    }
                })
                .setNegativeButton("Close", null)
                .show();
    }

    private void switchMode(String newMode) {
        prefs.edit().putString(KEY_MODE, newMode).apply();
        applyMode();
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
                    if (isRemote()) loadEditor(); else loadSign();
                })
                .setNegativeButton("Cancel", null)
                .setOnDismissListener(d -> { if (isDisplay()) hideSystemBars(); })
                .show();
    }

    private void exitKiosk() {
        unpin();
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

    private String editorUrl() {
        try {
            return new URL(new URL(signUrl()), "edit.html").toString();
        } catch (Exception e) {
            String base = signUrl();
            return base.endsWith("/") ? base + "edit.html" : base + "/edit.html";
        }
    }

    private void loadSign() {
        handler.removeCallbacksAndMessages(null);
        idleHandler.removeCallbacksAndMessages(null);
        editing = false;
        showingError = false;
        pageReady = false;
        web.clearHistory();
        web.loadUrl(signUrl());
        if (isDisplay()) hideSystemBars();
    }

    private void loadEditor() {
        handler.removeCallbacksAndMessages(null);
        showingError = false;
        pageReady = false;
        if (isDisplay()) {
            editing = true;
            lastTouch = SystemClock.uptimeMillis();
            scheduleIdleCheck();
        }
        web.loadUrl(editorUrl());
    }

    /** Tablet: if nobody touches the editor for two minutes, go back to the sign. */
    private void scheduleIdleCheck() {
        idleHandler.removeCallbacksAndMessages(null);
        idleHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!editing || !isDisplay()) return;
                if (SystemClock.uptimeMillis() - lastTouch >= EDIT_IDLE_MS) {
                    dismissDialog();
                    loadSign();
                } else {
                    idleHandler.postDelayed(this, 15_000);
                }
            }
        }, 15_000);
    }

    private void showOffline() {
        showingError = true;
        pageReady = false;
        String html = "<html><body style=\"margin:0;height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#1d211e;color:#e8ebe6;font-family:sans-serif;text-align:center\">"
                + "<div><div style=\"font-size:48px\">📶</div><p style=\"font-size:22px\">Can't reach the sign.<br>Trying again in 30 seconds…</p></div>"
                + "</body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
        handler.postDelayed(() -> { if (isRemote()) loadEditor(); else loadSign(); }, RETRY_MS);
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

    private void showSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(true);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) c.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
        } else {
            //noinspection deprecation
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    /** Pins the app (Android asks to confirm the first time). Home, Recents and the taskbar stop working. */
    private void pinToScreen() {
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (am != null && am.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) {
            try { startLockTask(); } catch (Exception ignored) { }
        }
    }

    private void unpin() {
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (am != null && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE) {
            try { stopLockTask(); } catch (Exception ignored) { }
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        idleHandler.removeCallbacksAndMessages(null);
        dismissDialog();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
