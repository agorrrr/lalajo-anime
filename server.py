import base64
import http.server
import json
import os
import socket
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
import database

database.init_db()

PORT = int(os.environ.get("PORT", 8000))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def _load_env_file():
    env_path = os.path.join(DIRECTORY, ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip())
        except Exception:
            pass

_load_env_file()

CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = f"http://localhost:{PORT}/oauth2callback"
ROOT_FOLDER_ID = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "1tSYO6d2s-Sr5Ne2Do1ZzqwOkdb_bbkYi")
TOKEN_FILE = os.path.join(DIRECTORY, "token.json")
ANIME_JSON_FILE = os.path.join(DIRECTORY, "data", "anime.json")
ADS_JSON_FILE = os.path.join(DIRECTORY, "data", "ads.json")

def load_tokens():
    if os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_tokens(tokens):
    with open(TOKEN_FILE, "w", encoding="utf-8") as f:
        json.dump(tokens, f, indent=2)

def get_valid_access_token():
    tokens = load_tokens()
    if not tokens or "access_token" not in tokens:
        return None

    # Check expiration (buffer 60 seconds)
    expires_at = tokens.get("expires_at", 0)
    if time.time() < (expires_at - 60):
        return tokens["access_token"]

    # Needs refresh
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        return tokens.get("access_token")

    data = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }).encode("utf-8")

    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            new_tokens = json.loads(resp.read().decode("utf-8"))
            tokens["access_token"] = new_tokens["access_token"]
            tokens["expires_at"] = time.time() + new_tokens.get("expires_in", 3600)
            save_tokens(tokens)
            return tokens["access_token"]
    except Exception as e:
        print("Error refreshing token:", e)
        return tokens.get("access_token")

def drive_api_request(url, method="GET", data=None, headers=None):
    token = get_valid_access_token()
    if not token:
        raise Exception("Google Drive belum terotentikasi (login diperlukan)")

    req_headers = {"Authorization": f"Bearer {token}"}
    if headers:
        req_headers.update(headers)

    body_bytes = None
    if data is not None:
        if isinstance(data, dict):
            body_bytes = json.dumps(data).encode("utf-8")
            req_headers["Content-Type"] = "application/json"
        elif isinstance(data, (bytes, bytearray)):
            body_bytes = data
        elif isinstance(data, str):
            body_bytes = data.encode("utf-8")

    req = urllib.request.Request(url, data=body_bytes, headers=req_headers, method=method)
    with urllib.request.urlopen(req) as resp:
        content_type = resp.headers.get("Content-Type", "")
        res_data = resp.read()
        if "application/json" in content_type:
            return json.loads(res_data.decode("utf-8"))
        return res_data

