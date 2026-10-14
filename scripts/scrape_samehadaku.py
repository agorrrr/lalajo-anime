import urllib.request
import re
import html as html_lib
import json
import time
import os
import sys
import argparse

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DB_FILE = os.path.join(DATA_DIR, "anime.json")
BACKUP_FILE = os.path.join(DATA_DIR, "anime_manual_backup.json")

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://v2.samehadaku.how/',
}

def fetch_url(url, retries=2):
    req = urllib.request.Request(url, headers=HEADERS)
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as res:
                return res.read().decode('utf-8', errors='ignore')
        except Exception as e:
            if i == retries - 1:
                return ""
            time.sleep(1)
    return ""

def get_anime_from_url(listing_url):
    html = fetch_url(listing_url)
    if not html:
        return []
    raw = re.findall(r'href=[\"\'](https?://v2\.samehadaku\.how/anime/([^/\"\'\s]+)/?)[\"\']', html)
    seen = set()
    anime_list = []
    for full_url, slug in raw:
        if slug in seen:
            continue
        seen.add(slug)
        anime_list.append((slug, full_url if full_url.endswith('/') else full_url + '/'))
    return anime_list

def collect_anime_list(pages=1, fetch_all=False, limit=None):
    seen = set()
    all_anime = []

    # Always grab homepage recent updates first
    hp = get_anime_from_url('https://v2.samehadaku.how/')
    for item in hp:
        if item[0] not in seen:
            seen.add(item[0])
            all_anime.append(item)

    max_p = 57 if fetch_all else pages
    for p in range(1, max_p + 1):
        if limit and len(all_anime) >= limit:
            break
        page_url = f'https://v2.samehadaku.how/anime/page/{p}/'
        print(f"[Crawling Listing] Page {p}: {page_url}")
        items = get_anime_from_url(page_url)
        if not items:
            break
        for item in items:
            if item[0] not in seen:
                seen.add(item[0])
                all_anime.append(item)
                if limit and len(all_anime) >= limit:
                    break
        time.sleep(0.5)

    if limit:
        all_anime = all_anime[:limit]
    return all_anime

