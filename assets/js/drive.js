// ============================================
// Lalajo Anime - Google Drive Service & Sync (Client-Side & GIS Support)
// ============================================

const DRIVE_CONFIG = {
  API_KEY: localStorage.getItem('drive_api_key') || 'AIzaSyAPymJJWft8-tEgDQULUXelNxkr_GFPQ8Y',
  CLIENT_ID: localStorage.getItem('drive_client_id') || '1041776387984-52q2mbi5eqmn9vh61tt9nhl6omkalmao.apps.googleusercontent.com',
  ROOT_FOLDER_ID: localStorage.getItem('drive_folder_id') || '1tSYO6d2s-Sr5Ne2Do1ZzqwOkdb_bbkYi'
};

const DriveService = {
  async getStatus() {
    // 1. Cek token dari URL hash (jika redirect OAuth implicit)
    if (window.location.hash && window.location.hash.includes('access_token')) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const hashToken = hashParams.get('access_token');
      if (hashToken) {
        localStorage.setItem('drive_token', hashToken);
        history.replaceState(null, '', window.location.pathname + window.location.search);
        return { connected: true, token: hashToken };
      }
    }

    // 2. Cek token dari localStorage
    const token = localStorage.getItem('drive_token');
    if (token) {
      return { connected: true, token };
    }

    // 3. Fallback backend status jika di localhost
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (e) {}

    return { connected: false };
  },

  // 1. Login Google OAuth dengan Account Picker
  login(onSuccess) {
    // Gunakan Google Identity Services (GIS) jika tersedia
    if (window.google && google.accounts && google.accounts.oauth2) {
      try {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: DRIVE_CONFIG.CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/drive',
          prompt: 'select_account consent',
          callback: (response) => {
            if (response.error) {
              alert('Gagal otorisasi Google: ' + response.error);
              return;
            }
            if (response.access_token) {
              localStorage.setItem('drive_token', response.access_token);
              alert('🎉 Akun Google Drive Berhasil Terhubung!');
              if (typeof updateDriveStatus === 'function') updateDriveStatus();
              if (onSuccess) onSuccess();
            }
          }
        });
        client.requestAccessToken();
        return;
      } catch (err) {
        console.warn('GIS TokenClient error, fallback redirect:', err);
      }
    }

    // Fallback direct OAuth URL (Implicit Flow)
    const scope = encodeURIComponent('https://www.googleapis.com/auth/drive');
    const redirectUri = encodeURIComponent(window.location.origin + '/pages/admin.html');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=token&client_id=${DRIVE_CONFIG.CLIENT_ID}&redirect_uri=${redirectUri}&scope=${scope}&prompt=select_account%20consent`;
    window.location.href = authUrl;
  },

  // 1b. Putuskan koneksi Google Drive
  async disconnect() {
    localStorage.removeItem('drive_token');
    localStorage.removeItem('drive_connected');
    try {
      await fetch('/api/drive/disconnect', { method: 'POST' });
    } catch (e) {}
    if (typeof updateDriveStatus === 'function') updateDriveStatus();
    alert('Akun Google Drive berhasil diputuskan. Silakan klik "Hubungkan Akun Google" untuk memilih akun yang benar.');
  },

  // 2. Buat folder anime baru di Google Drive
  async createAnimeFolder(animeTitle) {
    const status = await this.getStatus();
    const token = status.token;
    if (!token) {
      throw new Error('Google Drive belum terhubung. Silakan login Google terlebih dahulu.');
    }

    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: animeTitle,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [DRIVE_CONFIG.ROOT_FOLDER_ID]
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Gagal membuat folder di Google Drive');
    }
    return await res.json();
  },

  // 3. Sinkronisasi Google Drive -> Web
  async syncFromDrive() {
    const status = await this.getStatus();
    const token = status.token;
    if (!token) {
      throw new Error('Google Drive belum terhubung. Silakan hubungkan akun Google terlebih dahulu.');
    }

    // Ambil subfolder anime di dalam folder root
    const q = encodeURIComponent(`'${DRIVE_CONFIG.ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=100`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Gagal membaca isi Google Drive');
    }

    const data = await res.json();
    const folders = data.files || [];
    const currentAnime = await DB.load();

    for (const folder of folders) {
      const slug = folder.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      let existing = currentAnime.find(a => a.drive_folder_id === folder.id || a.slug === slug);
      if (!existing) {
        currentAnime.push({
          id: Date.now() + Math.floor(Math.random() * 1000),
          title: folder.name,
          slug: slug,
          thumbnail: 'https://placehold.co/212x300/1e293b/fff?text=' + encodeURIComponent(folder.name),
          type: 'TV',
          status: 'Currently Airing',
          episodes: 12,
          score: 8.0,
          studio: 'Drive Studio',
          genres: ['Action'],
          synopsis: `Anime ${folder.name} tersinkronisasi langsung dari Google Drive.`,
          drive_folder_id: folder.id,
          episodes_list: [],
          views: 100,
          release_year: 2026,
          rating: 'PG-13'
        });
      }
    }

    await this.saveAnimeData(currentAnime);
    return currentAnime;
  },

  // 4. Hapus folder/file di Google Drive
  async deleteItem(id) {
    const status = await this.getStatus();
    const token = status.token;
    if (!token) return true;

    await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    return true;
  },

  // 5. Simpan perubahan data anime
  async saveAnimeData(animeList) {
    localStorage.setItem('anime_db', JSON.stringify(animeList));
    DB.anime = animeList;
    try {
      await fetch('/api/anime/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(animeList)
      });
    } catch (e) {}
  }
};
