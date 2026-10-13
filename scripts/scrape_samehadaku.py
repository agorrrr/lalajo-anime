import urllib.request
import re
import html as html_lib
import json
import time
import os
import sys

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

def get_homepage_anime():
    html = fetch_url('https://v2.samehadaku.how/')
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

    iframes = re.findall(r'<iframe[^>]+src=[\"\']([^\"\']+)[\"\']', html)
    for ifr in iframes:
        ifr = ifr.strip()
        if ifr and ifr not in servers and not ifr.startswith('chrome') and 'ads' not in ifr:
            servers.append(ifr)

    stream_url = servers[0] if servers else ""
    return stream_url, servers

def scrape_anime_detail(slug, url, max_eps=6):
    html = fetch_url(url)
    if not html:
        return None

    title_m = re.search(r'<h1[^>]*itemprop=[\"\']headline[\"\'][^>]*>(.*?)</h1>', html, re.DOTALL)
    if title_m:
        title = re.sub(r'<[^>]+>', '', title_m.group(1)).replace('Sub Indo', '').strip()
    else:
        title = slug.replace('-', ' ').title()

    thumb_m = re.search(r'<div[^>]*class=[\"\'][^\"\']*w-48 aspect-\[3/4\][^\"\']*[\"\'][^>]*>.*?<img[^>]+src=[\"\']([^\"\']+)[\"\']', html, re.DOTALL)
    if thumb_m:
        thumbnail = thumb_m.group(1).strip()
    else:
        fb_thumb = re.search(r'src=[\"\'](https?://v2\.samehadaku\.how/wp-content/uploads/[^\"\']+\.(?:jpg|jpeg|png|webp))[\"\']', html)
        thumbnail = fb_thumb.group(1) if fb_thumb else ""

    score_m = re.search(r'<span[^>]*class=[\"\'][^\"\']*font-extrabold[^\"\']*[\"\']>([\d\.]+)</span>', html)
    try:
        score = float(score_m.group(1)) if score_m else 7.5
    except:
        score = 7.5

    genres = []
    g_matches = re.findall(r'href=[\"\']https?://v2\.samehadaku\.how/genre/[^/\"\'\s]+/?[\"\'][^>]*>(.*?)</a>', html)
    for g in g_matches:
        cg = re.sub(r'<[^>]+>', '', g).strip()
        if cg and cg not in genres:
            genres.append(cg)

    status_raw = "Ongoing"
    anime_type = "TV"
    studio = "Unknown"

    status_m = re.search(r'Status</span>\s*<span[^>]*>(.*?)</span>', html, re.DOTALL)
    if status_m:
        status_raw = re.sub(r'<[^>]+>', '', status_m.group(1)).strip()

    status = "Currently Airing" if "ongoing" in status_raw.lower() else "Finished Airing"

    type_m = re.search(r'Type</span>\s*<span[^>]*>(.*?)</span>', html, re.DOTALL)
    if type_m:
        anime_type = re.sub(r'<[^>]+>', '', type_m.group(1)).strip()

    studio_m = re.search(r'Studio</span>\s*<span[^>]*>(.*?)</span>', html, re.DOTALL)
    if studio_m:
        studio = re.sub(r'<[^>]+>', '', studio_m.group(1)).strip()

    syn_m = re.search(r'<div[^>]*class=[\"\'][^\"\']*entry-content entry-content-single[^\"\']*[\"\'][^>]*>(.*?)</div>', html, re.DOTALL)
    if syn_m:
        synopsis = re.sub(r'<[^>]+>', '', syn_m.group(1)).strip()
        synopsis = re.sub(r'\s+', ' ', synopsis)
    else:
        synopsis = "Sinopsis belum tersedia."

    ep_blocks = re.findall(r'<div[^>]*class=[\"\']flex items-center gap-3 p-2[^\"\']*[\"\']>.*?<a[^>]+href=[\"\'](https?://v2\.samehadaku\.how/[^/\"\'\s]+-episode-[^/\"\'\s]+/?)[^>]*>.*?</a>.*?<h4[^>]*>.*?<a[^>]*>(.*?)</a>.*?<span[^>]*class=[\"\'][^\"\']*text-\[11px\][^\"\']*[\"\']>(.*?)</span>', html, re.DOTALL)

    if not ep_blocks:
        raw_eps = re.findall(r'href=[\"\'](https?://v2\.samehadaku\.how/[^/\"\'\s]*-episode-(\d+)/?)[\"\']', html)
        seen_ep = set()
        for ep_u, ep_n in raw_eps:
            if ep_n in seen_ep:
                continue
            seen_ep.add(ep_n)
            ep_blocks.append((ep_u, f"Episode {ep_n}", "Terbaru"))

    episodes_list = []
    for idx, item in enumerate(ep_blocks[:max_eps]):
        ep_url = item[0]
        raw_title = re.sub(r'<[^>]+>', '', item[1]).strip()
        ep_date = re.sub(r'<[^>]+>', '', item[2]).strip()
        
        ep_num_m = re.search(r'episode-(\d+)', ep_url)
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
        time.sleep(0.3)

    episodes_list.sort(key=lambda x: x["ep"])

    return {
        "title": title,
        "slug": slug,
        "thumbnail": thumbnail,
        "type": anime_type,
        "status": status,
        "episodes": max(len(episodes_list), 12),
        "score": score,
        "studio": studio,
        "genres": genres,
        "synopsis": synopsis,
        "episodes_list": episodes_list,
        "views": 1200,
        "release_year": 2026,
        "rating": "PG-13"
    }

def sync_data(limit=5, max_eps=5):
    # Ensure backup exists before any changes
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

    print(f"Scanning Samehadaku for {limit} anime...")
    homepage_anime = get_homepage_anime()[:limit]

    new_count = 0
    updated_count = 0

    for slug, url in homepage_anime:
        print(f"-> Processing: {slug}")
        scraped = scrape_anime_detail(slug, url, max_eps=max_eps)
        if not scraped:
            continue

        if slug in existing_slugs:
            # Update episodes or metadata
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

    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(current_data, f, ensure_ascii=False, indent=2)

    print(f"Sync selesai! Ditambahkan: {new_count}, Diperbarui: {updated_count}. Total anime: {len(current_data)}")

if __name__ == "__main__":
    limit = 5
    if len(sys.argv) > 1:
        try:
            limit = int(sys.argv[1])
        except:
            pass
    sync_data(limit=limit)
