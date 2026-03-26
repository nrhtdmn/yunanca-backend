module.exports = async (req, res) => {
  // CORS Ayarları (Uygulamanızın bağlanabilmesi için)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Sadece POST isteği kabul edilir.' });

  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: 'Video ID gerekli.' });

  try {
    // 1. YouTube'a "Ben bot değilim, çerezleri onayladım" diyen sihirli istek
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+478;' // <--- Çerez engelini aşan kısım
        }
    });
    const html = await response.text();

    // 2. Videonun içindeki gizli altyazı dosyalarını (captionTracks) bul
    const regex = /"captionTracks":(\[.*?\])/;
    const match = regex.exec(html);

    if (!match) {
        return res.status(500).json({ error: 'Bu videoda (CC) altyazı kapalı veya mevcut değil.' });
    }

    const tracks = JSON.parse(match[1]);

    // 3. Önce Yunanca, yoksa İngilizce, yoksa ilk bulduğunu seç
    let targetTrack = tracks.find(t => t.languageCode.startsWith('el')) 
                   || tracks.find(t => t.languageCode.startsWith('en')) 
                   || tracks[0];

    const isGreek = targetTrack.languageCode.startsWith('el');

    // 4. Sadece metinleri içeren tertemiz JSON3 formatında altyazıyı indir
    const subRes = await fetch(targetTrack.baseUrl + '&fmt=json3');
    const subData = await subRes.json();

    const formattedCaptions = [];
    if (subData.events) {
        for (const event of subData.events) {
            if (event.segs && event.segs.length > 0) {
                const text = event.segs.map(s => s.utf8).join('').replace(/\n/g, ' ').trim();
                if (text && text !== '\n') {
                    formattedCaptions.push({
                        start: event.tStartMs / 1000,
                        end: (event.tStartMs + (event.dDurationMs || 0)) / 1000,
                        text: text
                    });
                }
            }
        }
    }

    return res.status(200).json({ isGreek: isGreek, data: formattedCaptions });

  } catch (error) {
    return res.status(500).json({ error: 'Sunucu hatası: ' + error.message });
  }
};
