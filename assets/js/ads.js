// Lalajo Anime - Ads Manager & Auto Injector
const AdsManager = {
  defaultConfig: {
    popunder: {
      enabled: true,
      clicks: 2,
      url: "https://otakudesu.cloud"
    },
    banner_top: {
      enabled: true,
      type: "image",
      image_url: "https://placehold.co/728x90/18181b/38bdf8?text=IKLAN+BANNER+ATAS+728x90+(Pasang+Iklan+Disini)",
      link_url: "https://google.com",
      code: ""
    },
    banner_player_bottom: {
      enabled: true,
      type: "image",
      image_url: "https://placehold.co/728x90/18181b/f59e0b?text=IKLAN+BAWAH+PLAYER+728x90+(Pasang+Iklan+Disini)",
      link_url: "https://google.com",
      code: ""
    },
    banner_floating: {
      enabled: true,
      type: "image",
      image_url: "/assets/images/placeholder_floating.svg",
      link_url: "https://auctionr.org/4/08ce3909d178534b7aee7adf30cb2fa7",
      code: ""
    },
    banner_center: {
      enabled: true,
      type: "image",
      image_url: "/assets/images/placeholder_center.svg",
      link_url: "https://auctionr.org/4/08ce3909d178534b7aee7adf30cb2fa7",
      code: ""
    }
  },

  async load() {
    try {
      const res = await fetch('/api/ads');
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length) {
          localStorage.setItem('ads_config', jsonStringifySafe(data));
          return data;
        }
      }
    } catch (e) {
      console.warn('Gagal memuat ads dari API, fallback ke localStorage:', e);
    }
    const saved = localStorage.getItem('ads_config');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return this.defaultConfig;
  },

  async save(config) {
    localStorage.setItem('ads_config', jsonStringifySafe(config));
    try {
      const res = await fetch('/api/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      return await res.json();
    } catch (e) {
      console.warn('Gagal menyimpan ke /api/ads, tersimpan di browser:', e);
      return { status: 'local_only' };
    }
  },

  isAdFreeUser() {
    try {
      if (sessionStorage.getItem('admin_logged_in') === 'true') return true;
      const raw = localStorage.getItem('auth_user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u) {
          if (u.role === 'admin') return true;
          if (u.role === 'vip') {
            if (u.vip_expires_at) {
              const exp = new Date(u.vip_expires_at).getTime();
              if (!isNaN(exp) && exp <= Date.now()) {
                u.role = 'user';
                u.vip_expired = true;
                localStorage.setItem('auth_user', JSON.stringify(u));
                return false;
              }
            }
            return true;
          }
        }
      }
    } catch (e) {}
    return false;
  },

  renderSlot(element, slotData) {
    if (this.isAdFreeUser() || !element || !slotData || !slotData.enabled) {
      if (element) element.style.display = 'none';
      return;
    }

    element.style.display = 'block';
    if (slotData.type === 'code' && slotData.code) {
      element.innerHTML = slotData.code;
      // Eksekusi inline script jika ada
      const scripts = element.querySelectorAll('script');
      scripts.forEach(s => {
        const newS = document.createElement('script');
        if (s.src) newS.src = s.src;
        else newS.textContent = s.textContent;
        document.body.appendChild(newS);
      });
    } else {
      element.innerHTML = `
        <a href="${slotData.link_url || '#'}" target="_blank" rel="noopener noreferrer" style="display:inline-block;max-width:100%;text-decoration:none;">
          <img src="${slotData.image_url}" alt="Iklan Sponsor" style="max-width:100%;height:auto;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.2);display:block;margin:0 auto;" onerror="this.src='/assets/images/placeholder_banner.svg'">
        </a>
      `;
    }
  },

  renderCenter(videoAreaEl, slotData) {
    if (this.isAdFreeUser() || !videoAreaEl || !slotData || !slotData.enabled) return;
    if (document.getElementById('player-center-ad')) return;

    const overlay = document.createElement('div');
    overlay.id = 'player-center-ad';
    overlay.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 25;
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 90%;
      box-shadow: 0 10px 30px rgba(0,0,0,0.85);
      border-radius: 6px;
      overflow: hidden;
      cursor: default;
    `;

    // Tombol merah "Tutup Iklan" di atas banner
    const closeBar = document.createElement('div');
    closeBar.className = 'ad-center-close-bar';
    closeBar.innerHTML = '<span class="fa fa-times-circle"></span> Tutup Iklan';
    closeBar.style.cssText = `
      width: 100%;
      background: #e11d48;
      color: #fff;
      text-align: center;
      padding: 7px 16px;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      letter-spacing: 0.5px;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s;
      box-sizing: border-box;
    `;
    closeBar.onmouseover = () => closeBar.style.background = '#be123c';
    closeBar.onmouseout = () => closeBar.style.background = '#e11d48';

    const adContent = document.createElement('div');
    adContent.style.cssText = 'background: #000; display: flex; justify-content: center; align-items: center; width: 100%;';

    if (slotData.type === 'code' && slotData.code) {
      adContent.innerHTML = slotData.code;
      const scripts = adContent.querySelectorAll('script');
      scripts.forEach(s => {
        const newS = document.createElement('script');
        if (s.src) newS.src = s.src;
        else newS.textContent = s.textContent;
        document.body.appendChild(newS);
      });
    } else {
      adContent.innerHTML = `
        <a href="${slotData.link_url || '#'}" target="_blank" rel="noopener noreferrer" style="display:block;line-height:0;cursor:pointer;">
          <img src="${slotData.image_url}" alt="Sponsor" style="max-width:320px;max-height:240px;width:100%;height:auto;display:block;object-fit:cover;" onerror="this.src='/assets/images/placeholder_center.svg'">
        </a>
      `;
    }

    closeBar.addEventListener('click', (e) => {
      e.stopPropagation();
      overlay.remove();
      videoAreaEl.setAttribute('data-center-ad-closed', 'true');
    });

    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    overlay.appendChild(closeBar);
    overlay.appendChild(adContent);
    videoAreaEl.appendChild(overlay);
  },

  async initSlots() {
    if (this.isAdFreeUser()) {
      // Hapus atau sembunyikan semua elemen iklan untuk VIP dan Admin
      document.querySelectorAll('.ad-slot-top, .ad-slot-player-bottom, #floating-ad-bar, #player-center-ad').forEach(el => {
        el.style.display = 'none';
        if (el.parentNode && el.id === 'floating-ad-bar') el.remove();
      });
      return;
    }

    const config = await this.load();

    // 1. Banner atas (top)
    const topSlots = document.querySelectorAll('.ad-slot-top');
    topSlots.forEach(slot => this.renderSlot(slot, config.banner_top));

    // 2. Banner bawah player
    const playerBottomSlots = document.querySelectorAll('.ad-slot-player-bottom');
    playerBottomSlots.forEach(slot => this.renderSlot(slot, config.banner_player_bottom));

    // 3. Floating sticky banner (bawah layar dengan tombol X)
    if (config.banner_floating && config.banner_floating.enabled) {
      this.renderFloating(config.banner_floating);
    }

    // 4. Banner tengah player (Pop-up Tutup Iklan)
    const videoAreaEl = document.querySelector('.video-area');
    if (videoAreaEl && config.banner_center && config.banner_center.enabled) {
      this.renderCenter(videoAreaEl, config.banner_center);
    }
  },

  renderFloating(slotData) {
    if (this.isAdFreeUser() || !slotData || !slotData.enabled) return;
    if (document.getElementById('floating-ad-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'floating-ad-bar';
    bar.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      background: rgba(15, 23, 42, 0.95);
      padding: 8px 16px 8px 12px;
      border-radius: 8px 8px 0 0;
      box-shadow: 0 -4px 16px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 95vw;
      backdrop-filter: blur(6px);
      border: 1px solid rgba(255,255,255,0.1);
      border-bottom: none;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Tutup Iklan';
    closeBtn.style.cssText = `
      background: #ef4444;
      color: #fff;
      border: none;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    `;
    closeBtn.onclick = () => bar.remove();

    const adContent = document.createElement('div');
    adContent.style.cssText = 'overflow: hidden; max-height: 90px; display: flex; align-items: center;';
    this.renderSlot(adContent, slotData);

    bar.appendChild(adContent);
    bar.appendChild(closeBtn);
    document.body.appendChild(bar);
  },

  setupVideoPopunder(videoAreaEl, playVideoCallback) {
    if (!videoAreaEl) return;

    // VIP & Admin bebas popunder sepenuhnya: klik langsung play video
    if (this.isAdFreeUser()) {
      videoAreaEl.addEventListener('click', (e) => {
        if (!videoAreaEl.classList.contains('playing')) {
          playVideoCallback();
        }
      });
      return;
    }

    let clickCount = 0;

    videoAreaEl.addEventListener('click', async (e) => {
      // 1. Cek apakah banner tengah masih ada dan belum di-close oleh pengunjung
      const centerAd = document.getElementById('player-center-ad');
      if (centerAd) {
        // Efek visual: kedipkan tombol Tutup Iklan agar pengunjung sadar harus klik tutup iklan dulu
        const closeBtn = centerAd.querySelector('.ad-center-close-bar');
        if (closeBtn) {
          closeBtn.style.transform = 'scale(1.06)';
          closeBtn.style.boxShadow = '0 0 12px #e11d48';
          setTimeout(() => {
            closeBtn.style.transform = 'scale(1)';
            closeBtn.style.boxShadow = 'none';
          }, 250);
        }
        return;
      }

      // 2. Jika sudah bermain, biarkan kontrol player berjalan normal
      if (videoAreaEl.classList.contains('playing')) return;

      const config = await this.load();
      const pop = config.popunder || { enabled: true, clicks: 2, url: "https://otakudesu.cloud" };

      if (pop.enabled && clickCount < (pop.clicks || 2)) {
        clickCount++;
        // Buka iklan di tab baru tersembunyi
        window.open(pop.url, '_blank');
        return;
      }

      // Klik ke-(clicks+1): jalankan video
      playVideoCallback();
    });
  }
};

function jsonStringifySafe(obj) {
  try { return JSON.stringify(obj, null, 2); } catch (e) { return '{}'; }
}

// Auto init saat DOM siap
document.addEventListener('DOMContentLoaded', () => {
  AdsManager.initSlots();
});
