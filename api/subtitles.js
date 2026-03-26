module.exports = async (req, res) => {
  // CORS Ayarları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const videoId = req.method === 'POST' ? req.body?.videoId : req.query?.videoId;
  if (!videoId) return res.status(400).json({ error: 'Lütfen bir video ID gönderin.' });

  // Vercel IP'sini gizlemek ve Çerez (Consent) engelini aşmak için Proxy Zinciri fonksiyonu
  async function fetchHtmlBypass(url) {
      const proxies = [
          `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
          `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
      ];
      for (const proxy of proxies) {
          try {
              const r = await fetch(proxy);
              if (r.ok) {
                  const html = await r.text();
                  // Eğer proxy çerez onayına (consent) düşmediyse bu html'i kullan
                  if (!html.includes('consent.youtube.com')) return html;
              }
          } catch(e) { continue; }
      }
      // Son çare: Doğrudan Vercel üzerinden özel çerez (SOCS=CAI) basarak geçmeyi dene
      const direct = await fetch(url, {
          headers: { 'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+478; SOCS=CAI;' }
      });
      return await direct.text();
  }

  try {
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const html = await fetchHtmlBypass(ytUrl);

    let captionTracks = null;

    // Taktik 1: Sitedeki doğrudan altyazı paketini bul
    const match1 = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (match1) {
        try { captionTracks = JSON.parse(match1[1]); } catch(e){}
    }

    // Taktik 2: Bulamazsa ilk yükleme nesnesinin (ytInitialPlayerResponse) içine dal
    if (!captionTracks) {
        const match2 = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;/);
        if (match2) {
            try { 
                const data = JSON.parse(match2[1]); 
                captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            } catch(e){}
        }
    }

    if (!captionTracks || captionTracks.length === 0) {
        return res.status(500).json({ error: 'Altyazı bulunamadı. Video altyazısız veya erişim engellendi.' });
    }

    // Öncelik Sırası: Yunanca -> İngilizce -> İlk Çıkan
    let targetTrack = captionTracks.find(t => t.languageCode.startsWith('el')) ||
                      captionTracks.find(t => t.languageCode.startsWith('en')) ||
                      captionTracks[0];

    // Altyazı veri linkini çek (JSON3 formatında)
    const subUrl = targetTrack.baseUrl + '&fmt=json3';
    
    let subData = null;
    try {
        // Önce doğrudan çekmeyi dene
        const subRes = await fetch(subUrl); 
        if (!subRes.ok) throw new Error("Doğrudan indirme engellendi");
        subData = await subRes.json();
    } catch(e) {
        // Doğrudan çekemezse proxy üzerinden çek
        const proxySub = await fetch(`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(subUrl)}`);
        subData = await proxySub.json();
    }

    // YouTube'un karmaşık formatını saniye saniye temizle
    const parsed = [];
    if (subData && subData.events) {
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
    }

    if (parsed.length === 0) throw new Error("Ayrıştırılmış metin boş çıktı.");

    // Tüm engeller aşıldı! Veriyi gönder.
    return res.status(200).json({ isGreek: targetTrack.languageCode.startsWith('el'), data: parsed });

  } catch (error) {
    return res.status(500).json({ error: 'Sunucu İşlem Hatası: ' + error.message });
  }
};
