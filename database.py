import os
import sqlite3
import hashlib
import secrets
import time

if os.environ.get("VERCEL"):
    DB_PATH = "/tmp/lalajo.db"
    orig = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "lalajo.db")
    if not os.path.exists(DB_PATH) and os.path.exists(orig):
        import shutil
        try:
            shutil.copy2(orig, DB_PATH)
        except Exception:
            pass
else:
    DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "lalajo.db")

def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str, salt: str = None):
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode('utf-8')).hexdigest()
    return hashed, salt

def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    hashed, _ = hash_password(password, salt)
    return secrets.compare_digest(hashed, stored_hash)

def init_db():
    conn = get_connection()
    c = conn.cursor()

    # Table users
    c.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        password_hash TEXT,
        salt TEXT,
        role TEXT DEFAULT 'user',
        avatar TEXT,
        google_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # Table comments
    c.execute('''
    CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        anime_slug TEXT NOT NULL,
        ep INTEGER NOT NULL,
        user_id INTEGER,
        username TEXT NOT NULL,
        user_role TEXT DEFAULT 'user',
        avatar TEXT,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # Table sessions
    c.execute('''
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    conn.commit()

    # Check & seed default admin: ezakasep / ezakasep
    c.execute("SELECT id FROM users WHERE username = 'ezakasep'")
    admin_row = c.fetchone()
    if not admin_row:
        pw_hash, salt = hash_password("ezakasep")
        c.execute('''
        INSERT INTO users (username, email, password_hash, salt, role, avatar)
        VALUES (?, ?, ?, ?, ?, ?)
        ''', ("ezakasep", "admin@lalajo.anime", pw_hash, salt, "admin", "https://api.dicebear.com/7.x/bottts/svg?seed=ezakasep"))
        conn.commit()
        print("Default admin ezakasep berhasil dibuat di database SQLite!")

    conn.close()

def create_user(username, email, password, role="user", avatar=None, google_id=None):
    conn = get_connection()
    c = conn.cursor()
    pw_hash, salt = None, None
    if password:
        pw_hash, salt = hash_password(password)
    
    if not avatar:
        avatar = f"https://api.dicebear.com/7.x/adventurer/svg?seed={username}"

    try:
        c.execute('''
        INSERT INTO users (username, email, password_hash, salt, role, avatar, google_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (username, email, pw_hash, salt, role, avatar, google_id))
        conn.commit()
        user_id = c.lastrowid
        conn.close()
        return get_user_by_id(user_id)
    except sqlite3.IntegrityError as e:
        conn.close()
        if "username" in str(e).lower():
            raise Exception("Username sudah digunakan")
        if "email" in str(e).lower():
            raise Exception("Email sudah terdaftar")
        raise Exception(f"Gagal mendaftar: {e}")

def authenticate_user(username_or_email, password):
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
    SELECT * FROM users WHERE username = ? OR email = ?
    ''', (username_or_email, username_or_email))
    user = c.fetchone()
    conn.close()

    if not user:
        return None
    if not user["password_hash"] or not user["salt"]:
        return None
    if verify_password(password, user["password_hash"], user["salt"]):
        return dict(user)
    return None

def get_user_by_id(user_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id, username, email, role, avatar, created_at FROM users WHERE id = ?", (user_id,))
    user = c.fetchone()
    conn.close()
    return dict(user) if user else None

def get_or_create_google_user(google_id, email, name, avatar):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE google_id = ? OR email = ?", (google_id, email))
    user = c.fetchone()
    if user:
        # Update avatar / google_id jika belum ada
        c.execute("UPDATE users SET google_id = ?, avatar = coalesce(avatar, ?) WHERE id = ?", (google_id, avatar, user["id"]))
        conn.commit()
        conn.close()
        return get_user_by_id(user["id"])
    
    # Buat user baru
    # Pastikan username unik
    base_username = "".join(c for c in name.lower() if c.isalnum()) or "penonton"
    username = base_username
    counter = 1
    while True:
        c.execute("SELECT id FROM users WHERE username = ?", (username,))
        if not c.fetchone():
            break
        username = f"{base_username}{counter}"
        counter += 1

    c.execute('''
    INSERT INTO users (username, email, role, avatar, google_id)
    VALUES (?, ?, 'user', ?, ?)
    ''', (username, email, avatar, google_id))
    conn.commit()
    user_id = c.lastrowid
    conn.close()
    return get_user_by_id(user_id)

def create_session(user_id):
    token = secrets.token_hex(24)
    conn = get_connection()
    c = conn.cursor()
    c.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    conn.commit()
    conn.close()
    return token

def get_user_by_session(token):
    if not token:
        return None
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
    SELECT u.id, u.username, u.email, u.role, u.avatar, u.created_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
    ''', (token,))
    user = c.fetchone()
    conn.close()
    return dict(user) if user else None

def delete_session(token):
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

# ── Komentar ──
def add_comment(anime_slug, ep, user_id, content):
    user = get_user_by_id(user_id)
    if not user:
        raise Exception("User tidak ditemukan")
    
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
    INSERT INTO comments (anime_slug, ep, user_id, username, user_role, avatar, content)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (anime_slug, int(ep), user["id"], user["username"], user["role"], user["avatar"], content))
    conn.commit()
    comment_id = c.lastrowid
    conn.close()
    return comment_id

def get_comments(anime_slug, ep):
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
    SELECT id, anime_slug, ep, user_id, username, user_role, avatar, content, created_at
    FROM comments
    WHERE anime_slug = ? AND ep = ?
    ORDER BY id DESC
    ''', (anime_slug, int(ep)))
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_comment(comment_id, user_id):
    user = get_user_by_id(user_id)
    if not user:
        raise Exception("Unauthorized")
    
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM comments WHERE id = ?", (comment_id,))
    com = c.fetchone()
    if not com:
        conn.close()
        raise Exception("Komentar tidak ditemukan")
    
    # Hanya admin atau pemilik komentar yang bisa menghapus
    if user["role"] != "admin" and com["user_id"] != user["id"]:
        conn.close()
        raise Exception("Tidak memiliki izin untuk menghapus komentar ini")
    
    c.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
    conn.commit()
    conn.close()
    return True

def get_user_activity(user_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
    SELECT id, anime_slug, ep, content, created_at
    FROM comments
    WHERE user_id = ?
    ORDER BY id DESC LIMIT 20
    ''', (user_id,))
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]

if __name__ == "__main__":
    init_db()
    print("Database SQLite terinisialisasi.")