def sync_users_to_json_file():
    try:
        all_u = database.get_all_users()
        u_file = os.path.join(DIRECTORY, "data", "users.json")
        pass_map = {}
        if os.path.exists(u_file):
            try:
                with open(u_file, "r", encoding="utf-8") as f:
                    for x in json.load(f):
                        pass_map[x.get("id")] = x.get("password")
            except Exception:
                pass
        export_list = []
        for u in all_u:
            export_list.append({
                "id": u["id"],
                "username": u["username"],
                "email": u["email"] or "",
                "password": pass_map.get(u["id"], "password123"),
                "role": u["role"],
                "avatar": u["avatar"] or f"https://api.dicebear.com/7.x/adventurer/svg?seed={u['username']}",
                "created_at": str(u["created_at"])
            })
        with open(u_file, "w", encoding="utf-8") as f:
            json.dump(export_list, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

class AppHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def address_string(self):
        # Bypass reverse DNS lookup socket.getfqdn() yang lambat di LAN
        host = self.client_address[0]
        if host.startswith("::ffff:"):
            return host[7:]
        return host

    def end_headers(self):
        if hasattr(self, "path") and (self.path.startswith("/assets/") or self.path.endswith(".css") or self.path.endswith(".js") or self.path.endswith(".woff2") or self.path.endswith(".svg")):
            self.send_header("Cache-Control", "public, max-age=86400")
        super().end_headers()

    def get_current_user(self):
        auth_header = self.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        if not token:
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            token = params.get("token", [None])[0]
            if not token:
                token = params.get("auth_token", [None])[0]
        if token:
            user = database.get_user_by_session(token)
            return user, token
        return None, None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # 1. OAuth Login URL (Google Drive Admin)
        if path == "/auth/login":
            scope = "https://www.googleapis.com/auth/drive"
            auth_url = (
                "https://accounts.google.com/o/oauth2/auth?"
                + urllib.parse.urlencode({
                    "response_type": "code",
                    "client_id": CLIENT_ID,
                    "redirect_uri": REDIRECT_URI,
                    "scope": scope,
                    "access_type": "offline",
                    "prompt": "select_account consent"
                })
            )
            self.send_response(302)
            self.send_header("Location", auth_url)
            self.end_headers()
            return

        # 1-disconnect. Logout / Disconnect Google Drive
        elif path == "/auth/logout-drive" or path == "/api/drive/disconnect":
            if os.path.exists(TOKEN_FILE):
                try:
                    os.remove(TOKEN_FILE)
                except Exception:
                    pass
            if path == "/api/drive/disconnect":
                self.send_json({"status": "success", "message": "Google Drive berhasil diputuskan"})
            else:
                self.send_response(302)
                self.send_header("Location", "/pages/admin.html?drive=disconnected")
                self.end_headers()
            return

        # 1b. OAuth Login URL (Google User / Penonton)
        elif path == "/auth/google/login":
            scope = "openid email profile"
            auth_url = (
                "https://accounts.google.com/o/oauth2/v2/auth?"
                + urllib.parse.urlencode({
                    "response_type": "code",
                    "client_id": CLIENT_ID,
                    "redirect_uri": REDIRECT_URI,
                    "scope": scope,
                    "state": "user_login",
                    "prompt": "select_account"
                })
            )
            self.send_response(302)
            self.send_header("Location", auth_url)
            self.end_headers()
            return

        # 1d. Auth Current User Me API
        elif path == "/api/auth/me":
            user, _ = self.get_current_user()
            if not user:
                self.send_json({"status": "error", "message": "Belum login"}, status=401)
                return
            self.send_json({"status": "success", "user": user})
            return

        # 1e. Comments API (GET)
        elif path == "/api/comments":
            params = urllib.parse.parse_qs(parsed.query)
            slug = params.get("slug", [""])[0]
            ep = params.get("ep", [1])[0]
            try:
                comments = database.get_comments(slug, int(ep))
                self.send_json({"status": "success", "comments": comments})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 1f. User Activity API (GET)
        elif path == "/api/user/activity":
            user, _ = self.get_current_user()
            if not user:
                self.send_json({"status": "error", "message": "Unauthorized"}, status=401)
                return
            activity = database.get_user_activity(user["id"])
            self.send_json({"status": "success", "activity": activity})
            return

        # 1f2. List All Users for Admin (GET)
        elif path == "/api/admin/users":
            try:
                users = database.get_all_users()
                self.send_json({"status": "success", "users": users})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 1g. Universal Anime Scraper API (GET)
        elif path == "/api/scrape":
            params = urllib.parse.parse_qs(parsed.query)
            target_url = params.get("url", [""])[0]
            if not target_url:
                self.send_json({"status": "error", "message": "Parameter 'url' dibutuhkan"}, status=400)
                return
            try:
                import re
                import scripts.scrape_samehadaku as scraper
                slug_m = re.search(r'/anime/([^/]+)/?', target_url)
                if slug_m:
                    slug = slug_m.group(1)
                else:
                    slug = target_url.rstrip('/').split('/')[-1] or "scraped-anime"
                slug = re.sub(r'[^a-zA-Z0-9-_]', '-', slug).lower()
                anime_data = scraper.scrape_anime_detail(slug, target_url, max_eps=12)
                if not anime_data:
                    self.send_json({"status": "error", "message": "Gagal mengambil data dari URL tersebut"}, status=400)
                    return
                self.send_json({"status": "success", "anime": anime_data})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 2. OAuth Callback (Google Drive Admin & Google User Login)
        elif path == "/oauth2callback":
            params = urllib.parse.parse_qs(parsed.query)
            code = params.get("code", [None])[0]
            state = params.get("state", [None])[0]
            error = params.get("error", [None])[0]

            if error:
                self.send_response(302)
                self.send_header("Location", f"/pages/login.html?error={urllib.parse.quote(error)}")
                self.end_headers()
                return

            if not code:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Error: Code parameter missing")
                return

            token_data = urllib.parse.urlencode({
                "code": code,
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "redirect_uri": REDIRECT_URI,
                "grant_type": "authorization_code"
            }).encode("utf-8")

            req = urllib.request.Request("https://oauth2.googleapis.com/token", data=token_data, method="POST")
            try:
                with urllib.request.urlopen(req) as resp:
                    tokens = json.loads(resp.read().decode("utf-8"))

                # Jika flow adalah login user / penonton
                if state == "user_login":
                    user_access_token = tokens.get("access_token")

                    user_req = urllib.request.Request(
                        "https://www.googleapis.com/oauth2/v2/userinfo",
                        headers={"Authorization": f"Bearer {user_access_token}"}
                    )
                    with urllib.request.urlopen(user_req) as uresp:
                        uinfo = json.loads(uresp.read().decode("utf-8"))

                    google_id = uinfo.get("id")
                    email = uinfo.get("email")
                    name = uinfo.get("name") or (email.split("@")[0] if email else "Penonton")
                    avatar = uinfo.get("picture")

                    user = database.get_or_create_google_user(google_id, email, name, avatar)
                    token = database.create_session(user["id"])

                    target_page = "/pages/admin.html" if user.get("role") == "admin" else "/pages/user.html"
                    self.send_response(302)
                    self.send_header("Location", f"{target_page}?auth_token={token}")
                    self.end_headers()
                    return

                # Flow Drive Admin sync
                tokens["expires_at"] = time.time() + tokens.get("expires_in", 3600)
                save_tokens(tokens)
                self.send_response(302)
                self.send_header("Location", "/pages/admin.html?oauth=success")
                self.end_headers()
            except Exception as e:
                self.send_response(302)
                self.send_header("Location", f"/pages/login.html?error={urllib.parse.quote(str(e))}")
                self.end_headers()
            return

        # 3. Status API
        elif path == "/api/status":
            token = get_valid_access_token()
            self.send_json({
                "connected": bool(token),
                "folder_id": ROOT_FOLDER_ID,
                "client_id": CLIENT_ID
            })
            return

        # 3b. Ads API
        elif path == "/api/ads":
            ads_data = {}
            if os.path.exists(ADS_JSON_FILE):
                try:
                    with open(ADS_JSON_FILE, "r", encoding="utf-8") as f:
                        ads_data = json.load(f)
                except Exception:
                    ads_data = {}
            self.send_json(ads_data)
            return

        # 3c. Video Stream Proxy (Google Drive API -> Native HTML5 Video dengan Fullscreen)
        elif path == "/api/video/stream":
            params = urllib.parse.parse_qs(parsed.query)
            file_id = params.get("id", [None])[0]
            if not file_id:
                self.send_response(400)
                self.end_headers()
                return

            token = get_valid_access_token()
            if not token:
                self.send_response(302)
                self.send_header("Location", f"https://drive.google.com/uc?export=download&id={file_id}")
                self.end_headers()
                return

            drive_url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
            req_headers = {"Authorization": f"Bearer {token}"}
            client_range = self.headers.get("Range")
            if client_range:
                req_headers["Range"] = client_range

            req = urllib.request.Request(drive_url, headers=req_headers)
            try:
                resp = urllib.request.urlopen(req)
                self.send_response(resp.status)
                for h in ["Content-Type", "Content-Range", "Content-Length", "Accept-Ranges"]:
                    val = resp.headers.get(h)
                    if val:
                        self.send_header(h, val)
                if not resp.headers.get("Accept-Ranges"):
                    self.send_header("Accept-Ranges", "bytes")
                self.end_headers()

                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            except Exception as e:
                pass
            return

        # 4. Sync Anime dari Google Drive
        elif path == "/api/drive/sync":
            try:
                q = f"'{ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
                url = "https://www.googleapis.com/drive/v3/files?q=" + urllib.parse.quote(q) + "&fields=files(id,name)&pageSize=100"
                res = drive_api_request(url)
                folders = res.get("files", [])

                # Load anime.json
                current_anime = []
                if os.path.exists(ANIME_JSON_FILE):
                    try:
                        with open(ANIME_JSON_FILE, "r", encoding="utf-8") as f:
                            current_anime = json.load(f)
                    except Exception:
                        current_anime = []

                updated_list = []
                for folder in folders:
                    folder_id = folder["id"]
                    folder_name = folder["name"]

                    # Cari video di dalam folder ini
                    vq = f"'{folder_id}' in parents and (mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.video') and trashed = false"
                    vurl = "https://www.googleapis.com/drive/v3/files?q=" + urllib.parse.quote(vq) + "&fields=files(id,name)&orderBy=name"
                    try:
                        vres = drive_api_request(vurl)
                        videos = vres.get("files", [])
                    except Exception:
                        videos = []

                    episodes_list = []
                    for idx, v in enumerate(videos):
                        try:
                            drive_api_request(f"https://www.googleapis.com/drive/v3/files/{v['id']}/permissions", method="POST", data={"role": "reader", "type": "anyone"})
                        except Exception:
                            pass
                        name_clean = os.path.splitext(v["name"])[0]
                        episodes_list.append({
                            "ep": idx + 1,
                            "title": name_clean,
                            "date": time.strftime("%Y-%m-%d"),
                            "drive_file_id": v["id"]
                        })

                    # Cocokkan dengan data yang ada
                    existing = next((a for a in current_anime if a.get("drive_folder_id") == folder_id or a.get("title", "").lower() == folder_name.lower()), None)

                    if existing:
                        existing["drive_folder_id"] = folder_id
                        existing["title"] = folder_name
                        if episodes_list:
                            existing["episodes_list"] = episodes_list
                            existing["episodes"] = len(episodes_list)
                        updated_list.append(existing)
                    else:
                        slug = "".join([c if c.isalnum() else "-" for c in folder_name.lower()]).strip("-")
                        updated_list.append({
                            "id": int(time.time() * 1000) + len(updated_list),
                            "slug": slug or f"anime-{folder_id}",
                            "title": folder_name,
                            "type": "TV",
                            "status": "Currently Airing",
                            "score": 8.00,
                            "views": 1,
                            "episodes": len(episodes_list) or 1,
                            "year": int(time.strftime("%Y")),
                            "season": "Fall",
                            "studio": "Drive Sync",
                            "synopsis": f"Anime {folder_name} tersinkronisasi langsung dari Google Drive.",
                            "genres": ["Action", "Adventure"],
                            "thumbnail": f"https://placehold.co/212x300/1e1e2e/cba6f7?text={urllib.parse.quote(folder_name)}",
                            "day": "Senin",
                            "time": "19:00",
                            "drive_folder_id": folder_id,
                            "episodes_list": episodes_list
                        })

                # Simpan update ke data/anime.json
                with open(ANIME_JSON_FILE, "w", encoding="utf-8") as f:
                    json.dump(updated_list, f, indent=2, ensure_ascii=False)

                self.send_json({
                    "status": "success",
                    "count": len(updated_list),
                    "anime": updated_list
                })
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=500)
            return

        # Clean URLs & File Mapping: Handle /watch, /watch.html, /pages/watch.html
        clean_path = path.rstrip("/")
        base_name = clean_path[:-5] if clean_path.endswith(".html") else clean_path

        if base_name:
            query_str = f"?{parsed.query}" if parsed.query else ""
            target1 = os.path.join(DIRECTORY, base_name.lstrip("/\\") + ".html")
            target2 = os.path.join(DIRECTORY, "pages", base_name.lstrip("/\\") + ".html")

            if os.path.isfile(target1):
                self.path = "/" + base_name.lstrip("/\\") + ".html" + query_str
            elif os.path.isfile(target2):
                self.path = "/pages/" + base_name.lstrip("/\\") + ".html" + query_str

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # 1. Buat folder anime baru di Google Drive
        if path == "/api/drive/create-folder":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            data = json.loads(body)
            anime_title = data.get("title", "").strip()

            if not anime_title:
                self.send_json({"status": "error", "message": "Judul anime tidak boleh kosong"}, status=400)
                return

            try:
                meta = {
                    "name": anime_title,
                    "mimeType": "application/vnd.google-apps.folder",
                    "parents": [ROOT_FOLDER_ID]
                }
                res = drive_api_request("https://www.googleapis.com/drive/v3/files", method="POST", data=meta)
                try:
                    drive_api_request(f"https://www.googleapis.com/drive/v3/files/{res['id']}/permissions", method="POST", data={"role": "reader", "type": "anyone"})
                except Exception:
                    pass
                self.send_json({"status": "success", "folder": res})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 2. Hapus file/folder di Google Drive
        elif path == "/api/drive/delete":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            data = json.loads(body)
            item_id = data.get("id")

            if not item_id:
                self.send_json({"status": "error", "message": "ID tidak ditemukan"}, status=400)
                return

            try:
                drive_api_request(f"https://www.googleapis.com/drive/v3/files/{item_id}", method="DELETE")
                self.send_json({"status": "success"})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 3. Simpan data anime ke anime.json
        elif path == "/api/anime/save":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            data = json.loads(body)
            with open(ANIME_JSON_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            self.send_json({"status": "success"})
            return

        # 4. Upload file gambar poster lokal
        elif path == "/api/upload-image":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                import base64
                data = json.loads(body.decode("utf-8"))
                filename = data.get("filename", f"poster_{int(time.time())}.jpg")
                data_url = data.get("data", "")
                if "," in data_url:
                    base64_data = data_url.split(",", 1)[1]
                else:
                    base64_data = data_url
                img_bytes = base64.b64decode(base64_data)

                safe_name = f"{int(time.time())}_" + "".join([c if c.isalnum() or c in ".-_" else "_" for c in filename])
                images_dir = os.path.join(DIRECTORY, "assets", "images")
                os.makedirs(images_dir, exist_ok=True)
                save_path = os.path.join(images_dir, safe_name)
                with open(save_path, "wb") as f:
                    f.write(img_bytes)

                self.send_json({
                    "status": "success",
                    "url": f"../assets/images/{safe_name}"
                })
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 5. Simpan pengaturan iklan
        elif path == "/api/ads":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            data = json.loads(body)
            with open(ADS_JSON_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            self.send_json({"status": "success", "ads": data})
            return

        # 6. Registrasi User / Penonton
        elif path == "/api/auth/register":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
                username = data.get("username", "").strip()
                email = data.get("email", "").strip()
                password = data.get("password", "").strip()
                if not username or not password:
                    self.send_json({"status": "error", "message": "Username dan password wajib diisi"}, status=400)
                    return
                user = database.create_user(username, email or None, password)
                token = database.create_session(user["id"])
                self.send_json({"status": "success", "user": user, "token": token})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=400)
            return

        # 6b. Verifikasi Google ID Token (Google Identity Services GIS)
        elif path == "/api/auth/google/verify":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
                credential = data.get("credential", "").strip()
                if not credential:
                    self.send_json({"status": "error", "message": "Credential Google kosong"}, status=400)
                    return

                verify_url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + urllib.parse.quote(credential)
                req = urllib.request.Request(verify_url)
                with urllib.request.urlopen(req) as resp:
                    uinfo = json.loads(resp.read().decode("utf-8"))

                aud = uinfo.get("aud")
                if aud != CLIENT_ID:
                    self.send_json({"status": "error", "message": "Client ID tidak cocok"}, status=401)
                    return

                google_id = uinfo.get("sub")
                email = uinfo.get("email")
                name = uinfo.get("name") or (email.split("@")[0] if email else "Penonton")
                avatar = uinfo.get("picture")

                user = database.get_or_create_google_user(google_id, email, name, avatar)
                token = database.create_session(user["id"])
                user_safe = {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "role": user["role"],
                    "avatar": user["avatar"],
                    "created_at": user["created_at"]
                }
                self.send_json({"status": "success", "user": user_safe, "token": token})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=400)
            return

        # 7. Login User / Penonton / Admin
        elif path == "/api/auth/login":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
                username = data.get("username", "").strip()
                password = data.get("password", "").strip()
                user = database.authenticate_user(username, password)
                if not user:
                    self.send_json({"status": "error", "message": "Username atau password salah!"}, status=401)
                    return
                token = database.create_session(user["id"])
                user_safe = {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "role": user["role"],
                    "avatar": user["avatar"],
                    "created_at": user["created_at"]
                }
                self.send_json({"status": "success", "user": user_safe, "token": token})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 8. Logout User / Penonton / Admin
        elif path == "/api/auth/logout":
            _, token = self.get_current_user()
            if token:
                database.delete_session(token)
            self.send_json({"status": "success"})
            return

        # 9. Tambah / Hapus Komentar Video Episode
        elif path == "/api/comments":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
                # Aksi hapus
                if data.get("action") == "delete" or data.get("delete_id"):
                    cid = int(data.get("delete_id") or data.get("id", 0))
                    database.delete_comment_by_id(cid)
                    # Sync ke data/comments.json
                    try:
                        all_c = database.get_all_comments_raw()
                        c_file = os.path.join(DIRECTORY, "data", "comments.json")
                        with open(c_file, "w", encoding="utf-8") as f:
                            json.dump(all_c, f, indent=2, ensure_ascii=False)
                    except Exception:
                        pass
                    self.send_json({"status": "success", "message": "Komentar dihapus"})
                    return

                # Aksi tambah komentar
                user, _ = self.get_current_user()
                if not user:
                    user = {
                        "id": data.get("user_id") or int(time.time()),
                        "username": data.get("username") or "Penonton",
                        "role": data.get("user_role") or "user",
                        "avatar": data.get("avatar") or f"https://api.dicebear.com/7.x/adventurer/svg?seed={data.get('username', 'user')}"
                    }

                slug = data.get("slug", "").strip()
                ep = int(data.get("ep", 1))
                comment_text = data.get("content", "").strip()
                if not comment_text:
                    self.send_json({"status": "error", "message": "Isi komentar tidak boleh kosong"}, status=400)
                    return

                cid = database.add_comment(slug, ep, user, comment_text)

                # Sync ke data/comments.json
                try:
                    all_c = database.get_all_comments_raw()
                    c_file = os.path.join(DIRECTORY, "data", "comments.json")
                    with open(c_file, "w", encoding="utf-8") as f:
                        json.dump(all_c, f, indent=2, ensure_ascii=False)
                except Exception:
                    pass

                self.send_json({"status": "success", "comment_id": cid})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 10. Hapus Komentar Video Episode (Endpoint Alternatif)
        elif path == "/api/comments/delete":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
                cid = int(data.get("id", 0))
                database.delete_comment_by_id(cid)
                try:
                    all_c = database.get_all_comments_raw()
                    c_file = os.path.join(DIRECTORY, "data", "comments.json")
                    with open(c_file, "w", encoding="utf-8") as f:
                        json.dump(all_c, f, indent=2, ensure_ascii=False)
                except Exception:
                    pass
                self.send_json({"status": "success"})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 11. Daftarkan Akun VIP Baru oleh Admin
        elif path == "/api/admin/create-vip":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
                username = data.get("username", "").strip()
                email = data.get("email", "").strip() or None
                password = data.get("password", "").strip()
                if not username or not password:
                    self.send_json({"status": "error", "message": "Username dan password wajib diisi"}, status=400)
                    return
                user = database.create_user(username, email, password, role="vip")
                sync_users_to_json_file()
                self.send_json({"status": "success", "user": user})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=400)
            return

        # 12. Ubah Role User (VIP / Reguler) oleh Admin
        elif path == "/api/admin/update-role":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
                user_id = data.get("user_id")
                role = data.get("role", "user")
                database.update_user_role(user_id, role)
                sync_users_to_json_file()
                self.send_json({"status": "success"})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=400)
            return

        # 13. Hapus User oleh Admin
        elif path == "/api/admin/delete-user":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
                user_id = data.get("user_id")
                database.delete_user(user_id)
                sync_users_to_json_file()
                self.send_json({"status": "success"})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=400)
            return

        self.send_response(404)
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

class DualStackServer(http.server.ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()

handler = AppHandler
app = AppHandler
application = AppHandler

if __name__ == "__main__":
    print(f"Lalajo Anime Server berjalan di http://localhost:{PORT}")
    try:
        server = DualStackServer(("::", PORT), AppHandler)
    except Exception:
        server = http.server.ThreadingHTTPServer(("", PORT), AppHandler)
    server.serve_forever()
