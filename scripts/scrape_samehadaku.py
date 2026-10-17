import urllib.request
import urllib.parse
import re
import html as html_lib
import json
import time
import os
import sys
import argparse
from concurrent.futures import ThreadPoolExecutor

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DB_FILE = os.path.join(DATA_DIR, "anime.json")
BACKUP_FILE = os.path.join(DATA_DIR, "anime_manual_backup.json")

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
}

# 5 Sumber Utama untuk Auto-Sync Setiap Jam
HOURLY_SOURCES = [
    {
        "name": "Samehadaku",
        "url": "https://v2.samehadaku.how/anime-terbaru/",
        "base": "https://v2.samehadaku.how",
        "pattern": r'href=["\'](https?://v2\.samehadaku\.how/anime/[^/?"\'\s]+/?)(?:\?[^"\'\s]*)?["\']'
    },
    {
        "name": "Anime-Indo",
        "url": "https://anime-indo.lol/",
        "base": "https://anime-indo.lol",
        "pattern": r'href=["\'](/anime/[^/?"\'\s]+/?)(?:\?[^"\'\s]*)?["\']'
    },
    {
        "name": "Sokuja",
        "url": "https://x6.sokuja.uk/anime/?status=ongoing&order=update",
        "base": "https://x6.sokuja.uk",
        "pattern": r'href=["\']((?:https?://x6\.sokuja\.uk)?/anime/[^/?"\'\s]+/?)(?:\?[^"\'\s]*)?["\']'
    },
    {
        "name": "Oploverz Site",
        "url": "https://oploverz.site/",
        "base": "https://oploverz.site",
        "pattern": r'href=["\'](/series/[^/?"\'\s]+/?)(?:\?[^"\'\s]*)?["\']'
    },
    {
        "name": "Oploverz AM",
        "url": "https://oploverz.am/anime/?status=&type=&order=update",
        "base": "https://oploverz.am",
        "pattern": r'href=["\'](https?://oploverz\.am/anime/[^/?"\'\s]+/?)(?:\?[^"\'\s]*)?["\']'
    }
]

def fetch_url(url, retries=2):
    req = urllib.request.Request(url, headers=HEADERS)
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=12) as res:
                return res.read().decode('utf-8', errors='ignore')
        except Exception:
            if i == retries - 1:
                return ""
            time.sleep(1)
    return ""

def normalize_title(title):
    if not title:
        return ""
    t = title.lower()
    t = re.sub(r'\(.*?\)|\[.*?\]', '', t)
    t = re.sub(r'(subtitle\s*indonesia|sub\s*indo|samehadaku|sokuja|oploverz|animeindo|anime\s*indo)', '', t)
    t = re.sub(r'\s*season\s*(\d+)', r' s\1', t)
    t = re.sub(r'\s*2nd\s*season', ' s2', t)
    t = re.sub(r'\s*3rd\s*season', ' s3', t)
    t = re.sub(r'\s*4th\s*season', ' s4', t)
    t = re.sub(r'[^a-z0-9]', '', t)
    return t

def extract_episode_stream(ep_url):
    html = fetch_url(ep_url)
    if not html:
        return "", []
    
    servers = []
    # 1. data-video (Anime-Indo / Sokuja / Oploverz)
    d_vids = re.findall(r'data-video=["\']([^"\']+)["\']', html)
    for dv in d_vids:
        dv = dv.strip()
        if dv.startswith('http') and dv not in servers:
            servers.append(dv)

    # 2. data-embed
    embeds = re.findall(r'data-embed=["\']([^"\']+)["\']', html)
    for emb in embeds:
        decoded = html_lib.unescape(emb)
        m = re.search(r'src=["\']([^"\']+)["\']', decoded)
        if m:
            s_url = m.group(1).strip()
            if s_url and s_url not in servers and s_url.startswith('http'):
                servers.append(s_url)

    # 3. iframe tontonin / player iframe
    iframes = re.findall(r'<iframe[^>]+src=["\']([^"\']+)["\']', html, re.I)
    for ifr in iframes:
        ifr = ifr.strip()
        if ifr and ifr not in servers and not ifr.startswith('chrome') and not any(x in ifr for x in ['ads', 'analytics', 'googletagmanager', 'facebook']):
            servers.append(ifr)

    # 4. video source
    sources = re.findall(r'<source[^>]+src=["\']([^"\']+)["\']', html, re.I)
    for src in sources:
        src = src.strip()
        if src and src not in servers:
            servers.append(src)

    stream_url = servers[0] if servers else ""
    return stream_url, servers

