// Vercel Serverless Function: Universal Anime & Video Scraper for ANY Website
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let targetUrl = req.query.url || (req.body && req.body.url);
  if (!targetUrl) {
    return res.status(400).json({ status: 'error', message: 'Parameter "url" wajib diisi' });
  }

  targetUrl = targetUrl.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    if (targetUrl.includes('.')) {
      targetUrl = 'https://' + targetUrl;
    } else {
      targetUrl = `https://v2.samehadaku.how/anime/${targetUrl}/`;
    }
  }

  // 1. Cek jika URL adalah direct video link / platform embed langsung
  const isDirectVideo = /\.(mp4|m3u8|webm)($|\?)/i.test(targetUrl);
  const isEmbedPlatform = /(youtube\.com|youtu\.be|mega\.nz|blogger\.com\/video|drive\.google\.com|filedon\.com|streamtape|doodstream|streamwish)/i.test(targetUrl);

  if (isDirectVideo || isEmbedPlatform) {
    try {
      const urlObj = new URL(targetUrl);
      const cleanPath = urlObj.pathname.split('/').filter(Boolean).pop() || 'video-stream';
      const cleanTitle = cleanPath.replace(/\.(mp4|m3u8|webm)/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const slug = 'stream-' + Date.now().toString(36);

      const animeData = {
        title: cleanTitle || 'External Video Stream',
        slug,
        thumbnail: `https://placehold.co/212x300/1e293b/fff?text=${encodeURIComponent(cleanTitle || 'Stream')}`,
        type: 'Movie',
        status: 'Finished Airing',
        episodes: 1,
        score: 8.0,
        studio: 'Web Stream',
        genres: ['Action', 'Animation'],
        synopsis: 'Video streaming otomatis dari link eksternal.',
        episodes_list: [{
          ep: 1,
          title: cleanTitle || 'Episode 1',
          date: 'Baru',
          stream_url: targetUrl,
          servers: [targetUrl],
          drive_file_id: ''
        }],
        views: 200,
        release_year: 2026,
        rating: 'PG-13'
      };
      return res.status(200).json({ status: 'success', anime: animeData });
    } catch (e) {}
  }

  // Helper fetcher dengan anti-block & proxy fallback
  async function fetchHtmlWithFallback(url) {
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (e) {
      return '';
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': urlObj.origin + '/',
    };

    // Percobaan 1: Direct Fetch
    try {
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      if (resp.ok) {
        return await resp.text();
      }
    } catch (e) {}

    // Percobaan 2: Proxy Allorigins
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
      if (resp.ok) {
        return await resp.text();
      }
    } catch (e) {}

    // Percobaan 3: Proxy Corsproxy
    try {
      const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
      if (resp.ok) {
        return await resp.text();
      }
    } catch (e) {}

    return '';
  }

  // Helper ekstraksi stream dari HTML
  function extractStreams(html) {
    const servers = [];
    if (!html) return servers;

    const embeds = [...html.matchAll(/(?:data-embed|data-src)=["']([^"']+)["']/gi)];
    embeds.forEach(em => {
      let raw = em[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const srcM = raw.match(/src=["']([^"']+)["']/i);
      const link = (srcM ? srcM[1] : raw).trim();
      if (link.startsWith('http') && !servers.includes(link) && !link.includes('ads') && !link.includes('analytics')) {
        servers.push(link);
      }
    });

    const iframes = [...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)];
    iframes.forEach(im => {
      const s = im[1].trim();
      if (s.startsWith('http') && !servers.includes(s) && !s.includes('ads') && !s.startsWith('chrome')) {
        servers.push(s);
      }
    });

    const videos = [...html.matchAll(/<(?:video|source)[^>]+src=["']([^"']+)["']/gi)];
    videos.forEach(vm => {
      const v = vm[1].trim();
      if (v.startsWith('http') && !servers.includes(v)) {
        servers.push(v);
      }
    });

    return servers;
  }

  try {
    const html = await fetchHtmlWithFallback(targetUrl);
    if (!html) {
      return res.status(400).json({ status: 'error', message: 'Gagal mengambil konten dari URL tersebut. Pastikan website dapat diakses publik.' });
    }

    const urlObj = new URL(targetUrl);

    // 1. Slug
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    let slug = pathSegments[pathSegments.length - 1] || 'anime-' + Date.now().toString(36);
    slug = slug.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();

    // 2. Title
    const ogTitleMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["']/i);
    const h1Match = html.match(/<h1[^>]*itemprop=["']headline["'][^>]*>(.*?)<\/h1>/is)
      || html.match(/<h1[^>]*class=["'][^"']*(?:jdlcontent|entry-title|title)[^"']*["'][^>]*>(.*?)<\/h1>/is)
      || html.match(/<h1[^>]*>(.*?)<\/h1>/is);
    const titleTag = html.match(/<title>(.*?)<\/title>/is);

    let rawTitle = ogTitleMatch ? ogTitleMatch[1] : (h1Match ? h1Match[1].replace(/<[^>]+>/g, '') : (titleTag ? titleTag[1] : slug.replace(/-/g, ' ')));
    let title = rawTitle
      .replace(/(?:Subtitle\s*Indonesia|Sub\s*Indo|Nonton\s*Anime|Streaming|Download|Samehadaku|Otakudesu|Kuramanime|Anoboy)/gi, '')
      .replace(/[\s\-_|:]+$/g, '')
      .replace(/^[\s\-_|:]+/g, '')
      .trim();
    if (!title) title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    // 3. Thumbnail
    const ogImgMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    const thumbClassMatch = html.match(/class=["'][^"']*(?:w-48|fotoanime|thumb|poster|cover|featured-image)[^"']*["'][^>]*>.*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/is);
    const anyImgMatch = html.match(/<img[^>]+(?:src|data-src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);

    let thumbnail = ogImgMatch ? ogImgMatch[1].trim() : (thumbClassMatch ? thumbClassMatch[1].trim() : (anyImgMatch ? anyImgMatch[1].trim() : ''));
    if (!thumbnail || thumbnail.startsWith('/')) {
      thumbnail = `https://placehold.co/212x300/1e293b/fff?text=${encodeURIComponent(title.slice(0, 30))}`;
    }

    // 4. Score
    const scoreMatch = html.match(/(?:font-extrabold|score|rating|skor)[^"'>]*["']>([\d\.]+)/i)
      || html.match(/(?:Skor|Rating)\s*:\s*(?:<\/b>\s*)?([\d\.]+)/i);
    const score = scoreMatch ? Math.min(10, Math.max(1, parseFloat(scoreMatch[1]))) : 7.8;

    // 5. Genres
    const genreMatches = [
      ...html.matchAll(/href=["']https?:\/\/[^/]+\/genres?\/([^/'"\s]+)\/?["'][^>]*>(.*?)<\/a>/gi)
    ];
    const genres = [];
    genreMatches.forEach(m => {
      const g = m[2].replace(/<[^>]+>/g, '').trim();
      if (g && !genres.includes(g) && g.length < 25) genres.push(g);
    });
    if (genres.length === 0) genres.push('Action', 'Animation');

    // 6. Meta
    const statusMatch = html.match(/Status\s*<\/span>\s*<span[^>]*>(.*?)<\/span>/is)
      || html.match(/Status\s*:\s*(?:<\/b>\s*)?([^<]+)/i);
    const rawStatus = statusMatch ? statusMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    let status = 'Currently Airing';
    if (rawStatus) {
      status = rawStatus.toLowerCase().includes('ongoing') ? 'Currently Airing' : 'Finished Airing';
    } else if (/completed|selesai|tamat|finished/i.test(html)) {
      status = 'Finished Airing';
    }

    let animeType = 'TV';
    if (/movie/i.test(html) && !/movie tv/i.test(html)) animeType = 'Movie';
    else if (/ova/i.test(html)) animeType = 'OVA';
    else if (/ona/i.test(html)) animeType = 'ONA';

    const studioMatch = html.match(/Studio\s*<\/span>\s*<span[^>]*>(.*?)<\/span>/is)
      || html.match(/Studio\s*:\s*(?:<\/b>\s*)?([^<]+)/i);
    const studio = studioMatch ? studioMatch[1].replace(/<[^>]+>/g, '').trim() : 'Studio Animation';

    // 7. Synopsis
    const synMatch = html.match(/<div[^>]*class=["'][^"']*(?:entry-content|sinopc|synopsis|desc|description|summary)[^"']*["'][^>]*>(.*?)<\/div>/is)
      || html.match(/<article[^>]*>(.*?)<\/article>/is);
    const ogDescMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description)["']/i);
    let synopsis = synMatch ? synMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : (ogDescMatch ? ogDescMatch[1].trim() : 'Sinopsis anime belum tersedia.');
    if (synopsis.length > 500) synopsis = synopsis.slice(0, 500) + '...';

    // 8. Episodes List Finder
    const seenEp = new Set();
    const episodeLinks = [];

    // Pola A: URL dengan episode/eps (absolute atau relative)
    const epRegex = /href=["']((?:https?:\/\/[^"'#\s]*|\/)[^"'#\s]*(?:-episode-|\/episode\/|\/eps\/|-eps-)[^"'#\s]*)["']/gi;
    const allEpLinks = [...html.matchAll(epRegex)];
    allEpLinks.forEach(m => {
      let epUrl = m[1];
      if (!epUrl.startsWith('http')) {
        epUrl = new URL(epUrl, targetUrl).href;
      }
      const epNumM = epUrl.match(/(?:episode|eps)[-_/ ]?(\d+)/i) || epUrl.match(/-(\d+)(?:-sub-indo|\/)?$/i);
      const epNum = epNumM ? parseInt(epNumM[1]) : (episodeLinks.length + 1);
      if (!seenEp.has(epNum)) {
        seenEp.add(epNum);
        episodeLinks.push({ url: epUrl, num: epNum });
      }
    });

    // Pola B: Teks anchor bertuliskan Episode X
    if (episodeLinks.length === 0) {
      const genericA = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi)];
      genericA.forEach(m => {
        const u = m[1].trim();
        const t = m[2];
        const numM = t.match(/Episode\s*(\d+)/i) || t.match(/Eps\s*(\d+)/i);
        if (numM && !u.startsWith('#') && !u.startsWith('javascript')) {
          const num = parseInt(numM[1]);
          if (!seenEp.has(num)) {
            seenEp.add(num);
            const fullU = u.startsWith('http') ? u : new URL(u, targetUrl).href;
            episodeLinks.push({ url: fullU, num: num });
          }
        }
      });
    }

    episodeLinks.sort((a, b) => a.num - b.num);

    let episodes_list = [];

    if (episodeLinks.length > 0) {
      // Fetch stream episode paralel (maksimal 15 episode agar cepat & tidak timeout)
      const targetBatch = episodeLinks.slice(0, 15);
      episodes_list = await Promise.all(targetBatch.map(async (ep) => {
        try {
          const epHtml = await fetchHtmlWithFallback(ep.url);
          const servers = extractStreams(epHtml);
          return {
            ep: ep.num,
            title: `Episode ${ep.num}`,
            date: 'Terbaru',
            stream_url: servers[0] || '',
            servers: servers,
            drive_file_id: ''
          };
        } catch (e) {
          return {
            ep: ep.num,
            title: `Episode ${ep.num}`,
            date: 'Terbaru',
            stream_url: '',
            servers: [],
            drive_file_id: ''
          };
        }
      }));
    } else {
      // Halaman yang diinput adalah halaman nonton langsung (single episode / player)
      const currentStreams = extractStreams(html);
      episodes_list.push({
        ep: 1,
        title: title || 'Episode 1',
        date: 'Terbaru',
        stream_url: currentStreams[0] || '',
        servers: currentStreams,
        drive_file_id: ''
      });
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
      views: 1200,
      release_year: 2026,
      rating: 'PG-13'
    };

    return res.status(200).json({ status: 'success', anime: animeData });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}
