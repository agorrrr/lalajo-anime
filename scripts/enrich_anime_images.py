import urllib.request
import urllib.parse
import json
import re
import time
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
ANIME_JSON = os.path.join(DATA_DIR, "anime.json")
JADWAL_JSON = os.path.join(DATA_DIR, "jadwal.json")

def search_internet_image(title):
    # Try different search variants:
    # 1. Full title
    # 2. Before colon or quote
    # 3. Cleaned season/part
    variants = [
        re.sub(r'(\s*Season\s*\d+|\s*Part\s*\d+|\s*Cour\s*\d+|:\s*.*$|\".*?\")', '', title).strip(),
        title.split(':')[0].strip(),
        title.split('"')[0].strip(),
        title.strip()
    ]
    seen_queries = set()
    for clean in variants:
        if not clean or clean in seen_queries:
            continue
        seen_queries.add(clean)
        url = 'https://kitsu.io/api/edge/anime?filter[text]=' + urllib.parse.quote(clean) + '&page[limit]=1'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                if data.get('data'):
                    attrs = data['data'][0]['attributes']
                    p_obj = attrs.get('posterImage') or {}
                    b_obj = attrs.get('coverImage') or {}
                    poster = p_obj.get('original') or p_obj.get('large') or p_obj.get('medium') or ''
                    banner = b_obj.get('original') or b_obj.get('large') or ''
                    if poster:
                        return poster, banner
        except Exception:
            pass
        time.sleep(0.1)
    return '', ''

def main():
    print("[*] Memulai pembaruan poster & banner dari internet...")
    with open(ANIME_JSON, 'r', encoding='utf-8') as f:
        anime_list = json.load(f)

    updated_count = 0
    poster_map = {}

    for a in anime_list:
        title = a.get('title', '')
        thumb = a.get('thumbnail', '')
        banner = a.get('banner', '')
        needs_search = (not thumb) or ('placehold.co' in thumb) or (not banner)

        if needs_search:
            print(f"  -> Mencari foto untuk: {title}")
            p, b = search_internet_image(title)
            if p:
                a['thumbnail'] = p
                a['banner'] = b if b else p
                poster_map[title.lower()] = p
                updated_count += 1
                print(f"     [OK] Poster: {p[:50]}... | Banner: {'Ada' if b else 'Fallback'}")
            else:
                print(f"     [-] Tidak ditemukan di Kitsu, pertahankan default.")
            time.sleep(0.15)
        else:
            poster_map[title.lower()] = thumb

    with open(ANIME_JSON, 'w', encoding='utf-8') as f:
        json.dump(anime_list, f, indent=2, ensure_ascii=False)
    print(f"[+] Selesai! {updated_count} anime berhasil diperbarui di anime.json.")

    # Update jadwal.json agar memiliki poster asli
    if os.path.exists(JADWAL_JSON):
        with open(JADWAL_JSON, 'r', encoding='utf-8') as f:
            jadwal_data = json.load(f)

        for day, items in jadwal_data.items():
            if not isinstance(items, list):
                continue
            for it in items:
                t_lower = it.get('title', '').lower().strip()
                if t_lower in poster_map:
                    it['thumbnail'] = poster_map[t_lower]
                elif not it.get('thumbnail'):
                    # Search on the fly if needed
                    p, b = search_internet_image(it.get('title', ''))
                    if p:
                        it['thumbnail'] = p
                        poster_map[t_lower] = p
                    time.sleep(0.1)

        with open(JADWAL_JSON, 'w', encoding='utf-8') as f:
            json.dump(jadwal_data, f, indent=2, ensure_ascii=False)
        print("[+] Selesai! jadwal.json diperbarui dengan link poster asli.")

if __name__ == '__main__':
    main()
