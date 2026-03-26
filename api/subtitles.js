const { YoutubeTranscript } = require('youtube-transcript');

module.exports = async (req, res) => {
  // CORS Ayarları (Uygulamanızın erişebilmesi için)
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
        transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'el' });
    } catch (e) {
        try {
            transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
            isGreek = false;
        } catch (err) {
            transcript = await YoutubeTranscript.fetchTranscript(videoId);
            isGreek = false;
        }
    }

    if (!transcript || transcript.length === 0) {
        return res.status(500).json({ error: 'Bu videoda hiçbir altyazı bulunamadı.' });
    }

    const formattedCaptions = transcript.map(item => ({
        start: item.offset / 1000,
        end: (item.offset + item.duration) / 1000,
        text: item.text.replace(/\n/g, ' ').replace(/\[.*?\]/g, '').trim()
    }));

    return res.status(200).json({ isGreek: isGreek, data: formattedCaptions });

  } catch (error) {
    return res.status(500).json({ error: 'Altyazı API engeli veya kapalı: ' + error.message });
  }
};
