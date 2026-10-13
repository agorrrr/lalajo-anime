// ============================================
// Lalajo Anime - Shared Header/Footer
// Dipanggil dari setiap halaman
// ============================================

(function syncTheme() {
  var m = localStorage.getItem('theme-mode') || 'darkmode';
  if (m === 'darkmode' || m === 'dark') {
    document.documentElement.classList.add('darkmode');
    if (document.body) document.body.classList.add('darkmode');
  } else {
    document.documentElement.classList.remove('darkmode');
    if (document.body) document.body.classList.remove('darkmode');
  }
})();

const BASE = (function() {
  // hitung relative path ke root
  const depth = window.location.pathname.split('/').filter(Boolean).length;
  // jika di /pages/ = 1 level dalam, root = ../
  // jika di root = ./
  const parts = window.location.pathname.split('/');
  const inPages = parts.some(p => p === 'pages');
  return inPages ? '../' : './';
})();

function getNavLinks(currentPage) {
  const links = [
    { href: 'anime-terbaru', label: 'Anime Terbaru' },
    { href: 'anime-list',   label: 'Daftar Anime'  },
    { href: 'batch',        label: 'Batch'         },
    { href: 'jadwal-rilis', label: 'Jadwal Rilis'  },
  ];
  return links.map(l => {
    const active = window.location.pathname.includes(l.href) ? 'current-menu-item' : '';
    return `<li class="menu-item ${active}"><a href="${BASE}pages/${l.href}"><span>${l.label}</span></a></li>`;
  }).join('');
}

