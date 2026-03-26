module.exports = async (req, res) => {
  // CORS Ayarları (Uygulamanızın bağlanabilmesi için)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Tarayıcı güvenlik onaylarını geç
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Hem Akıllı Okuyucu (POST) hem de Tarayıcı Testi (GET) için Video ID al
  const videoId = req.method === 'POST' ? req.body?.videoId : req.query?.videoId;

  if (!videoId) {
    return res.status(400).json({ error: 'Lütfen bir video ID gönderin.' });
  }

  try {
    // 1. YouTube'un GİZLİ ANDROID MOBİL API'sine istek atıyoruz (Asla engellenemez)
    const ytRes = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID', // Sunucuyu Android Telefon gibi gösteriyoruz
            clientVersion: '17.31.35',
            androidSdkVersion: 30,
            hl: 'en',
            gl: 'US'
          }
        },
        videoId: videoId
      })
    });

    const data = await ytRes.json();
    
    // Altyazıların olduğu paketi çıkar
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!tracks || tracks.length === 0) {
       return res.status(500).json({ error: 'Bu videoda (CC) altyazı kapalı veya bulunamadı.' });
    }

    // Öncelik Sırası: Yunanca -> İngilizce -> İlk Bulunan
    let targetTrack = tracks.find(t => t.languageCode.startsWith('el')) ||
                      tracks.find(t => t.languageCode.startsWith('en')) ||
                      tracks[0];

    // 2. Altyazı metnini indir (Mobil API bunu okuması çok kolay olan JSON3 formatında verir)
    const subRes = await fetch(targetTrack.baseUrl + '&fmt=json3');
    const subData = await subRes.json();

    const parsed = [];
    if (subData.events) {
        for (const event of subData.events) {
            if (event.segs && event.segs.length > 0) {
                // Kelimeleri birleştir, renk/html kodlarını temizle
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
    }

    if (parsed.length === 0) throw new Error("Ayrıştırılmış altyazı boş.");

    // Tüm işlemler başarılıysa altyazıyı frontend'e gönder!
    return res.status(200).json({ isGreek: targetTrack.languageCode.startsWith('el'), data: parsed });

  } catch (error) {
    return res.status(500).json({ error: 'Hata oluştu: ' + error.message });
  }
};
