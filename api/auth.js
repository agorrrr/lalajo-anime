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

function getUsers() {
  if (fs.existsSync(TMP_FILE)) {
    try {
      const data = fs.readFileSync(TMP_FILE, 'utf-8');
      const list = JSON.parse(data);
      if (Array.isArray(list) && list.length) return list;
    } catch (e) {}
  }
  if (fs.existsSync(LOCAL_FILE)) {
    try {
      const data = fs.readFileSync(LOCAL_FILE, 'utf-8');
      const list = JSON.parse(data);
      if (Array.isArray(list) && list.length) {
        try { fs.writeFileSync(TMP_FILE, JSON.stringify(list, null, 2)); } catch (e) {}
        return list;
      }
    } catch (e) {}
  }
  return DEFAULT_USERS;
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

  const action = req.query.action || body.action || '';

  // 1. GET: Ambil Daftar Users (untuk Admin)
  if (req.method === 'GET' || url.includes('/admin/users') || action === 'users') {
    const list = getUsers();
    const safeUsers = list.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email || '',
      role: u.role || 'user',
      avatar: u.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${u.username}`,
      created_at: u.created_at || ''
    }));
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

      // Akun hardcoded fallback jika belum ada di list
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

      const safeUser = {
        id: user.id,
        username: user.username,
        email: user.email || '',
        role: user.role || 'user',
        avatar: user.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.username}`
      };

      return res.status(200).json({
        status: 'success',
        token: 'token_' + user.id + '_' + Date.now(),
        user: safeUser
      });
    }

    // 2b. CREATE VIP (Admin)
    if (url.includes('/admin/create-vip') || url.includes('create-vip') || action === 'create-vip') {
      const username = (body.username || '').trim();
      const email = (body.email || '').trim();
      const password = (body.password || '').trim();
      const role = body.role || 'vip';

      if (!username || !password) {
        return res.status(400).json({ status: 'error', message: 'Username dan password wajib diisi' });
      }

      let list = getUsers();
      const existingIndex = list.findIndex(u => (u.username || '').toLowerCase() === username.toLowerCase());

      let createdUser = null;
      if (existingIndex >= 0) {
        list[existingIndex].role = role;
        list[existingIndex].password = password;
        if (email) list[existingIndex].email = email;
        createdUser = list[existingIndex];
      } else {
        createdUser = {
          id: Date.now(),
          username,
          email: email || '',
          password,
          role,
          avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`,
          created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        };
        list.push(createdUser);
      }

      saveUsers(list);

      const safeUser = {
        id: createdUser.id,
        username: createdUser.username,
        email: createdUser.email,
        role: createdUser.role,
        avatar: createdUser.avatar,
        created_at: createdUser.created_at
      };

      return res.status(200).json({
        status: 'success',
        message: `Akun VIP ${username} berhasil didaftarkan`,
        user: safeUser
      });
    }

    // 2c. UPDATE ROLE (Admin)
    if (url.includes('/admin/update-role') || action === 'update-role') {
      const userId = parseInt(body.user_id);
      const newRole = body.role || 'user';

      let list = getUsers();
      const user = list.find(u => u.id === userId);
      if (!user) {
        return res.status(404).json({ status: 'error', message: 'User tidak ditemukan' });
      }

      user.role = newRole;
      saveUsers(list);
      return res.status(200).json({ status: 'success', message: 'Role user berhasil diperbarui' });
    }

    // 2d. DELETE USER (Admin)
    if (url.includes('/admin/delete-user') || action === 'delete-user') {
      const userId = parseInt(body.user_id);
      let list = getUsers();
      list = list.filter(u => u.id !== userId);
      saveUsers(list);
      return res.status(200).json({ status: 'success', message: 'User berhasil dihapus' });
    }

    // 2e. REGISTER PENONTON
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

      const safeUser = {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        avatar: newUser.avatar
      };

      return res.status(200).json({
        status: 'success',
        token: 'token_' + newUser.id + '_' + Date.now(),
        user: safeUser
      });
    }
  }

  return res.status(404).json({ status: 'error', message: 'Endpoint auth tidak ditemukan' });
}