def scrape_anime_detail(slug, url, max_eps=12):
    html = fetch_url(url)
    if not html:
        return None

    # Title: OG -> H1 -> Fallback
    og_title = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', html, re.I) \
        or re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']', html, re.I)
    h1_title = re.search(r'<h1[^>]*itemprop=["\']headline["\'][^>]*>(.*?)</h1>', html, re.DOTALL) \
        or re.search(r'<h1[^>]*class=["\'][^"\']*(?:jdlcontent|entry-title|title)[^"\']*["\'][^>]*>(.*?)</h1>', html, re.DOTALL) \
        or re.search(r'<h1[^>]*>(.*?)</h1>', html, re.DOTALL)

    if og_title:
        title = og_title.group(1)
    elif h1_title:
        title = re.sub(r'<[^>]+>', '', h1_title.group(1))
    else:
        title = slug.replace('-', ' ').title()

    title = re.sub(r'(?i)(?:Subtitle\s*Indonesia|Sub\s*Indo|Samehadaku|Otakudesu|Kuramanime|Oploverz|Animeindo|Sokuja)', '', title)
    title = re.sub(r'[\s\-_|:]+$', '', title).strip()

    # Thumbnail
    og_thumb = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html, re.I) \
        or re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', html, re.I)
    thumb_m = re.search(r'class=["\'][^"\']*(?:w-48|fotoanime|thumb|poster|cover|detail)[^"\']*["\'][^>]*>.*?<img[^>]+(?:src|data-src)=["\']([^"\']+)["\']', html, re.DOTALL)

    thumbnail = ""
    if og_thumb:
        thumbnail = og_thumb.group(1).strip()
    elif thumb_m:
        thumbnail = thumb_m.group(1).strip()
    else:
        fb_thumb = re.search(r'src=["\'](https?://[^"\']+\.(?:jpg|jpeg|png|webp))["\']', html)
        thumbnail = fb_thumb.group(1) if fb_thumb else ""

    if thumbnail.startswith('/'):
        url_obj = urllib.parse.urlparse(url)
        thumbnail = f"{url_obj.scheme}://{url_obj.netloc}{thumbnail}"

    # Auto-search internet (Kitsu API) jika foto/banner tidak kebawa
    banner = ""
    if not thumbnail or thumbnail.startswith('/') or 'placehold.co' in thumbnail:
        try:
            clean_t = re.sub(r'(\s*Season\s*\d+|\s*Part\s*\d+|\s*Cour\s*\d+|:\s*.*$|\".*?\")', '', title).strip()
            k_url = 'https://kitsu.io/api/edge/anime?filter[text]=' + urllib.parse.quote(clean_t) + '&page[limit]=1'
            k_req = urllib.request.Request(k_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(k_req, timeout=5) as k_res:
                k_data = json.loads(k_res.read().decode('utf-8'))
                if k_data.get('data'):
                    k_attrs = k_data['data'][0]['attributes']
                    p_obj = k_attrs.get('posterImage') or {}
                    b_obj = k_attrs.get('coverImage') or {}
                    thumbnail = p_obj.get('original') or p_obj.get('large') or thumbnail
                    banner = b_obj.get('original') or b_obj.get('large') or ''
        except Exception:
            pass

    # Score
    score_m = re.search(r'class=["\'][^"\']*(?:font-extrabold|score|rating|skor)[^"\']*["\']>([\d\.]+)</span>', html, re.I) \
        or re.search(r'(?:Skor|Rating)\s*:\s*(?:</b>\s*)?([\d\.]+)', html, re.I)
    try:
        score = float(score_m.group(1)) if score_m else 7.8
    except:
        score = 7.8

    # Genres
    genres = []
    g_matches = re.findall(r'href=["\']https?://[^/]+/genres?/[^/\"\'\s]+/?["\'][^>]*>(.*?)</a>', html, re.I)
    for g in g_matches:
        cg = re.sub(r'<[^>]+>', '', g).strip()
        if cg and cg not in genres:
            genres.append(cg)
    if not genres:
        genres = ["Action", "Animation"]

    # Status, Type, Studio
    status_raw = "Ongoing"
    anime_type = "TV"
    studio = "Unknown"

    status_m = re.search(r'Status\s*</span>\s*<span[^>]*>(.*?)</span>', html, re.DOTALL | re.I) \
        or re.search(r'Status\s*:\s*(?:</b>\s*)?([^<]+)', html, re.I)
    if status_m:
        status_raw = re.sub(r'<[^>]+>', '', status_m.group(1)).strip()

    status = "Currently Airing" if "ongoing" in status_raw.lower() else "Finished Airing"

    type_m = re.search(r'Type\s*</span>\s*<span[^>]*>(.*?)</span>', html, re.DOTALL | re.I) \
        or re.search(r'(?:Type|Tipe)\s*:\s*(?:</b>\s*)?([^<]+)', html, re.I)
    if type_m:
        anime_type = re.sub(r'<[^>]+>', '', type_m.group(1)).strip()

    studio_m = re.search(r'Studio\s*</span>\s*<span[^>]*>(.*?)</span>', html, re.DOTALL | re.I) \
        or re.search(r'Studio\s*:\s*(?:</b>\s*)?([^<]+)', html, re.I)
    if studio_m:
        studio = re.sub(r'<[^>]+>', '', studio_m.group(1)).strip()

    # Synopsis
    syn_m = re.search(r'<div[^>]*class=["\'][^"\']*(?:entry-content|sinopc|synopsis|desc|detail)[^"\']*["\'][^>]*>(.*?)</div>', html, re.DOTALL)
    og_desc = re.search(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']', html, re.I) \
        or re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)

    if syn_m:
        synopsis = re.sub(r'<[^>]+>', '', syn_m.group(1)).strip()
        synopsis = re.sub(r'\s+', ' ', synopsis)
    elif og_desc:
        synopsis = og_desc.group(1).strip()
    else:
        synopsis = f"Sinopsis {title}."

    # Episodes Finder
    ep_blocks = []
    # Pattern 1: Samehadaku blocks
    sh_blocks = re.findall(r'<div[^>]*class=["\']flex items-center gap-3 p-2[^"\']*["\']>.*?<a[^>]+href=["\'](https?://[^/\"\'\s]+/[^/\"\'\s]+-episode-[^/\"\'\s]+/?)[^>]*>.*?</a>.*?<h4[^>]*>.*?<a[^>]*>(.*?)</a>.*?<span[^>]*class=["\'][^"\']*text-\[11px\][^"\']*["\']>(.*?)</span>', html, re.DOTALL)
    if sh_blocks:
        ep_blocks = sh_blocks
    else:
        # Pattern 2: Generic links with episode/eps
        raw_eps = re.findall(r'href=["\']((?:https?://[^"\'#\s]*|/)(?:[^"\'#\s]+-episode-\d+|[^"\'#\s]+-eps-\d+|[^"\'#\s]+/episode/\d+)[^"\'#\s]*)["\']', html, re.I)
        seen_ep = set()
        for ep_u in raw_eps:
            if ep_u.startswith('/'):
                url_obj = urllib.parse.urlparse(url)
                ep_u = f"{url_obj.scheme}://{url_obj.netloc}{ep_u}"
            num_m = re.search(r'(?:episode|eps)[-_/ ]?(\d+)', ep_u, re.I) or re.search(r'-(\d+)(?:-sub-indo|/)?$', ep_u)
            ep_n = int(num_m.group(1)) if num_m else None
            if ep_n and ep_n not in seen_ep:
                seen_ep.add(ep_n)
                ep_blocks.append((ep_u, f"Episode {ep_n}", "Terbaru"))

        # Pattern 3: Anchor text Episode X
        if not ep_blocks:
            generic_anchors = re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', html, re.DOTALL | re.I)
            seen_a = set()
            for u, t in generic_anchors:
                num_m = re.search(r'Episode\s*(\d+)', t, re.I) or re.search(r'(?:episode|eps)[-_/ ]?(\d+)', u, re.I)
                if num_m:
                    n = int(num_m.group(1))
                    if n not in seen_a and not u.startswith('#'):
                        seen_a.add(n)
                        if u.startswith('/'):
                            url_obj = urllib.parse.urlparse(url)
                            u = f"{url_obj.scheme}://{url_obj.netloc}{u}"
                        ep_blocks.append((u, f"Episode {n}", "Terbaru"))

    episodes_list = []
    # Fetch streams for latest batch of episodes
    target_eps = ep_blocks if (max_eps == 0 or max_eps is None) else ep_blocks[:max_eps]
    for idx, item in enumerate(target_eps):
        ep_url = item[0]
        raw_title = re.sub(r'<[^>]+>', '', item[1]).strip()
        ep_date = re.sub(r'<[^>]+>', '', item[2]).strip()
        
        ep_num_m = re.search(r'(?:episode|eps)[-_/ ]?(\d+)', ep_url, re.I) or re.search(r'(\d+)', raw_title)
        ep_num = int(ep_num_m.group(1)) if ep_num_m else (idx + 1)

        stream_url, servers = extract_episode_stream(ep_url)
        
        episodes_list.append({
            "ep": ep_num,
            "title": raw_title,
            "date": ep_date,
            "ep_url": ep_url,
            "stream_url": stream_url,
            "servers": servers,
            "drive_file_id": ""
        })
        time.sleep(0.1)

    episodes_list.sort(key=lambda x: x["ep"])

    return {
        "title": title,
        "slug": slug,
        "thumbnail": thumbnail,
        "banner": banner or thumbnail,
        "type": anime_type,
        "status": status,
        "episodes": max(len(episodes_list), 12),
        "score": score,
        "studio": studio,
        "genres": genres,
        "synopsis": synopsis,
        "episodes_list": episodes_list,
        "views": 1500,
        "release_year": 2026,
        "rating": "PG-13"
    }

