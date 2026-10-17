import fs from 'fs';
import path from 'path';
import os from 'os';

const TMP_FILE = path.join(os.tmpdir(), 'users.json');
const LOCAL_FILE = path.join(process.cwd(), 'data', 'users.json');

const DEFAULT_USERS = [
  {
    id: 1,
    username: 'ezakasep',
    email: 'admin@lalajo.anime',
    password: 'ezakasep',
    role: 'admin',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ezakasep',
    created_at: '2026-10-12 10:00:00'
  }
];

function checkAndExpireVip(user) {
  if (user && user.role === 'vip') {
    if (user.vip_expires_at) {
      const expTime = new Date(user.vip_expires_at).getTime();
      if (!isNaN(expTime) && expTime <= Date.now()) {
        user.role = 'user'; // Otomatis beralih ke akun reguler saat expired
        user.vip_expired = true;
        return true;
      }
    }
  }
  return false;
}

function calculateVipExpiry(duration, currentExpiry) {
  if (duration === 'permanent') {
    return null; // Selamanya
  }
  const durationsMs = {
    '1d': 1 * 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1m': 30 * 24 * 60 * 60 * 1000,
    '1y': 365 * 24 * 60 * 60 * 1000,
  };
  const addMs = durationsMs[duration] || durationsMs['1m'];

  // Jika masa aktif masih berjalan, perpanjangan ditambahkan dari sisa waktu yang ada
  // Jika sudah expired atau belum ada, ditambahkan dari sekarang
  let baseTime = Date.now();
  if (currentExpiry) {
    const curTime = new Date(currentExpiry).getTime();
    if (!isNaN(curTime) && curTime > Date.now()) {
      baseTime = curTime;
    }
  }
  return new Date(baseTime + addMs).toISOString();
}

