const { getSubtitles } = require('youtube-captions-scraper');

module.exports = async (req, res) => {
  // CORS Ayarları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Sadece POST isteği kabul edilir.' });

  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: 'Video ID gerekli.' });

  try {
    let isGreek = true;
    let formattedCaptions = [];

    // YÖNTEM 1: Hazır Kütüphane İle (youtube-captions-scraper)
    try {
        let captions = [];
        try {
            captions = await getSubtitles({ videoID: videoId, lang: 'el' });
        } catch(e) {
            captions = await getSubtitles({ videoID: videoId, lang: 'en' });
            isGreek = false;
        }
        
        formattedCaptions = captions.map(cap => ({
            start: parseFloat(cap.start),
            end: parseFloat(cap.start) + parseFloat(cap.dur),
            text: cap.text.replace(/\n/g, ' ').replace(/\[.*?\]/g, '').trim()
        }));

    } catch (libError) {
        // YÖNTEM 2: Kütüphane YouTube tarafından engellenirse Manuel Deep Scrape (Derin Kazıma) yap
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
                'Accept-Language': 'en-US,en;q=0.9',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                // Daha güçlü ve yeni çerez onay kodu (SOCS=CAI eklendi)
                'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+478; SOCS=CAI;' 
            }
        });
        const html = await response.text();
        
        let captionTracks = null;
        
        // Önce normal şekilde ara
        const regex1 = /"captionTracks":\s*(\[.*?\])/;
        const match1 = regex1.exec(html);
        if (match1) {
            try { captionTracks = JSON.parse(match1[1]); } catch(e){}
        }

        // Bulamazsa gizli veri paketinin (ytInitialPlayerResponse) içine dal
        if (!captionTracks) {
            const regex2 = /ytInitialPlayerResponse\s*=\s*({.+?})\s*;\s*(?:var\s+meta|<\/script|\n)/;
            const match2 = regex2.exec(html);
            if (match2) {
                try {
                    const data = JSON.parse(match2[1]);
                    captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                } catch(e) {}
            }
        }

        if (!captionTracks || captionTracks.length === 0) {
            return res.status(500).json({ error: 'Bu videoda (CC) altyazı kapalı veya Vercel IP engeline takıldı.' });
        }

        // Öncelik Sırası: Yunanca -> İngilizce -> İlk bulduğu
        let targetTrack = captionTracks.find(t => t.languageCode.startsWith('el')) 
                       || captionTracks.find(t => t.languageCode.startsWith('en')) 
                       || captionTracks[0];

        isGreek = targetTrack.languageCode.startsWith('el');

        const subRes = await fetch(targetTrack.baseUrl + '&fmt=json3');
        const subData = await subRes.json();

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
    }

    if (formattedCaptions.length === 0) {
        return res.status(500).json({ error: 'Altyazı metinleri boş veya çıkarılamadı.' });
    }

    // Her şey başarılı, veriyi Akıllı Okuyucuya gönder!
    return res.status(200).json({ isGreek: isGreek, data: formattedCaptions });

  } catch (error) {
    return res.status(500).json({ error: 'Sunucu hatası veya Altyazı Yok.' });
  }
};
