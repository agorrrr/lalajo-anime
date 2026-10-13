// Vercel Serverless Function: Scrape anime detail + episode streams from Samehadaku
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let targetUrl = req.query.url || (req.body && req.body.url);
  if (!targetUrl) {
    return res.status(400).json({ status: 'error', message: 'Parameter "url" dibutuhkan' });
  }

  // Format if only slug passed
  if (!targetUrl.startsWith('http')) {
    targetUrl = `https://v2.samehadaku.how/anime/${targetUrl.trim()}/`;
  }

  try {
    const urlObj = new URL(targetUrl);
    const origin = urlObj.origin;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': origin + '/',
    };

    const resp = await fetch(targetUrl, { headers });
    if (!resp.ok) {
      return res.status(resp.status).json({ status: 'error', message: `Gagal mengambil halaman: HTTP ${resp.status}` });
    }

    const html = await resp.text();

    // 1. Slug (from path)
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    let slug = pathSegments[pathSegments.length - 1] || 'scraped-anime';
    slug = slug.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();

    // 2. Title (OpenGraph -> H1 -> Fallback)
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const h1Match = html.match(/<h1[^>]*itemprop=["']headline["'][^>]*>(.*?)<\/h1>/is)
      || html.match(/<h1[^>]*class=["'][^"']*jdlcontent[^"']*["'][^>]*>(.*?)<\/h1>/is)
      || html.match(/<h1[^>]*>(.*?)<\/h1>/is);
    let title = ogTitleMatch ? ogTitleMatch[1] : (h1Match ? h1Match[1].replace(/<[^>]+>/g, '') : slug.replace(/-/g, ' '));
    title = title.replace(/Subtitle Indonesia|Sub Indo|Samehadaku|Otakudesu|Kuramanime/gi, '').replace(/[\s\-_|:]+$/g, '').trim();

    // 3. Thumbnail (OpenGraph -> CSS Selector -> First Image)
    const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const thumbClassMatch = html.match(/class=["'][^"']*(?:w-48|fotoanime|thumb|poster|cover)[^"']*["'][^>]*>.*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/is);
    let thumbnail = ogImgMatch ? ogImgMatch[1].trim() : (thumbClassMatch ? thumbClassMatch[1].trim() : '');
    if (!thumbnail) {
      const fbImg = html.match(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
      thumbnail = fbImg ? fbImg[1].trim() : '';
    }

    // 4. Score
    const scoreMatch = html.match(/(?:font-extrabold|score|rating|skor)[^"'>]*["']>([\d\.]+)/i)
      || html.match(/Skor\s*:\s*<\/b>\s*([\d\.]+)/i)
      || html.match(/Rating\s*:\s*([\d\.]+)/i);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 7.5;

    // 5. Genres
    const genreMatches = [
      ...html.matchAll(/href=["']https?:\/\/[^/]+\/genres?\/[^/'"\s]+\/?["'][^>]*>(.*?)<\/a>/gi)
    ];
    const genres = [];
    genreMatches.forEach(m => {
      const g = m[1].replace(/<[^>]+>/g, '').trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    // 6. Meta (Status, Type, Studio)
    const statusMatch = html.match(/Status\s*<\/span>\s*<span[^>]*>(.*?)<\/span>/is)
      || html.match(/Status\s*:\s*<\/b>\s*([^<]+)/i)
      || html.match(/Status\s*:\s*([^<]+)/i);
    const rawStatus = statusMatch ? statusMatch[1].replace(/<[^>]+>/g, '').trim() : 'Ongoing';
    const status = rawStatus.toLowerCase().includes('ongoing') ? 'Currently Airing' : 'Finished Airing';

    const typeMatch = html.match(/Type\s*<\/span>\s*<span[^>]*>(.*?)<\/span>/is)
      || html.match(/Tipe\s*:\s*<\/b>\s*([^<]+)/i)
      || html.match(/Type\s*:\s*([^<]+)/i);
    const animeType = typeMatch ? typeMatch[1].replace(/<[^>]+>/g, '').trim() : 'TV';

    const studioMatch = html.match(/Studio\s*<\/span>\s*<span[^>]*>(.*?)<\/span>/is)
      || html.match(/Studio\s*:\s*<\/b>\s*([^<]+)/i)
      || html.match(/Studio\s*:\s*([^<]+)/i);
    const studio = studioMatch ? studioMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown';

    // 7. Synopsis
    const synMatch = html.match(/<div[^>]*class=["'][^"']*(?:entry-content|sinopc|synopsis|desc)[^"']*["'][^>]*>(.*?)<\/div>/is);
    const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    const synopsis = synMatch ? synMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : (ogDescMatch ? ogDescMatch[1].trim() : 'Sinopsis belum tersedia.');

    // 8. Episode Links Finder
    const seenEp = new Set();
    const episodeLinks = [];

    // Pattern 1: URL matching episode/eps
    const epRegex = /href=["'](https?:\/\/[^"'#\s]*(?:-episode-|\/episode\/|\/eps\/|-eps-)[^"'#\s]*)["']/gi;
    const allEpLinks = [...html.matchAll(epRegex)];

    allEpLinks.forEach(m => {
      const epUrl = m[1];
      const epNumM = epUrl.match(/(?:episode|eps)[-_/ ]?(\d+)/i) || epUrl.match(/-(\d+)(?:-sub-indo|\/)?$/);
      const epNum = epNumM ? parseInt(epNumM[1]) : (episodeLinks.length + 1);
      if (!seenEp.has(epNum)) {
        seenEp.add(epNum);
        episodeLinks.push({ url: epUrl, num: epNum });
      }
    });

    // Pattern 2: Generic anchor text with "Episode X"
    if (episodeLinks.length === 0) {
      const genericA = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi)];
      genericA.forEach(m => {
        const u = m[1];
        const t = m[2];
        const numM = t.match(/Episode\s*(\d+)/i) || u.match(/(?:episode|eps)[-_/ ]?(\d+)/i);
        if (numM && (u.startsWith('http') || u.startsWith('/'))) {
          const num = parseInt(numM[1]);
          if (!seenEp.has(num)) {
            seenEp.add(num);
            const fullU = u.startsWith('http') ? u : new URL(u, targetUrl).href;
            episodeLinks.push({ url: fullU, num: num });
          }
        }
      });
    }

    // Fetch stream for first 10 episodes
    const episodes_list = [];
    for (const ep of episodeLinks.slice(0, 10)) {
      try {
        const epResp = await fetch(ep.url, { headers });
        const epHtml = await epResp.text();

        const servers = [];
        const embeds = [...epHtml.matchAll(/data-embed=["']([^"']+)["']/g)];
        embeds.forEach(em => {
          const raw = em[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
          const srcM = raw.match(/src=["']([^"']+)["']/);
          if (srcM && !servers.includes(srcM[1])) servers.push(srcM[1]);
        });

        const iframes = [...epHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/g)];
        iframes.forEach(im => {
          const s = im[1].trim();
          if (s && !servers.includes(s) && !s.includes('ads') && !s.startsWith('chrome')) servers.push(s);
        });

        const videos = [...epHtml.matchAll(/<source[^>]+src=["']([^"']+)["']/g)];
        videos.forEach(vm => {
          const v = vm[1].trim();
          if (v && !servers.includes(v)) servers.push(v);
        });

        episodes_list.push({
          ep: ep.num,
          title: `Episode ${ep.num}`,
          date: 'Terbaru',
          stream_url: servers[0] || '',
          servers: servers,
          drive_file_id: ''
        });
      } catch (e) {
        episodes_list.push({
          ep: ep.num,
          title: `Episode ${ep.num}`,
          date: 'Terbaru',
          stream_url: '',
          servers: [],
          drive_file_id: ''
        });
      }
    }

    episodes_list.sort((a, b) => a.ep - b.ep);

    const animeData = {
      title,
      slug,
      thumbnail,
      type: animeType,
      status,
      episodes: Math.max(episodes_list.length, 12),
      score,
      studio,
      genres,
      synopsis,
      episodes_list,
      views: 1500,
      release_year: 2026,
      rating: 'PG-13'
    };

    return res.status(200).json({ status: 'success', anime: animeData });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}
