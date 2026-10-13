import crypto from 'node:crypto';

/**
 * Pure Node.js Stream Extractor (MegaCloud & Vidmoly)
 * Zero external dependencies. Uses native fetch & crypto.
 */

export async function extractVidmoly(embedUrl) {
  const url = embedUrl.replace('vidmoly.to', 'vidmoly.biz');
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://anime-sama.to/',
    },
  });

  const html = await res.text();
  const fileMatch = html.match(/file:\s*'([^']+\.m3u8[^']*)'/);
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const posterMatch = html.match(/image:\s*"([^"]+)"/);

  if (!fileMatch) {
    throw new Error('Vidmoly: stream file .m3u8 not found or protected');
  }

  return {
    provider: 'vidmoly',
    title: titleMatch ? titleMatch[1].trim() : null,
    poster: posterMatch ? posterMatch[1] : null,
    stream_url: fileMatch[1],
  };
}

export async function extractMegaCloud(embedUrl) {
  const u = new URL(embedUrl);
  const videoId = u.pathname.split('/').pop()?.split('?')[0];
  if (!videoId) throw new Error('MegaCloud: video ID tidak valid');

  const sourcesApi = `https://megacloud.tv/embed-2/ajax/e-1/getSources?id=${videoId}`;
  const res = await fetch(sourcesApi, {
    headers: {
      'Accept': '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
      'Referer': embedUrl,
    },
  });

  const data = await res.json();
  if (!data) throw new Error('MegaCloud: response kosong');

  let sources = [];
  if (!data.encrypted && Array.isArray(data.sources)) {
    sources = data.sources;
  } else if (typeof data.sources === 'string') {
    // Ambil script decryptor
    const scriptRes = await fetch(`https://megacloud.tv/js/player/a/prod/e1-player.min.js?v=${Date.now()}`);
    const script = await scriptRes.text();

    // 1. Ekstrak pasangan variabel hex
    const regex = /case\s*0x[0-9a-f]+:(?![^;]*=partKey)\s*\w+\s*=\s*(\w+)\s*,\s*\w+\s*=\s*(\w+);/g;
    const matches = script.matchAll(regex);
    const vars = [];
    for (const match of matches) {
      const k1 = matchKey(match[1], script);
      const k2 = matchKey(match[2], script);
      if (k1 && k2) {
        vars.push([parseInt(k1, 16), parseInt(k2, 16)]);
      }
    }

    // 2. Potong secret & encrypted payload
    let secret = '';
    let arr = data.sources.split('');
    let offset = 0;
    for (const [startIdx, len] of vars) {
      const s = startIdx + offset;
      const e = s + len;
      for (let i = s; i < e; i++) {
        secret += data.sources[i] || '';
        arr[i] = '';
      }
      offset += len;
    }
    const encryptedPayload = arr.join('');

    // 3. AES-256-CBC Decrypt dengan OpenSSL EVP_BytesToKey
    const cypher = Buffer.from(encryptedPayload, 'base64');
    const salt = cypher.subarray(8, 16);
    const password = Buffer.concat([Buffer.from(secret, 'binary'), salt]);
    const md5List = [];
    let digest = password;
    for (let i = 0; i < 3; i++) {
      md5List[i] = crypto.createHash('md5').update(digest).digest();
      digest = Buffer.concat([md5List[i], password]);
    }
    const key = Buffer.concat([md5List[0], md5List[1]]);
    const iv = md5List[2];
    const encryptedData = cypher.subarray(16);

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = decipher.update(encryptedData, undefined, 'utf8') + decipher.final('utf8');
    sources = JSON.parse(decrypted);
  }

  return {
    provider: 'megacloud',
    sources: sources.map((s) => ({
      url: s.file,
      type: s.type,
      isM3U8: String(s.file).includes('.m3u8'),
    })),
    subtitles: (data.tracks || []).map((t) => ({
      url: t.file,
      lang: t.label || 'Unknown',
      default: !!t.default,
    })),
    intro: data.intro || null,
    outro: data.outro || null,
  };
}

function matchKey(val, script) {
  const match = script.match(new RegExp(`,${val}=((?:0x)?([0-9a-fA-F]+))`));
  return match ? match[1].replace(/^0x/, '') : null;
}

// CLI direct run
if (process.argv[1]?.endsWith('stream_extractor.mjs')) {
  const inputUrl = process.argv[2];
  if (!inputUrl) {
    console.log('Usage: node stream_extractor.mjs <embed_url>');
    process.exit(1);
  }

  const fn = inputUrl.includes('vidmoly') ? extractVidmoly : extractMegaCloud;
  fn(inputUrl)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
