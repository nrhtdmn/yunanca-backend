const { YoutubeTranscript } = require('youtube-transcript');

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
    let transcript = [];
    let isGreek = true;

    try {
        // 1. Önce videodan zorla Yunanca altyazıyı (el) koparmaya çalışıyoruz
        transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'el' });
    } catch (e) {
        // 2. Yunanca yoksa İngilizceyi deniyoruz
        try {
            transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
            isGreek = false;
        } catch (err) {
            // 3. İkisi de yoksa, videonun orijinal dilinde ne varsa onu çekiyoruz
            transcript = await YoutubeTranscript.fetchTranscript(videoId);
            isGreek = false;
        }
    }

    if (!transcript || transcript.length === 0) {
        return res.status(500).json({ error: 'Bu videoda hiçbir altyazı bulunamadı.' });
    }

    // Altyazıları sistemin saniye saniye oynatabileceği temiz bir JSON formatına dönüştürüyoruz
    const formattedCaptions = transcript.map(item => ({
        start: item.offset / 1000,
        end: (item.offset + item.duration) / 1000,
        text: item.text.replace(/\n/g, ' ').replace(/\[.*?\]/g, '').trim()
    }));

    // Başarıyla frontend'e (Akıllı Okuyucuya) gönder
    return res.status(200).json({ isGreek: isGreek, data: formattedCaptions });

  } catch (error) {
    // Mobil API bile engellenirse veya altyazı tamamen kapalıysa hata fırlat
    return res.status(500).json({ error: 'Altyazı kapalı veya API engeli: ' + error.message });
  }
};
