// ============================================
// Lalajo Anime - Main JavaScript
// ============================================

const DB = {
  anime: null,
  async load() {
    const cached = localStorage.getItem('anime_db');
    if (cached) {
      try {
        this.anime = JSON.parse(cached);
        return this.anime;
      } catch (e) {
        console.error('Failed to parse cached DB', e);
      }
    }
    if (this.anime) return this.anime;
    const inPages = window.location.pathname.split('/').some(p => p === 'pages');
    const path = inPages ? '../data/anime.json' : 'data/anime.json';
    const res = await fetch(path);
    this.anime = await res.json();
    localStorage.setItem('anime_db', JSON.stringify(this.anime));
    return this.anime;
  },
  save(list) {
    this.anime = list;
    localStorage.setItem('anime_db', JSON.stringify(list));
  }
};

// ── Dark mode ──
function initTheme() {
  const saved = localStorage.getItem('theme-mode') || 'darkmode';
  const isDark = (saved === 'darkmode' || saved === 'dark');
  if (isDark) {
    document.documentElement.classList.add('darkmode');
    document.body.classList.add('darkmode');
  } else {
    document.documentElement.classList.remove('darkmode');
    document.body.classList.remove('darkmode');
  }
  const cb = document.getElementById('theme-toggle-checkbox');
  if (cb) cb.checked = isDark;
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('darkmode');
  document.documentElement.classList.toggle('darkmode', isDark);
  localStorage.setItem('theme-mode', isDark ? 'darkmode' : 'lightmode');
  const cb = document.getElementById('theme-toggle-checkbox');
  if (cb) cb.checked = isDark;
}

// ── Mobile menu ──
function initMobileMenu() {
  const btnOpen  = document.getElementById('btn-mobile-menu');
  const btnClose = document.getElementById('close-mobile-menu');
  const drawer   = document.getElementById('mobile-menu-drawer');
  const overlay  = document.getElementById('mobile-menu-overlay');

  function open() {
    drawer?.classList.add('open');
    overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    drawer?.classList.remove('open');
    overlay?.classList.remove('open');
    document.body.style.overflow = '';
  }

  btnOpen?.addEventListener('click', open);
  btnClose?.addEventListener('click', close);
  overlay?.addEventListener('click', close);

  document.getElementById('mobile-drawer-theme-toggle')?.addEventListener('click', toggleTheme);
}

// ── Mobile search ──
function initMobileSearch() {
  const btn = document.getElementById('btn-mobile-search-toggle');
  const bar = document.getElementById('mobile-search-bar');
  btn?.addEventListener('click', () => bar?.classList.toggle('open'));
}

// ── Theme toggle checkbox ──
function initThemeToggle() {
  document.getElementById('theme-toggle-checkbox')?.addEventListener('change', toggleTheme);
}

// ── Live search ──
function initLiveSearch() {
  const inputs = document.querySelectorAll('.search_desktop input[name="s"], #mobile-search-bar input[name="s"]');
  inputs.forEach(input => {
    const dropdown = input.closest('form')?.parentElement?.querySelector('.live-search, .mobile-live-search');
    if (!dropdown) return;

    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { dropdown.classList.remove('active'); dropdown.innerHTML = ''; return; }
      timer = setTimeout(async () => {
        const list = await DB.load();
        const hits = list.filter(a => a.title.toLowerCase().includes(q)).slice(0, 8);
        if (!hits.length) { dropdown.classList.remove('active'); return; }
        dropdown.innerHTML = hits.map(a => `
          <a href="anime?slug=${a.slug}" class="live-search-item">
            <img src="${a.thumbnail}" alt="${a.title}" onerror="this.src='https://placehold.co/36x52/333/fff?text=N%2FA'">
            <div class="info">
              <div class="name">${a.title}</div>
              <div class="meta">${a.type} · ${a.status === 'Currently Airing' ? 'Ongoing' : 'Completed'}</div>
            </div>
          </a>`).join('');
        dropdown.classList.add('active');
      }, 250);
    });

    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    });

    // handle search form submit → go to anime list with query
    input.closest('form')?.addEventListener('submit', e => {
      e.preventDefault();
      const q = input.value.trim();
      const inPages = window.location.pathname.split('/').some(p => p === 'pages');
      if (q) window.location.href = `${inPages ? 'anime-list.html' : 'pages/anime-list.html'}?search=${encodeURIComponent(q)}`;
    });
  });
}

// ── Anime card HTML ──
function animeCardHTML(a) {
  const inPages = window.location.pathname.split('/').some(p => p === 'pages');
  const statusLabel = a.status === 'Currently Airing' ? 'Ongoing' : 'Completed';
  const genres = a.genres.slice(0, 4).map(g =>
    `<a href="${inPages ? 'anime-list.html' : 'pages/anime-list.html'}?genre=${encodeURIComponent(g)}">${g}</a>`).join('');
  return `
    <article class="animepost">
      <div class="animposx">
        <a href="${inPages ? 'anime.html' : 'pages/anime.html'}?slug=${a.slug}" title="${a.title}">
          <div class="content-thumb">
            <div class="ply"><i class="fa fa-play"></i></div>
            <img src="${a.thumbnail}" class="anmsa" alt="${a.title}" loading="lazy"
                 onerror="this.src='https://placehold.co/212x300/333/fff?text=N%2FA'">
            <div class="type ${a.type}">${a.type}</div>
            <div class="score"><i class="fa fa-star">★</i> ${a.score.toFixed(2)}</div>
          </div>
          <div class="data">
            <div class="title"><h2 title="${a.title}">${a.title}</h2></div>
            <div class="type">${statusLabel}</div>
          </div>
        </a>
      </div>
      <div class="stooltip" role="tooltip">
        <div class="title"><h4>${a.title}</h4></div>
        <div class="metadata">
          <span class="skor"><i class="fa fa-star">★</i> ${a.score.toFixed(2)}</span>
          <span class="type-badge">${a.type}</span>
          <span class="views">${a.views.toLocaleString()} Views</span>
        </div>
        <div class="ttls">${a.synopsis}</div>
        <div class="genres"><div class="mta">${genres}</div></div>
      </div>
    </article>`;
}

// ── Common init ──
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMobileMenu();
  initMobileSearch();
  initThemeToggle();
  initLiveSearch();
});
