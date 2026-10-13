// ============================================
// Lalajo Anime - Google Drive Service & Sync
// ============================================

const DRIVE_CONFIG = {
  API_KEY: localStorage.getItem('drive_api_key') || 'AIzaSyAPymJJWft8-tEgDQULUXelNxkr_GFPQ8Y',
  CLIENT_ID: localStorage.getItem('drive_client_id') || '1041776387984-52q2mbi5eqmn9vh61tt9nhl6omkalmao.apps.googleusercontent.com',
  ROOT_FOLDER_ID: localStorage.getItem('drive_folder_id') || '1tSYO6d2s-Sr5Ne2Do1ZzqwOkdb_bbkYi'
};

const DriveService = {
  async getStatus() {
    try {
      const res = await fetch('/api/status');
      return await res.json();
    } catch (e) {
      return { connected: false, error: e.message };
    }
  },

  // 1. Arahkan ke endpoint login Google OAuth
  login() {
    window.location.href = '/auth/login';
  },

  // 1b. Putuskan koneksi Google Drive
  async disconnect() {
    try {
      await fetch('/api/drive/disconnect', { method: 'POST' });
    } catch (e) {}
    window.location.href = '/auth/login';
  },

  // 2. Buat folder anime baru di Google Drive via backend
  async createAnimeFolder(animeTitle) {
    const res = await fetch('/api/drive/create-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: animeTitle })
    });
    const data = await res.json();
    if (!res.ok || data.status === 'error') {
      throw new Error(data.message || 'Gagal membuat folder di Drive');
    }
    return data.folder;
  },

  // 3. Sinkronisasi penuh Google Drive <-> Web
  async syncFromDrive() {
    const res = await fetch('/api/drive/sync');
    const data = await res.json();
    if (!res.ok || data.status === 'error') {
      throw new Error(data.message || 'Gagal sinkronisasi data dari Google Drive');
    }
    const list = data.anime || [];
    localStorage.setItem('anime_db', JSON.stringify(list));
    DB.anime = list;
    return list;
  },

  // 4. Hapus folder/file di Google Drive
  async deleteItem(id) {
    const res = await fetch('/api/drive/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (!res.ok || data.status === 'error') {
      throw new Error(data.message || 'Gagal menghapus di Drive');
    }
    return true;
  },

  // 5. Simpan perubahan ke data/anime.json
  async saveAnimeData(animeList) {
    localStorage.setItem('anime_db', JSON.stringify(animeList));
    DB.anime = animeList;
    try {
      await fetch('/api/anime/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(animeList)
      });
    } catch (e) {
      console.warn('Gagal menyimpan file lokal anime.json:', e);
    }
  }
};
