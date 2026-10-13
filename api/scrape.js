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
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://v2.samehadaku.how/',
    };

    const resp = await fetch(targetUrl, { headers });
    if (!resp.ok) {
      return res.status(resp.status).json({ status: 'error', message: `Gagal mengambil halaman: HTTP ${resp.status}` });
    }

    const html = await resp.text();

    // 1. Slug
    const slugMatch = targetUrl.match(/\/anime\/([^/]+)/);
    const slug = slugMatch ? slugMatch[1] : 'scraped-anime';

    // 2. Title
    const titleMatch = html.match(/<h1[^>]*itemprop=["']headline["'][^>]*>(.*?)<\/h1>/s);
    let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace('Sub Indo', '').trim() : slug.replace(/-/g, ' ');

    // 3. Thumbnail
    const thumbMatch = html.match(/class=["'][^"']*w-48 aspect-\[3\/4\][^"']*["'][^>]*>.*?<img[^>]+src=["']([^"']+)["']/s)
      || html.match(/src=["'](https?:\/\/v2\.samehadaku\.how\/wp-content\/uploads\/[^"']+\.(?:jpg|jpeg|png|webp))["']/);
    const thumbnail = thumbMatch ? thumbMatch[1].trim() : '';

    // 4. Score
    const scoreMatch = html.match(/font-extrabold["']>([\d\.]+)<\/span>/);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 7.5;

    // 5. Genres
    const genreMatches = [...html.matchAll(/href=["']https?:\/\/v2\.samehadaku\.how\/genre\/[^/'"\s]+\/?["'][^>]*>(.*?)<\/a>/g)];
    const genres = [];
    genreMatches.forEach(m => {
      const g = m[1].replace(/<[^>]+>/g, '').trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    // 6. Meta (Status, Type, Studio)
    const statusMatch = html.match(/Status<\/span>\s*<span[^>]*>(.*?)<\/span>/s);
    const rawStatus = statusMatch ? statusMatch[1].replace(/<[^>]+>/g, '').trim() : 'Ongoing';
    const status = rawStatus.toLowerCase().includes('ongoing') ? 'Currently Airing' : 'Finished Airing';

    const typeMatch = html.match(/Type<\/span>\s*<span[^>]*>(.*?)<\/span>/s);
    const animeType = typeMatch ? typeMatch[1].replace(/<[^>]+>/g, '').trim() : 'TV';

    const studioMatch = html.match(/Studio<\/span>\s*<span[^>]*>(.*?)<\/span>/s);
    const studio = studioMatch ? studioMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown';

    // 7. Synopsis
    const synMatch = html.match(/<div[^>]*class=["'][^"']*entry-content entry-content-single[^"']*["'][^>]*>(.*?)<\/div>/s);
    const synopsis = synMatch ? synMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : 'Sinopsis belum tersedia.';

    // 8. Episodes
    const epMatches = [...html.matchAll(/href=["'](https?:\/\/v2\.samehadaku\.how\/[^/'"\s]+-episode-(\d+)\/?)["']/g)];
    const seenEp = new Set();
    const episodeLinks = [];
    epMatches.forEach(m => {
      const epNum = parseInt(m[2]);
      if (!seenEp.has(epNum)) {
        seenEp.add(epNum);
        episodeLinks.push({ url: m[1], num: epNum });
      }
    });

    // Fetch stream for first 5 episodes to prevent serverless timeout
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
