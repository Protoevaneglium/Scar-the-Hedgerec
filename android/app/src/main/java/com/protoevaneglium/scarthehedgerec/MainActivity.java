package com.protoevaneglium.scarthehedgerec;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.res.AssetFileDescriptor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/** Offline host; gameplay, controls and saves stay in the same shipped web core. */
public final class MainActivity extends Activity {
    public static final String GAME_URL = "https://appassets.androidplatform.net/assets/game/index.html";
    private FrameLayout root;
    private WebView gameView;
    private boolean destroyed;
    private boolean backgrounded;
    private int lifecycleEpoch;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams params = getWindow().getAttributes();
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(params);
        }
        root = new FrameLayout(this); root.setBackgroundColor(Color.rgb(3, 9, 22));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) root.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets cutout = insets.getInsets(WindowInsets.Type.displayCutout());
            view.setPadding(cutout.left, cutout.top, cutout.right, cutout.bottom); return insets;
        });
        createGame(); hideBars();
    }
    public WebView getGameView() { return gameView; }
    private void createGame() {
        root.removeAllViews();
        WebView view = new WebView(this); gameView = view;
        view.setBackgroundColor(Color.rgb(3, 9, 22));
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setBuiltInZoomControls(false); settings.setDisplayZoomControls(false);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView web, WebResourceRequest request) {
                return AssetRequest.assetPath(request.getUrl().toString()) == null;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView web, WebResourceRequest request) {
                String asset = AssetRequest.assetPath(request.getUrl().toString());
                if (asset == null) return empty(403, "Forbidden");
                if (!(request.getMethod().equals("GET") || request.getMethod().equals("HEAD"))) return empty(405, "Method Not Allowed");
                if (asset.endsWith(".mp4") || asset.endsWith(".mp3") || asset.endsWith(".wav")) return media(asset, request);
                WebResourceResponse response = loader.shouldInterceptRequest(request.getUrl());
                if (response == null) return empty(404, "Not Found");
                Map<String, String> headers = new HashMap<>();
                if (response.getResponseHeaders() != null) headers.putAll(response.getResponseHeaders());
                headers.put("Cache-Control", "no-store"); response.setResponseHeaders(headers); return response;
            }
            @Override public void onReceivedError(WebView web, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request.isForMainFrame() && gameView == web) runOnUiThread(() -> {
                    if (gameView == web) showFailure("The game could not load. Tap Retry.");
                });
            }
            @Override public boolean onRenderProcessGone(WebView web, RenderProcessGoneDetail detail) {
                if (gameView != web) { web.destroy(); return true; }
                root.removeView(web); if (gameView == web) gameView = null; web.destroy();
                showFailure("The game display stopped. Tap Retry to restart."); return true;
            }
        });
        root.addView(view, new FrameLayout.LayoutParams(-1, -1));
        view.requestFocus(); view.loadUrl(GAME_URL);
    }
    private WebResourceResponse media(String asset, WebResourceRequest request) {
        String mime = asset.endsWith(".mp4") ? "video/mp4" : asset.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
        try {
            AssetFileDescriptor descriptor = getAssets().openFd(asset);
            String header = null;
            for (Map.Entry<String, String> pair : request.getRequestHeaders().entrySet()) if (pair.getKey().equalsIgnoreCase("Range")) header = pair.getValue();
            AssetRequest.ByteRange range = AssetRequest.range(header, descriptor.getLength());
            Map<String, String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes"); headers.put("Content-Length", Long.toString(range.length)); headers.put("Cache-Control", "no-store");
            if (range.status != 200) headers.put("Content-Range", range.contentRange());
            InputStream body;
            if (range.status == 416 || request.getMethod().equals("HEAD")) { descriptor.close(); body = new ByteArrayInputStream(new byte[0]); }
            else {
                body = new WebViewMediaStream(descriptor.createInputStream(), range);
            }
            return new WebResourceResponse(mime, null, range.status, range.status == 200 ? "OK" : range.status == 206 ? "Partial Content" : "Range Not Satisfiable", headers, body);
        } catch (IOException error) { return empty(404, "Not Found"); }
    }
    private static WebResourceResponse empty(int status, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", status, reason, new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }
    private void showFailure(String message) {
        if (destroyed) return;
        if (gameView != null) { root.removeView(gameView); gameView.destroy(); gameView = null; }
        root.removeAllViews();
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setGravity(Gravity.CENTER); box.setPadding(28, 28, 28, 28);
        TextView label = new TextView(this); label.setText(message); label.setTextColor(Color.WHITE); label.setTextSize(20); box.addView(label);
        Button retry = new Button(this); retry.setText("Retry"); retry.setOnClickListener(button -> createGame()); box.addView(retry);
        root.addView(box, new FrameLayout.LayoutParams(-1, -1));
    }
    @SuppressWarnings("deprecation") private void hideBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) { controller.hide(WindowInsets.Type.systemBars()); controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
        } else getWindow().getDecorView().setSystemUiVisibility(5894);
    }
    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) hideBars();
        if (gameView != null) gameView.evaluateJavascript("window.ScarHost && window.ScarHost." + (focused ? "resume()" : "pause()"), null);
    }
    @Override protected void onPause() {
        backgrounded = true;
        final int epoch = ++lifecycleEpoch;
        WebView view = gameView;
        if (view != null) view.evaluateJavascript("window.ScarHost && window.ScarHost.pause()", ignored -> {
            if (!destroyed && backgrounded && lifecycleEpoch == epoch && gameView == view) { view.onPause(); view.pauseTimers(); }
        });
        super.onPause();
    }
    @Override protected void onResume() {
        backgrounded = false; lifecycleEpoch++;
        super.onResume(); hideBars();
        if (gameView != null) { gameView.resumeTimers(); gameView.onResume(); gameView.evaluateJavascript("window.ScarHost && window.ScarHost.resume()", null); }
    }
    @Override @SuppressWarnings("deprecation") public void onBackPressed() {
        if (gameView == null) { finish(); return; }
        gameView.evaluateJavascript("window.ScarHost ? window.ScarHost.back() : false", result -> {
            if (!destroyed && "true".equals(result)) new AlertDialog.Builder(this).setMessage("Leave the game?")
                    .setNegativeButton("Keep playing", (dialog, which) -> {}).setPositiveButton("Exit", (dialog, which) -> finish()).show();
        });
    }
    @Override protected void onDestroy() {
        destroyed = true;
        if (gameView != null) { gameView.resumeTimers(); root.removeView(gameView); gameView.destroy(); gameView = null; }
        super.onDestroy();
    }
}