function renderHeader() {
  const nav = getNavLinks();
  let authUser = null;
  try {
    const raw = localStorage.getItem('auth_user');
    if (raw) authUser = JSON.parse(raw);
  } catch(e) {}
  const authToken = localStorage.getItem('auth_token');

  let accountLink = `${BASE}pages/login.html`;
  let accountIcon = 'fa-user';
  let accountLabel = 'Masuk / Daftar';
  let accountStyle = '';

  let mobileAccountHtml = `<li><a href="${BASE}pages/login.html"><span>🔑 Masuk / Daftar</span></a></li>`;

  if (authToken && authUser) {
    if (authUser.role === 'admin') {
      accountLink = `${BASE}pages/admin.html`;
      accountIcon = 'fa-shield';
      accountLabel = authUser.username || 'Admin';
      accountStyle = 'background:rgba(239,68,68,0.15);color:#ef4444;border-radius:20px;padding:5px 12px;border:1px solid rgba(239,68,68,0.3);';
      mobileAccountHtml = `
        <li><a href="${BASE}pages/admin.html"><span>👑 Panel Admin (${authUser.username})</span></a></li>
        <li><a href="${BASE}pages/user.html"><span>👤 Profil Akun</span></a></li>
      `;
    } else {
      accountLink = `${BASE}pages/user.html`;
      accountIcon = 'fa-user-circle';
      accountLabel = authUser.username || 'Penonton';
      accountStyle = 'background:rgba(51,132,214,0.15);color:#3384d6;border-radius:20px;padding:5px 12px;border:1px solid rgba(51,132,214,0.3);';
      mobileAccountHtml = `
        <li><a href="${BASE}pages/user.html"><span>⭐ Profil Saya (${authUser.username})</span></a></li>
      `;
    }
  }

  document.body.insertAdjacentHTML('afterbegin', `
<!-- Mobile Navigation Drawer -->
<div id="mobile-menu-overlay" aria-hidden="true"></div>
<aside id="mobile-menu-drawer" aria-label="Mobile Navigation">
  <div class="drawer-header">
    <a href="${BASE}index.html" title="Lalajo Anime">
      <span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:-0.5px;">⚡ Lalajo Anime</span>
    </a>
    <button id="close-mobile-menu" aria-label="Close Menu"><span class="fa fa-times"></span></button>
  </div>
  <div style="flex-grow:1;overflow-y:auto;">
    <nav class="mobile-nav-links">
      <ul id="mobile-menu-items" class="mobile-menu">
        <li><a href="${BASE}"><span>🏠 Beranda</span></a></li>
        <li><a href="${BASE}pages/anime-terbaru"><span>🆕 Anime Terbaru</span></a></li>
        <li><a href="${BASE}pages/anime-list"><span>📋 Daftar Anime</span></a></li>
        <li><a href="${BASE}pages/batch"><span>📦 Batch</span></a></li>
        <li><a href="${BASE}pages/jadwal-rilis"><span>📅 Jadwal Rilis</span></a></li>
        ${mobileAccountHtml}
      </ul>
    </nav>
  </div>
  <div class="drawer-footer">
    <span>Mode Tampilan</span>
    <button id="mobile-drawer-theme-toggle"><span class="fa fa-adjust"></span> Ubah Tema</button>
  </div>
</aside>

<!-- Site Header -->
<header id="masthead" class="site-header" role="banner">
  <div id="primary-menu" class="mm">
    <div class="container">
      <div class="header-area desktop-area">
        <button class="btnmenu" id="btn-mobile-menu" aria-label="Toggle Menu">
          <span class="fa fa-bars"></span>
        </button>
        <div class="logo-area">
          <div class="site-branding logox">
            <span class="logo">
              <a href="${BASE}index.html" title="Lalajo Anime - Nonton Streaming Anime Sub Indo">
                <span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.5px;">⚡ Lalajo Anime</span>
              </a>
            </span>
          </div>
        </div>
        <div class="search_desktop">
          <form id="form" method="get" action="#">
            <input id="s" type="text" placeholder="Search..." name="s" autocomplete="off">
            <button type="submit" class="search-button" aria-label="Search"><span class="fa fa-search"></span></button>
          </form>
          <div class="live-search ltr"></div>
        </div>
        <div class="theme switchmode">
          <label class="switch">
            <input type="checkbox" id="theme-toggle-checkbox">
            <span class="slider round"></span>
          </label>
          <span class="text"><i class="fa fa-sun-o"></i> / <i class="fa fa-moon-o"></i></span>
        </div>
      </div>
      <div class="header-right" style="display:flex;align-items:center;gap:8px;">
        <nav id="site-navigation" role="navigation">
          <ul id="menu-menu" class="menu">${nav}</ul>
        </nav>
        <button id="btn-mobile-search-toggle" aria-label="Search" style="display:none;">
          <span class="fa fa-search"></span>
        </button>
        <div class="accont">
          <a href="${accountLink}" class="showlogin" title="${accountLabel}" style="${accountStyle}">
            <span class="fa ${accountIcon}"></span>
            <span class="login-text">${accountLabel}</span>
          </a>
        </div>
      </div>
    </div>
  </div>
  <div id="mobile-search-bar">
    <form method="get" action="#">
      <input type="text" placeholder="Search anime..." name="s" autocomplete="off">
      <button type="submit" aria-label="Search"><span class="fa fa-search"></span></button>
    </form>
    <div class="mobile-live-search live-search ltr"></div>
  </div>
</header>
`);
}

function renderFooter() {
  document.body.insertAdjacentHTML('beforeend', `
<footer>
  <div class="footer-inner">
    <p style="margin-bottom:6px;"><strong style="color:#fff;">⚡ Lalajo Anime</strong> — Nonton Streaming Anime Sub Indo</p>
    <p>Platform nonton streaming anime subtitle Indonesia terlengkap dan terupdate.</p>
    <p style="margin-top:8px;">
      <a href="${BASE}pages/anime-list">Daftar Anime</a> ·
      <a href="${BASE}pages/jadwal-rilis">Jadwal Rilis</a> ·
      <a href="${BASE}pages/batch">Batch</a>
    </p>
  </div>
</footer>
`);
}

// Auto-render saat DOM siap
document.addEventListener('DOMContentLoaded', () => {
  renderHeader();
  renderFooter();
});