def extract_episode_stream(ep_url):
    html = fetch_url(ep_url)
    if not html:
        return "", []
    
    servers = []
    embeds = re.findall(r'data-embed=[\"\']([^\"\']+)[\"\']', html)
    for emb in embeds:
        decoded = html_lib.unescape(emb)
        m = re.search(r'src=[\"\']([^\"\']+)[\"\']', decoded)
        if m:
            s_url = m.group(1).strip()
            if s_url and s_url not in servers:
                servers.append(s_url)

    iframes = re.findall(r'<iframe[^>]+src=[\"\']([^\"\']+)[\"\']', html, re.I)
    for ifr in iframes:
        ifr = ifr.strip()
        if ifr and ifr not in servers and not ifr.startswith('chrome') and 'ads' not in ifr:
            servers.append(ifr)

    sources = re.findall(r'<source[^>]+src=[\"\']([^\"\']+)[\"\']', html, re.I)
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
    og_title = re.search(r'<meta[^>]+property=[\"\']og:title[\"\'][^>]+content=[\"\']([^\"\']+)[\"\']', html, re.I) \
        or re.search(r'<meta[^>]+content=[\"\']([^\"\']+)[\"\'][^>]+property=[\"\']og:title[\"\']', html, re.I)
    h1_title = re.search(r'<h1[^>]*itemprop=[\"\']headline[\"\'][^>]*>(.*?)</h1>', html, re.DOTALL) \
        or re.search(r'<h1[^>]*class=[\"\'][^\"\']*jdlcontent[^\"\']*[\"\'][^>]*>(.*?)</h1>', html, re.DOTALL) \
        or re.search(r'<h1[^>]*>(.*?)</h1>', html, re.DOTALL)

    if og_title:
        title = og_title.group(1)
    elif h1_title:
        title = re.sub(r'<[^>]+>', '', h1_title.group(1))
    else:
        title = slug.replace('-', ' ').title()

    title = re.sub(r'(?i)(?:Subtitle\s*Indonesia|Sub\s*Indo|Samehadaku|Otakudesu|Kuramanime)', '', title)
    title = re.sub(r'[\s\-_|:]+$', '', title).strip()

    # Thumbnail: OG -> CSS -> First Upload Image
    og_thumb = re.search(r'<meta[^>]+property=[\"\']og:image[\"\'][^>]+content=[\"\']([^\"\']+)[\"\']', html, re.I) \
        or re.search(r'<meta[^>]+content=[\"\']([^\"\']+)[\"\'][^>]+property=[\"\']og:image[\"\']', html, re.I)
    thumb_m = re.search(r'class=[\"\'][^\"\']*(?:w-48|fotoanime|thumb|poster|cover)[^\"\']*[\"\'][^>]*>.*?<img[^>]+(?:src|data-src)=[\"\']([^\"\']+)[\"\']', html, re.DOTALL)

    if og_thumb:
        thumbnail = og_thumb.group(1).strip()
    elif thumb_m:
        thumbnail = thumb_m.group(1).strip()
    else:
        fb_thumb = re.search(r'src=[\"\'](https?://[^\"\']+\.(?:jpg|jpeg|png|webp))[\"\']', html)
        thumbnail = fb_thumb.group(1) if fb_thumb else ""

    # Auto-search internet (Kitsu API) jika foto/banner tidak kebawa dari scraper
    banner = ""
    if not thumbnail or thumbnail.startswith('/') or 'placehold.co' in thumbnail:
        try:
            import urllib.parse
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
    score_m = re.search(r'class=[\"\'][^\"\']*(?:font-extrabold|score|rating|skor)[^\"\']*[\"\']>([\d\.]+)</span>', html, re.I) \
        or re.search(r'(?:Skor|Rating)\s*:\s*(?:</b>\s*)?([\d\.]+)', html, re.I)
    try:
        score = float(score_m.group(1)) if score_m else 7.5
    except:
        score = 7.5

    # Genres
    genres = []
    g_matches = re.findall(r'href=[\"\']https?://[^/]+/genres?/[^/\"\'\s]+/?[\"\'][^>]*>(.*?)</a>', html, re.I)
    for g in g_matches:
        cg = re.sub(r'<[^>]+>', '', g).strip()
        if cg and cg not in genres:
            genres.append(cg)

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
    syn_m = re.search(r'<div[^>]*class=[\"\'][^\"\']*(?:entry-content|sinopc|synopsis|desc)[^\"\']*[\"\'][^>]*>(.*?)</div>', html, re.DOTALL)
    og_desc = re.search(r'<meta[^>]+property=[\"\']og:description[\"\'][^>]+content=[\"\']([^\"\']+)[\"\']', html, re.I) \
        or re.search(r'<meta[^>]+name=[\"\']description[\"\'][^>]+content=[\"\']([^\"\']+)[\"\']', html, re.I)

    if syn_m:
        synopsis = re.sub(r'<[^>]+>', '', syn_m.group(1)).strip()
        synopsis = re.sub(r'\s+', ' ', synopsis)
    elif og_desc:
        synopsis = og_desc.group(1).strip()
    else:
        synopsis = "Sinopsis belum tersedia."

    # Episodes Finder
    ep_blocks = []
    # Pattern 1: Samehadaku blocks
    sh_blocks = re.findall(r'<div[^>]*class=[\"\']flex items-center gap-3 p-2[^\"\']*[\"\']>.*?<a[^>]+href=[\"\'](https?://[^/\"\'\s]+/[^/\"\'\s]+-episode-[^/\"\'\s]+/?)[^>]*>.*?</a>.*?<h4[^>]*>.*?<a[^>]*>(.*?)</a>.*?<span[^>]*class=[\"\'][^\"\']*text-\[11px\][^\"\']*[\"\']>(.*?)</span>', html, re.DOTALL)
    if sh_blocks:
        ep_blocks = sh_blocks
    else:
        # Pattern 2: Generic links with episode/eps
        raw_eps = re.findall(r'href=[\"\'](https?://[^\"\'#\s]*(?:-episode-|\/episode\/|\/eps\/|-eps-)[^\"\'#\s]*)[\"\']', html, re.I)
        seen_ep = set()
        for ep_u in raw_eps:
            num_m = re.search(r'(?:episode|eps)[-_/ ]?(\d+)', ep_u, re.I) or re.search(r'-(\d+)(?:-sub-indo|/)?$', ep_u)
            ep_n = int(num_m.group(1)) if num_m else None
            if ep_n and ep_n not in seen_ep:
                seen_ep.add(ep_n)
                ep_blocks.append((ep_u, f"Episode {ep_n}", "Terbaru"))

        # Pattern 3: Anchor text Episode X
        if not ep_blocks:
            generic_anchors = re.findall(r'<a[^>]+href=[\"\']([^\"\']+)[\"\'][^>]*>(.*?)</a>', html, re.DOTALL | re.I)
            seen_a = set()
            for u, t in generic_anchors:
                num_m = re.search(r'Episode\s*(\d+)', t, re.I) or re.search(r'(?:episode|eps)[-_/ ]?(\d+)', u, re.I)
                if num_m:
                    n = int(num_m.group(1))
                    if n not in seen_a and u.startswith('http'):
                        seen_a.add(n)
                        ep_blocks.append((u, f"Episode {n}", "Terbaru"))

    episodes_list = []
    blocks_to_process = ep_blocks if (max_eps == 0 or max_eps is None) else ep_blocks[:max_eps]
    for idx, item in enumerate(blocks_to_process):
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
            "stream_url": stream_url,
            "servers": servers,
            "drive_file_id": ""
        })
        time.sleep(0.2)

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