def merge_anime_entry(existing, scraped):
    """
    Logika Merge Cerdas:
    - Jika di A (existing) ada yang kurang, ambil dari B (scraped).
    - Episode digabung berdasarkan nomor episode (tanpa duplikat).
    - Jika episode sudah ada tapi server streaming di B lebih lengkap, tambahkan server baru.
    """
    # 1. Merge episodes
    ep_map = {e["ep"]: e for e in existing.get("episodes_list", [])}
    for new_ep in scraped.get("episodes_list", []):
        ep_num = new_ep["ep"]
        if ep_num not in ep_map:
            # Episode baru yang belum ada di database -> tambahkan langsung!
            ep_map[ep_num] = new_ep
        else:
            cur_ep = ep_map[ep_num]
            # Jika episode ada tapi stream_url belum ada, ambil dari scraped
            if not cur_ep.get("stream_url") and new_ep.get("stream_url"):
                cur_ep["stream_url"] = new_ep["stream_url"]
            if not cur_ep.get("ep_url") and new_ep.get("ep_url"):
                cur_ep["ep_url"] = new_ep["ep_url"]
            # Gabungkan server streaming tanpa duplikasi
            cur_servers = set(cur_ep.get("servers", []))
            for s in new_ep.get("servers", []):
                if s and s not in cur_servers:
                    cur_ep.setdefault("servers", []).append(s)
                    cur_servers.add(s)

    merged_eps = sorted(ep_map.values(), key=lambda x: x["ep"])
    existing["episodes_list"] = merged_eps
    existing["episodes"] = max(len(merged_eps), existing.get("episodes", 12))
    
    # 2. Update status / score jika ada info lebih baru
    if scraped.get("status"):
        existing["status"] = scraped["status"]
    if scraped.get("score") and scraped["score"] > 7.0:
        existing["score"] = scraped["score"]
    if not existing.get("thumbnail") and scraped.get("thumbnail"):
        existing["thumbnail"] = scraped["thumbnail"]
    if not existing.get("banner") and scraped.get("banner"):
        existing["banner"] = scraped["banner"]

    return existing

