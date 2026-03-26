module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const videoId = req.method === 'POST' ? req.body?.videoId : req.query?.videoId;
  if (!videoId) return res.status(400).json({ error: 'Lütfen bir video ID gönderin.' });

  try {
    // 1. ZİRVE TAKTİĞİ: Vercel sunucusunu "Google Arama Motoru Botu" (Googlebot) olarak gösteriyoruz.
    // YouTube, arama sonuçlarında çıkmak zorunda olduğu için Googlebot'u ASLA engellemez!
    const ytRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const html = await ytRes.text();

    // 2. Altyazı paketini bul
    const regex = /"captionTracks":\s*(\[.*?\])/;
    const match = regex.exec(html);

    if (!match) {
        // Googlebot kılığında bile yoksa, video cidden altyazısızdır veya çok sıkı korunuyordur.
        return res.status(500).json({ error: 'Altyazı bulunamadı. Lütfen videoda CC açık olduğundan emin olun.' });
    }

    const captionTracks = JSON.parse(match[1]);

    // Öncelik Sırası: Yunanca -> İngilizce -> İlk Çıkan
    let targetTrack = captionTracks.find(t => t.languageCode.startsWith('el')) ||
                      captionTracks.find(t => t.languageCode.startsWith('en')) ||
                      captionTracks[0];

    // 3. Altyazıyı indir (Yine Googlebot maskesiyle)
    const subUrl = targetTrack.baseUrl + '&fmt=json3';
    const subRes = await fetch(subUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
    });
    
    if (!subRes.ok) throw new Error("Altyazı indirme isteği reddedildi.");
    const subData = await subRes.json();

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

    if (parsed.length === 0) throw new Error("Ayrıştırılmış metin boş.");

    // Veriyi gönder
    return res.status(200).json({ isGreek: targetTrack.languageCode.startsWith('el'), data: parsed });

  } catch (error) {
    return res.status(500).json({ error: 'Sunucu İşlem Hatası: ' + error.message });
  }
};
