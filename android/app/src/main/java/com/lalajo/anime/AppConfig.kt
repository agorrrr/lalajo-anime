package com.lalajo.anime

object AppConfig {
    /**
     * URL Web Server Lalajo Anime.
     * Aplikasi Android akan sync data anime, akun VIP, episode, dan komentar ke server ini.
     */
    const val WEB_URL = "https://lalajo-anime.vercel.app"

    /**
     * Custom User-Agent identifier untuk WebView.
     * Dipakai oleh frontend (ads.js) untuk mendeteksi aplikasi Android
     * dan otomatis HANYA mengaktifkan iklan banner (popunder & popup otomatis dimatikan).
     */
    const val APP_USER_AGENT = "LalajoAnimeApp/1.0.2 (Android; Mobile; PlayStoreSafe)"
}