def collect_multi_source_links():
    """Mengumpulkan daftar anime terbaru dari 5 sumber sekaligus."""
    anime_queue = []
    seen_urls = set()

    for src in HOURLY_SOURCES:
        print(f"[Fetching Source] {src['name']} ({src['url']})...")
        html = fetch_url(src["url"])
        if not html:
            print(f"  -> Gagal mengakses {src['name']}")
            continue
        
        matches = re.findall(src["pattern"], html)
        count = 0
        for u in matches:
            if u.startswith('/'):
                u = f"{src['base']}{u}"
            # Bersihkan slug
            slug_m = re.search(r'/(?:anime|series)/([^/]+)/?', u)
            slug = slug_m.group(1) if slug_m else u.rstrip('/').split('/')[-1]
            slug = re.sub(r'[^a-zA-Z0-9-_]', '-', slug).lower()
            
            # Abaikan URL non-anime
            if slug in ['feed', 'anime', 'series', 'page', 'jadwal']:
                continue
            
            if u not in seen_urls:
                seen_urls.add(u)
                anime_queue.append((slug, u, src["name"]))
                count += 1
        print(f"  -> {count} link anime ditemukan dari {src['name']}")

    return anime_queue

def run_multi_source_sync(limit_per_source=6):
    print("Memuat database anime.json...")
    current_data = []
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r", encoding="utf-8") as f:
            try:
                current_data = json.load(f)
            except:
                current_data = []

    # Map normalisasi untuk pencarian judul duplikat
    existing_by_norm = {}
    existing_by_slug = {}
    for a in current_data:
        existing_by_slug[a["slug"]] = a
        norm = normalize_title(a.get("title", ""))
        if norm:
            existing_by_norm[norm] = a

    max_id = max([a.get("id", 0) for a in current_data], default=0)

    # Kumpulkan target dari 5 sumber
    raw_targets = collect_multi_source_links()
    print(f"\nTotal anime terkumpul dari 5 sumber: {len(raw_targets)} link")

    new_count = 0
    updated_count = 0

    for i, (slug, url, src_name) in enumerate(raw_targets, 1):
        print(f"\n[{i}/{len(raw_targets)}] Scrape {slug} ({src_name})...")
        scraped = scrape_anime_detail(slug, url, max_eps=6)
        if not scraped or not scraped.get("title"):
            continue

        norm_title = normalize_title(scraped["title"])
        
        # Cek apakah judul sudah ada di database (berdasarkan norm title atau slug)
        matched_existing = existing_by_slug.get(slug) or existing_by_norm.get(norm_title)
        
        if matched_existing:
            # SUDAH ADA -> LAKUKAN SMART MERGE (tambah episode kurang, merge server)
            print(f"  -> Judul cocok dengan '{matched_existing['title']}'! Melakukan Smart Merge...")
            merge_anime_entry(matched_existing, scraped)
            updated_count += 1
        else:
            # BELUM ADA -> TAMBAHKAN SEBAGAI ANIME BARU
            max_id += 1
            scraped["id"] = max_id
            current_data.append(scraped)
            existing_by_slug[slug] = scraped
            if norm_title:
                existing_by_norm[norm_title] = scraped
            new_count += 1
            print(f"  -> Ditambahkan anime baru: {scraped['title']} (ID: {max_id})")

        # Simpan progres langsung ke database
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(current_data, f, ensure_ascii=False, indent=2)

    print(f"\n==========================================")
    print(f"MULTI-SOURCE SYNC SELESAI!")
    print(f"Anime Baru Ditambah: {new_count}")
    print(f"Anime Dimutakhirkan/Dimerge: {updated_count}")
    print(f"Total Anime di Database Sekarang: {len(current_data)}")
    print(f"==========================================")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Multi-Source Anime Scraper & Syncer")
    parser.add_argument("--hourly", action="store_true", help="Mode cron per jam dari 5 sumber resmi")
    parser.add_argument("--url", type=str, default=None, help="Scrape 1 anime spesifik dari URL")
    parser.add_argument("--eps", type=int, default=12, help="Maksimal episode per anime")

    args = parser.parse_args()

    if args.hourly:
        run_multi_source_sync()
    elif args.url:
        print(f"Scraping manual single URL: {args.url}")
        # single scrape fallback
        slug_m = re.search(r'/(?:anime|series)/([^/]+)/?', args.url)
        slug = slug_m.group(1) if slug_m else args.url.rstrip('/').split('/')[-1]
        slug = re.sub(r'[^a-zA-Z0-9-_]', '-', slug).lower()
        detail = scrape_anime_detail(slug, args.url, max_eps=args.eps)
        if detail:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            data = [detail] + [a for a in data if a.get("slug") != slug]
            with open(DB_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print("Berhasil disimpan!")
    else:
        run_multi_source_sync()
