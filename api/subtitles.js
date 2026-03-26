const { getSubtitles } = require('youtube-captions-scraper');

export default async function handler(req, res) {
  // Tarayıcınızın (Uygulamanızın) bu sunucuya bağlanmasına izin veren ayarlar
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST isteği kabul edilir.' });
  }

  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: 'Video ID gerekli.' });

  try {
    let captions = [];
    let isGreek = true;
    
    try {
      // 1. Önce videoda Yunanca altyazı var mı diye bakıyoruz
      captions = await getSubtitles({ videoID: videoId, lang: 'el' });
    } catch (err) {
      // 2. Yunanca yoksa, İngilizce altyazıyı zorla çekiyoruz
      captions = await getSubtitles({ videoID: videoId, lang: 'en' });
      isGreek = false;
    }

    // Altyazıları uygulamanızın anlayacağı sade formata çeviriyoruz
    const formattedCaptions = captions.map(cap => ({
      start: parseFloat(cap.start),
      end: parseFloat(cap.start) + parseFloat(cap.dur),
      text: cap.text.replace(/\n/g, ' ').replace(/\[.*?\]/g, '').trim()
    }));

    return res.status(200).json({ isGreek: isGreek, data: formattedCaptions });

  } catch (error) {
    return res.status(500).json({ error: 'YouTube videoyu engelledi veya hiçbir altyazı yok.' });
  }
}