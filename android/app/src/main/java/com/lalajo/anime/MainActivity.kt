package com.lalajo.anime

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.SafeBrowsingResponse
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.RelativeLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : ComponentActivity() {

    private lateinit var nativeTopBar: RelativeLayout
    private lateinit var btnBack: ImageButton
    private lateinit var imgAppLogo: ImageView
    private lateinit var tvAppTitle: TextView
    private lateinit var btnNavSearch: ImageButton
    private lateinit var btnNavRefresh: ImageButton

    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var errorView: LinearLayout
    private lateinit var btnRetry: Button
    private lateinit var fullscreenContainer: FrameLayout

    private lateinit var nativeBottomBar: LinearLayout
    private lateinit var tabHome: LinearLayout
    private lateinit var tabList: LinearLayout
    private lateinit var tabJadwal: LinearLayout
    private lateinit var tabProfile: LinearLayout

    private lateinit var tabHomeIcon: ImageView
    private lateinit var tabHomeText: TextView
    private lateinit var tabListIcon: ImageView
    private lateinit var tabListText: TextView
    private lateinit var tabJadwalIcon: ImageView
    private lateinit var tabJadwalText: TextView
    private lateinit var tabProfileIcon: ImageView
    private lateinit var tabProfileText: TextView

    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    private val COLOR_ACTIVE = Color.parseColor("#38BDF8")
    private val COLOR_INACTIVE = Color.parseColor("#94A3B8")

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        setupWindowInsets()
        setupSecurityAndSettings()
        setupClients()
        setupTopBarListeners()
        setupBottomNavListeners()
        setupBackNavigation()

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            loadTab("home")
        }
    }

    private fun initViews() {
        nativeTopBar = findViewById(R.id.native_top_bar)
        btnBack = findViewById(R.id.btn_back)
        imgAppLogo = findViewById(R.id.img_app_logo)
        tvAppTitle = findViewById(R.id.tv_app_title)
        btnNavSearch = findViewById(R.id.btn_nav_search)
        btnNavRefresh = findViewById(R.id.btn_nav_refresh)

        swipeRefresh = findViewById(R.id.swipe_refresh)
        webView = findViewById(R.id.web_view)
        progressBar = findViewById(R.id.progress_bar)
        errorView = findViewById(R.id.error_view)
        btnRetry = findViewById(R.id.btn_retry)
        fullscreenContainer = findViewById(R.id.fullscreen_container)

        nativeBottomBar = findViewById(R.id.native_bottom_bar)
        tabHome = findViewById(R.id.tab_home)
        tabList = findViewById(R.id.tab_list)
        tabJadwal = findViewById(R.id.tab_jadwal)
        tabProfile = findViewById(R.id.tab_profile)

        tabHomeIcon = findViewById(R.id.tab_home_icon)
        tabHomeText = findViewById(R.id.tab_home_text)
        tabListIcon = findViewById(R.id.tab_list_icon)
        tabListText = findViewById(R.id.tab_list_text)
        tabJadwalIcon = findViewById(R.id.tab_jadwal_icon)
        tabJadwalText = findViewById(R.id.tab_jadwal_text)
        tabProfileIcon = findViewById(R.id.tab_profile_icon)
    }

    private fun dpToPx(dp: Int): Int {
        return (dp * resources.displayMetrics.density).toInt()
    }

    private fun setupWindowInsets() {
        val rootLayout = findViewById<View>(R.id.root_layout)
        ViewCompat.setOnApplyWindowInsetsListener(rootLayout) { _, windowInsets ->
            val insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )

            // Padding top bar agar pas di bawah jam / status bar tablet
            nativeTopBar.setPadding(
                insets.left + dpToPx(12),
                0,
                insets.right + dpToPx(12),
                0
            )
            val topParams = nativeTopBar.layoutParams
            topParams.height = insets.top + dpToPx(56)
            nativeTopBar.layoutParams = topParams

            // Padding bottom bar agar pas di atas Taskbar Samsung / navigation bar
            nativeBottomBar.setPadding(
                insets.left,
                0,
                insets.right,
                insets.bottom
            )
            val bottomParams = nativeBottomBar.layoutParams
            bottomParams.height = dpToPx(58) + insets.bottom
            nativeBottomBar.layoutParams = bottomParams

            windowInsets
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupSecurityAndSettings() {
        val s = webView.settings

        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.useWideViewPort = true
        s.loadWithOverviewMode = true
        s.mediaPlaybackRequiresUserGesture = false

        // Security Hardening (Zero Arbitrary File Access)
        s.allowFileAccess = false
        s.allowContentAccess = false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.safeBrowsingEnabled = true
        }
        s.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        s.cacheMode = WebSettings.LOAD_DEFAULT

        val defaultUa = s.userAgentString
        s.userAgentString = "$defaultUa ${AppConfig.APP_USER_AGENT}"
    }

    private fun setupClients() {
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                val uri = request.url

                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false
                }

                val scheme = uri.scheme?.lowercase()
                if (scheme in listOf("mailto", "whatsapp", "tel", "sms")) {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                            addCategory(Intent.CATEGORY_BROWSABLE)
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        startActivity(Intent.createChooser(intent, "Buka tautan:"))
                    } catch (_: ActivityNotFoundException) {}
                    return true
                }

                return true
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                progressBar.visibility = View.VISIBLE
                errorView.visibility = View.GONE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
                swipeRefresh.isRefreshing = false

                // Inject client-side APK banner mode & app mode class
                view?.evaluateJavascript(
                    "window.IS_ANDROID_APK = true; document.body.classList.add('app-mode');",
                    null
                )

                updateUiForUrl(url ?: "")
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    progressBar.visibility = View.GONE
                    swipeRefresh.isRefreshing = false
                    errorView.visibility = View.VISIBLE
                }
            }

            override fun onSafeBrowsingHit(
                view: WebView?,
                request: WebResourceRequest?,
                threatType: Int,
                callback: SafeBrowsingResponse?
            ) {
                callback?.backToSafety(true)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress in 1..99) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (customView != null) {
                    callback?.onCustomViewHidden()
                    return
                }
                customView = view
                customViewCallback = callback

                fullscreenContainer.addView(
                    customView,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                )
                fullscreenContainer.visibility = View.VISIBLE
                swipeRefresh.visibility = View.GONE
                nativeTopBar.visibility = View.GONE
                nativeBottomBar.visibility = View.GONE

                @Suppress("DEPRECATION")
                window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
            }

            override fun onHideCustomView() {
                if (customView == null) return

                fullscreenContainer.removeView(customView)
                fullscreenContainer.visibility = View.GONE
                swipeRefresh.visibility = View.VISIBLE
                nativeTopBar.visibility = View.VISIBLE
                nativeBottomBar.visibility = View.VISIBLE

                customView = null
                customViewCallback?.onCustomViewHidden()
                customViewCallback = null

                @Suppress("DEPRECATION")
                window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
            }
        }
    }

    private fun setupTopBarListeners() {
        btnBack.setOnClickListener {
            handleBackNavigation()
        }

        btnNavSearch.setOnClickListener {
            loadTab("list")
        }

        btnNavRefresh.setOnClickListener {
            errorView.visibility = View.GONE
            webView.reload()
        }

        swipeRefresh.setColorSchemeColors(COLOR_ACTIVE, Color.parseColor("#10B981"))
        swipeRefresh.setOnRefreshListener {
            errorView.visibility = View.GONE
            webView.reload()
        }

        webView.viewTreeObserver.addOnScrollChangedListener {
            swipeRefresh.isEnabled = webView.scrollY == 0 && customView == null
        }

        btnRetry.setOnClickListener {
            errorView.visibility = View.GONE
            webView.reload()
        }
    }

    private fun setupBottomNavListeners() {
        tabHome.setOnClickListener { loadTab("home") }
        tabList.setOnClickListener { loadTab("list") }
        tabJadwal.setOnClickListener { loadTab("jadwal") }
        tabProfile.setOnClickListener { loadTab("profile") }
    }

    private fun loadTab(tab: String) {
        val targetUrl = when (tab) {
            "list" -> "${AppConfig.WEB_URL}/pages/anime-list.html"
            "jadwal" -> "${AppConfig.WEB_URL}/pages/jadwal-rilis.html"
            "profile" -> "${AppConfig.WEB_URL}/pages/user.html"
            else -> "${AppConfig.WEB_URL}/index.html"
        }
        highlightTab(tab)
        webView.loadUrl(targetUrl)
    }

    private fun highlightTab(tab: String) {
        tabHomeIcon.setColorFilter(if (tab == "home") COLOR_ACTIVE else COLOR_INACTIVE)
        tabHomeText.setTextColor(if (tab == "home") COLOR_ACTIVE else COLOR_INACTIVE)

        tabListIcon.setColorFilter(if (tab == "list") COLOR_ACTIVE else COLOR_INACTIVE)
        tabListText.setTextColor(if (tab == "list") COLOR_ACTIVE else COLOR_INACTIVE)

        tabJadwalIcon.setColorFilter(if (tab == "jadwal") COLOR_ACTIVE else COLOR_INACTIVE)
        tabJadwalText.setTextColor(if (tab == "jadwal") COLOR_ACTIVE else COLOR_INACTIVE)

        tabProfileIcon.setColorFilter(if (tab == "profile") COLOR_ACTIVE else COLOR_INACTIVE)
        tabProfileText.setTextColor(if (tab == "profile") COLOR_ACTIVE else COLOR_INACTIVE)
    }

    private fun updateUiForUrl(url: String) {
        val lower = url.lowercase()
        val isDetailOrWatch = lower.contains("watch.html") || lower.contains("anime.html")

        if (isDetailOrWatch) {
            btnBack.visibility = View.VISIBLE
            imgAppLogo.visibility = View.GONE
            tvAppTitle.text = if (lower.contains("watch")) "Tonton Anime" else "Detail Anime"
        } else {
            btnBack.visibility = View.GONE
            imgAppLogo.visibility = View.VISIBLE

            when {
                lower.contains("anime-list") -> {
                    highlightTab("list")
                    tvAppTitle.text = "Daftar Anime"
                }
                lower.contains("jadwal-rilis") -> {
                    highlightTab("jadwal")
                    tvAppTitle.text = "Jadwal Rilis"
                }
                lower.contains("user.html") || lower.contains("login.html") || lower.contains("admin.html") -> {
                    highlightTab("profile")
                    tvAppTitle.text = "Akun & VIP"
                }
                else -> {
                    highlightTab("home")
                    tvAppTitle.text = "Lalajo Anime"
                }
            }
        }
    }

    private fun handleBackNavigation() {
        if (customView != null) {
            webView.webChromeClient?.onHideCustomView()
        } else if (webView.canGoBack()) {
            webView.goBack()
        } else {
            loadTab("home")
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (customView != null) {
                    webView.webChromeClient?.onHideCustomView()
                } else if (btnBack.visibility == View.VISIBLE && webView.canGoBack()) {
                    webView.goBack()
                } else if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
