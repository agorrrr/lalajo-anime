# ⚡ Lalajo Anime

Website streaming dan download anime subtitle Indonesia terlengkap dan terupdate, siap di-hosting ke hosting statis (Vercel, Netlify, Cloudflare Pages, GitHub Pages, cPanel/Apache/Nginx).

## 📁 Struktur File

```
lalajo-anime/
├── index.html              ← Beranda (homepage)
├── data/
│   └── anime.json          ← Database anime (edit untuk tambah konten)
├── assets/
│   ├── css/
│   │   ├── style.css       ← Main stylesheet
│   │   ├── font-awesome.min.css
│   │   └── fonts/          ← Font Awesome font files
│   └── js/
│       ├── main.js         ← Core JS (theme, search, card renderer)
│       └── layout.js       ← Header/footer injector
└── pages/
    ├── anime-list.html     ← Daftar Anime (filter, sort, search)
    ├── anime-terbaru.html  ← Anime Terbaru
    ├── anime.html          ← Detail Anime (poster, episode list, related)
    ├── watch.html          ← Halaman Tonton Player
    ├── jadwal-rilis.html   ← Jadwal Rilis (per hari)
    └── batch.html          ← Daftar Batch Download
```

## 🚀 Cara Hosting / Deploy

Website ini mendukung **Clean URLs (ekstensi .html otomatis disembunyikan/disamarkan)**:
- **cPanel / Apache / Web Hosting**: File [`.htaccess`](file:///C:/Users/rezam/Documents/samehadaku-clone/.htaccess) sudah tersedia dan siap pakai di folder utama `public_html`.
- **Vercel / Netlify**: Konfigurasi [`vercel.json`](file:///C:/Users/rezam/Documents/samehadaku-clone/vercel.json) sudah otomatis aktif.
- **Lokal (Uji Coba)**:
```bash
python server.py
```
Buka: **http://localhost:8000** (atau **http://localhost:8000/jadwal-rilis**, **http://localhost:8000/admin**)

## ✨ Fitur

| Fitur | Status |
|-------|--------|
| Dark/Light mode toggle | ✅ |
| Responsive (mobile drawer) | ✅ |
| Live search dengan dropdown | ✅ |
| Daftar anime — grid 5 kolom | ✅ |
| Filter: status, tipe, genre | ✅ |
| Sort: terbaru, populer, rating, A-Z | ✅ |
| Hover tooltip (genre, synopsis, score) | ✅ |
| Pagination | ✅ |
| Detail anime (poster, meta, episode list) | ✅ |
| Halaman tonton (player video streaming) | ✅ |
| Jadwal rilis (highlight hari ini) | ✅ |
| Batch download list | ✅ |

## ➕ Cara Tambah Anime

Edit file `data/anime.json`. Contoh entry baru:

```json
{
  "id": 13,
  "slug": "nama-anime-slug",
  "title": "Judul Anime",
  "type": "TV",
  "status": "Currently Airing",
  "score": 8.50,
  "views": 5000,
  "episodes": 12,
  "year": 2026,
  "season": "Fall",
  "studio": "Nama Studio",
  "synopsis": "Sinopsis anime...",
  "genres": ["Action", "Fantasy"],
  "thumbnail": "https://placehold.co/212x300/333/fff?text=Judul",
  "day": "Senin",
  "time": "22:00",
  "episodes_list": [
    {"ep": 1, "title": "Episode 1", "date": "2026-10-07"}
  ]
}
```

## 🎨 Warna tema (CSS variables)

Edit `assets/css/style.css` bagian `:root`:
- `--brand`: warna utama header/button (`#3384d6`)  
- `--accent`: warna sort pill aktif (`#f5c518`)
- `--bg-dark`: background dark mode (`#111113`)