def save_current_data(data):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def run_sync(pages=1, fetch_all=False, limit=None, max_eps=12, single_url=None):
    if not os.path.exists(BACKUP_FILE) and os.path.exists(DB_FILE):
        import shutil
        shutil.copyfile(DB_FILE, BACKUP_FILE)

    current_data = []
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r", encoding="utf-8") as f:
            try:
                current_data = json.load(f)
            except:
                current_data = []

    existing_slugs = {a["slug"]: a for a in current_data}
    max_id = max([a.get("id", 0) for a in current_data], default=0)

    if single_url:
        slug_m = re.search(r'/anime/([^/]+)/?', single_url)
        if slug_m:
            slug = slug_m.group(1)
        else:
            slug = single_url.rstrip('/').split('/')[-1] or "scraped-anime"
        slug = re.sub(r'[^a-zA-Z0-9-_]', '-', slug).lower()
        target_list = [(slug, single_url)]
    else:
        print(f"Mengumpulkan daftar anime (Pages: {pages}, All: {fetch_all}, Limit: {limit})...")
        target_list = collect_anime_list(pages=pages, fetch_all=fetch_all, limit=limit)

    total_target = len(target_list)
    print(f"Total anime untuk diproses: {total_target}")

    new_count = 0
    updated_count = 0

    for i, (slug, url) in enumerate(target_list, 1):
        print(f"[{i}/{total_target}] Scraping: {slug}...")
        scraped = scrape_anime_detail(slug, url, max_eps=max_eps)
        if not scraped:
            continue

        if slug in existing_slugs:
            target = existing_slugs[slug]
            ep_dict = {e["ep"]: e for e in target.get("episodes_list", [])}
            for new_ep in scraped["episodes_list"]:
                ep_dict[new_ep["ep"]] = new_ep
            merged_eps = sorted(ep_dict.values(), key=lambda x: x["ep"])
            target["episodes_list"] = merged_eps
            target["episodes"] = max(len(merged_eps), target.get("episodes", 12))
            target["score"] = scraped["score"]
            target["thumbnail"] = scraped["thumbnail"] or target["thumbnail"]
            updated_count += 1
        else:
            max_id += 1
            scraped["id"] = max_id
            current_data.append(scraped)
            existing_slugs[slug] = scraped
            new_count += 1

        # Progressive save every anime
        save_current_data(current_data)

    print(f"Sync sukses! Baru: {new_count}, Diupdate: {updated_count}. Total Anime di DB: {len(current_data)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Samehadaku Scraper & Syncer")
    parser.add_argument("--all", action="store_true", help="Scrape seluruh halaman anime (57 halaman)")
    parser.add_argument("--pages", type=int, default=1, help="Jumlah halaman anime untuk discrape")
    parser.add_argument("--limit", type=int, default=None, help="Maksimal anime yang diproses")
    parser.add_argument("--eps", type=int, default=12, help="Maksimal episode per anime")
    parser.add_argument("--url", type=str, default=None, help="Scrape 1 anime spesifik dari URL")
    parser.add_argument("--hourly", action="store_true", help="Mode cron per jam (20 update terbaru)")

    args = parser.parse_args()

    if args.hourly:
        run_sync(pages=1, limit=20, max_eps=6)
    elif args.all:
        run_sync(fetch_all=True, max_eps=args.eps)
    elif args.url:
        run_sync(single_url=args.url, max_eps=args.eps)
    else:
        run_sync(pages=args.pages, limit=args.limit, max_eps=args.eps)
