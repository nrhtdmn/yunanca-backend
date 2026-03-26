module.exports = async (req, res) => {
  // 1. Uygulamanızın bağlanabilmesi için CORS ayarları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 2. Hem uygulamanızdan (POST) hem de tarayıcıdan (GET) ID alabilme özelliği
  const videoId = req.method === 'POST' ? req.body?.videoId : req.query?.videoId;

  if (!videoId) {
    return res.status(400).json({ error: 'Lütfen bir video ID gönderin.' });
  }

  try {
    // 3. YouTube'un iç API'sine 4 farklı cihaz kılığında gizlice girmeyi deniyoruz
    const clients = [
      { name: 'WEB', version: '2.20240228.06.00' },
      { name: 'WEB_EMBEDDED_PLAYER', version: '1.20240228.06.00' }, // En güveniliri
      { name: 'IOS', version: '19.29.1' },
      { name: 'ANDROID', version: '17.31.35' }
    ];

    let tracks = null;

    for (const client of clients) {
      try {
        const ytRes = await fetch('https://www.youtube.com/youtubei/v1/player', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: {
              client: { clientName: client.name, clientVersion: client.version, hl: 'en', gl: 'US' }
            },
            videoId: videoId
          })
        });
        
        const data = await ytRes.json();
        const foundTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (foundTracks && foundTracks.length > 0) {
          tracks = foundTracks;
          break; // Altyazıyı bulduğumuz an döngüden çık
        }
      } catch (e) { continue; }
    }

    if (!tracks || tracks.length === 0) {
      return res.status(500).json({ error: 'Altyazı bulunamadı. Video altyazısız olabilir.' });
    }

    // 4. Yunanca, yoksa İngilizce, yoksa ilk çıkanı seç
    let targetTrack = tracks.find(t => t.languageCode.startsWith('el')) ||
                      tracks.find(t => t.languageCode.startsWith('en')) ||
                      tracks[0];

    // 5. Altyazı metnini (JSON3) indir
    const fetchUrl = targetTrack.baseUrl + '&fmt=json3';
    let subData = null;

    try {
      // Önce Vercel üzerinden doğrudan indirmeyi dene
      const subRes = await fetch(fetchUrl);
      if (!subRes.ok) throw new Error("Vercel IP Blocked");
      subData = await subRes.json();
    } catch (e) {
      // Eğer YouTube Vercel'i engellerse, proxy üzerinden sız
      const proxyRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(fetchUrl)}`);
      if (proxyRes.ok) {
        subData = await proxyRes.json();
      }
    }

    if (!subData || !subData.events) {
       return res.status(500).json({ error: 'Altyazı metni okunamadı.' });
    }

    // 6. YouTube'un formatını bizim okuyucunun formatına dönüştür
    const parsed = [];
    for (const event of subData.events) {
      if (event.segs && event.segs.length > 0) {
        const text = event.segs.map(s => s.utf8).join('').replace(/\n/g, ' ').trim();
        if (text && text !== '\n') {
          parsed.push({
            start: event.tStartMs / 1000,
            end: (event.tStartMs + (event.dDurationMs || 0)) / 1000,
            text: text
          });
        }
      }
    }

    if (parsed.length === 0) throw new Error("Altyazı verisi boş.");

    // Tüm işlemler başarılıysa altyazıyı gönder!
    return res.status(200).json({ isGreek: targetTrack.languageCode.startsWith('el'), data: parsed });

  } catch (error) {
    return res.status(500).json({ error: 'Sistem Hatası: ' + error.message });
  }
};