function toSafeUser(u) {
  checkAndExpireVip(u);
  let daysLeft = null;
  if (u.role === 'vip') {
    if (!u.vip_expires_at) {
      daysLeft = 'permanent';
    } else {
      const diff = new Date(u.vip_expires_at).getTime() - Date.now();
      daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }
  }
  return {
    id: u.id,
    username: u.username,
    email: u.email || '',
    role: u.role || 'user',
    vip_duration: u.vip_duration || null,
    vip_expires_at: u.vip_expires_at || null,
    vip_expired: !!u.vip_expired,
    vip_days_left: daysLeft,
    avatar: u.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${u.username}`,
    created_at: u.created_at || ''
  };
}

function getUsers() {
  let list = null;
  if (fs.existsSync(TMP_FILE)) {
    try {
      const data = fs.readFileSync(TMP_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length) list = parsed;
    } catch (e) {}
  }
  if (!list && fs.existsSync(LOCAL_FILE)) {
    try {
      const data = fs.readFileSync(LOCAL_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length) {
        list = parsed;
        try { fs.writeFileSync(TMP_FILE, JSON.stringify(list, null, 2)); } catch (e) {}
      }
    } catch (e) {}
  }
  if (!list) list = DEFAULT_USERS;

  // Otomatis cek status expired VIP
  let changed = false;
  list.forEach(u => {
    if (checkAndExpireVip(u)) changed = true;
  });
  if (changed) {
    saveUsers(list);
  }

  return list;
}

function saveUsers(list) {
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error('Gagal menulis ke /tmp/users.json', e);
  }
  try {
    if (fs.existsSync(path.dirname(LOCAL_FILE))) {
      fs.writeFileSync(LOCAL_FILE, JSON.stringify(list, null, 2));
    }
  } catch (e) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.url || '';
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const query = req.query || {};
  const action = query.action || body.action || '';

  // 1. GET: Ambil Daftar Users (untuk Admin) atau Cek Status Diri
  if (req.method === 'GET' || url.includes('/admin/users') || action === 'users' || action === 'me') {
    const list = getUsers();

    // Jika action === 'me'
    if (action === 'me' || url.includes('/auth/me')) {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (token) {
        const parts = token.split('_');
        const uid = parts[1] === 'admin' ? 1 : parseInt(parts[1]);
        const user = list.find(u => u.id === uid);
        if (user) {
          return res.status(200).json({ status: 'success', user: toSafeUser(user) });
        }
      }
    }

    const safeUsers = list.map(toSafeUser);
    return res.status(200).json({ status: 'success', users: safeUsers });
  }

  // 2. POST Handler
  if (req.method === 'POST') {
    // 2a. LOGIN
    if (url.includes('/auth/login') || url.includes('/login') || action === 'login') {
      const usernameInput = (body.username || '').trim();
      const passwordInput = (body.password || '').trim();

      if (!usernameInput || !passwordInput) {
        return res.status(400).json({ status: 'error', message: 'Username dan password wajib diisi' });
      }

      const list = getUsers();
      const user = list.find(u => {
        const uMatch = (u.username || '').toLowerCase() === usernameInput.toLowerCase();
        const eMatch = u.email && (u.email || '').toLowerCase() === usernameInput.toLowerCase();
        return (uMatch || eMatch) && String(u.password).trim() === passwordInput;
      });

      // Akun hardcoded fallback admin
      if (!user && usernameInput.toLowerCase() === 'ezakasep' && passwordInput === 'ezakasep') {
        const adminUser = {
          id: 1,
          username: 'ezakasep',
          email: 'admin@lalajo.anime',
          role: 'admin',
          avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ezakasep'
        };
        return res.status(200).json({
          status: 'success',
          token: 'token_admin_' + Date.now(),
          user: adminUser
        });
      }

      if (!user) {
        return res.status(401).json({ status: 'error', message: 'Username atau password salah' });
      }

      // Pastikan cek expiry VIP saat login
      checkAndExpireVip(user);
      saveUsers(list);

      return res.status(200).json({
        status: 'success',
        token: 'token_' + user.id + '_' + Date.now(),
        user: toSafeUser(user)
      });
    }

    // 2b. CREATE VIP (Admin)
    if (url.includes('/admin/create-vip') || url.includes('create-vip') || action === 'create-vip') {
      const username = (body.username || '').trim();
      const email = (body.email || '').trim();
      const password = (body.password || '').trim();
      const role = body.role || 'vip';
      const duration = body.duration || '1m'; // 1d, 1w, 1m, 1y, permanent

      if (!username || !password) {
        return res.status(400).json({ status: 'error', message: 'Username dan password wajib diisi' });
      }

      let list = getUsers();
      const existingIndex = list.findIndex(u => (u.username || '').toLowerCase() === username.toLowerCase());

      const expiresAt = calculateVipExpiry(duration, null);

      let createdUser = null;
      if (existingIndex >= 0) {
        list[existingIndex].role = role;
        list[existingIndex].password = password;
        if (email) list[existingIndex].email = email;
        list[existingIndex].vip_duration = duration;
        list[existingIndex].vip_expires_at = expiresAt;
        list[existingIndex].vip_expired = false;
        createdUser = list[existingIndex];
      } else {
        createdUser = {
          id: Date.now(),
          username,
          email: email || '',
          password,
          role,
          vip_duration: duration,
          vip_expires_at: expiresAt,
          vip_expired: false,
          avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`,
          created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        };
        list.push(createdUser);
      }

      saveUsers(list);

      return res.status(200).json({
        status: 'success',
        message: `Akun VIP ${username} berhasil didaftarkan (${duration === 'permanent' ? 'Permanent' : duration})`,
        user: toSafeUser(createdUser)
      });
    }

    // 2c. PERPANJANG VIP (Admin / Kapan Saja)
    if (url.includes('/admin/extend-vip') || action === 'extend-vip') {
      const userId = parseInt(body.user_id);
      const duration = body.duration || '1m'; // 1d, 1w, 1m, 1y, permanent

      let list = getUsers();
      const user = list.find(u => u.id === userId);
      if (!user) {
        return res.status(404).json({ status: 'error', message: 'User tidak ditemukan' });
      }

      // Perpanjangan: jika belum expired, tambah ke sisa waktu; jika sudah, mulai dari sekarang
      const newExpiry = calculateVipExpiry(duration, user.vip_expires_at);
      user.role = 'vip';
      user.vip_duration = duration;
      user.vip_expires_at = newExpiry;
      user.vip_expired = false;

      saveUsers(list);

      return res.status(200).json({
        status: 'success',
        message: `VIP ${user.username} berhasil diperpanjang (${duration === 'permanent' ? 'Permanent' : duration})`,
        user: toSafeUser(user)
      });
    }

    // 2d. UPDATE ROLE (Admin)
    if (url.includes('/admin/update-role') || action === 'update-role') {
      const userId = parseInt(body.user_id);
      const newRole = body.role || 'user';
      const duration = body.duration || '1m';

      let list = getUsers();
      const user = list.find(u => u.id === userId);
      if (!user) {
        return res.status(404).json({ status: 'error', message: 'User tidak ditemukan' });
      }

      user.role = newRole;
      if (newRole === 'vip') {
        user.vip_duration = duration;
        user.vip_expires_at = calculateVipExpiry(duration, user.vip_expires_at);
        user.vip_expired = false;
      } else if (newRole === 'user') {
        user.vip_expires_at = null;
      }

      saveUsers(list);
      return res.status(200).json({ status: 'success', message: 'Role user berhasil diperbarui', user: toSafeUser(user) });
    }

    // 2e. DELETE USER (Admin)
    if (url.includes('/admin/delete-user') || action === 'delete-user') {
      const userId = parseInt(body.user_id);
      let list = getUsers();
      list = list.filter(u => u.id !== userId);
      saveUsers(list);
      return res.status(200).json({ status: 'success', message: 'User berhasil dihapus' });
    }

    // 2f. REGISTER PENONTON
    if (url.includes('/auth/register') || url.includes('/register') || action === 'register') {
      const username = (body.username || '').trim();
      const email = (body.email || '').trim();
      const password = (body.password || '').trim();

      if (!username || !password) {
        return res.status(400).json({ status: 'error', message: 'Username dan password wajib diisi' });
      }

      let list = getUsers();
      if (list.some(u => (u.username || '').toLowerCase() === username.toLowerCase())) {
        return res.status(400).json({ status: 'error', message: 'Username sudah digunakan' });
      }

      const newUser = {
        id: Date.now(),
        username,
        email: email || '',
        password,
        role: 'user',
        avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`,
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };

      list.push(newUser);
      saveUsers(list);

      return res.status(200).json({
        status: 'success',
        token: 'token_' + newUser.id + '_' + Date.now(),
        user: toSafeUser(newUser)
      });
    }
  }

  return res.status(404).json({ status: 'error', message: 'Endpoint auth tidak ditemukan' });
}
