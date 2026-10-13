import fs from 'fs';
import path from 'path';
import os from 'os';

const TMP_FILE = path.join(os.tmpdir(), 'comments.json');
const LOCAL_FILE = path.join(process.cwd(), 'data', 'comments.json');

function getComments() {
  if (fs.existsSync(TMP_FILE)) {
    try {
      const data = fs.readFileSync(TMP_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {}
  }
  if (fs.existsSync(LOCAL_FILE)) {
    try {
      const data = fs.readFileSync(LOCAL_FILE, 'utf-8');
      const list = JSON.parse(data);
      try { fs.writeFileSync(TMP_FILE, JSON.stringify(list, null, 2)); } catch (e) {}
      return list;
    } catch (e) {}
  }
  return [];
}

function saveComments(list) {
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error('Gagal menulis ke /tmp/comments.json', e);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. GET: Ambil Komentar
  if (req.method === 'GET') {
    const { slug, ep } = req.query;
    const all = getComments();
    if (!slug) {
      return res.status(200).json({ status: 'success', comments: all });
    }
    const filtered = all.filter(c => c.anime_slug === slug && String(c.ep) === String(ep || 1));
    return res.status(200).json({ status: 'success', comments: filtered });
  }

  // 2. POST: Tambah Komentar atau Hapus
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) { body = {}; }
    }
    body = body || {};

    // Aksi hapus
    if (body.action === 'delete' || body.delete_id) {
      const targetId = parseInt(body.delete_id || body.id);
      let all = getComments();
      all = all.filter(c => c.id !== targetId);
      saveComments(all);
      return res.status(200).json({ status: 'success', message: 'Komentar berhasil dihapus' });
    }

    // Aksi tambah komentar
    const { slug, ep, content, user_id, username, user_role, avatar } = body;
    if (!content || !content.trim()) {
      return res.status(400).json({ status: 'error', message: 'Isi komentar tidak boleh kosong' });
    }

    const all = getComments();
    const newComment = {
      id: Date.now(),
      anime_slug: slug || 'general',
      ep: parseInt(ep || 1),
      user_id: user_id || Date.now(),
      username: username || 'Penonton',
      user_role: user_role || 'user',
      avatar: avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${username || 'user'}`,
      content: content.trim(),
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };

    all.unshift(newComment);
    saveComments(all);

    return res.status(200).json({ status: 'success', comment: newComment });
  }

  // 3. DELETE: Hapus Komentar
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ status: 'error', message: 'ID komentar dibutuhkan' });
    }
    let all = getComments();
    all = all.filter(c => String(c.id) !== String(id));
    saveComments(all);
    return res.status(200).json({ status: 'success', message: 'Komentar berhasil dihapus' });
  }

  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
}
