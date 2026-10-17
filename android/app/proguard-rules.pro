# ProGuard / R8 Rules for Lalajo Anime (Play Store Production Safe)

# Keep JavaScript Interface methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebKit and WebView
-keepattributes JavascriptInterface
-keepclassmembers class * extends android.webkit.WebViewClient {
    public void *(android.webkit.WebView, java.lang.String);
    public void *(android.webkit.WebView, java.lang.String, android.graphics.Bitmap);
}
-keepclassmembers class * extends android.webkit.WebChromeClient {
    public void *(android.webkit.WebView, int);
}

# Keep models and AppConfig
-keep class com.lalajo.anime.AppConfig { *; }

# Keep AndroidX Webkit and SwipeRefreshLayout
-keep class androidx.webkit.** { *; }
-keep class androidx.swiperefreshlayout.** { *; }
