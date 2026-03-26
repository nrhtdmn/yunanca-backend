export default async function handler(req, res) {
  // CORS Ayarları (Uygulamanızın bağlanabilmesi için)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Tarayıcı güvenlik onaylarını geç
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Hem kendi uygulamamızdan gelen (POST) hem de test için tarayıcıdan gelen (GET) istekleri kabul et
  const videoId = req.method === 'POST' ? req.body?.videoId : req.query?.videoId;

  if (!videoId) {
    return res.status(400).json({ error: 'Lütfen bir video ID gönderin.' });
  }

  try {
    // YouTube'un engellerine takılmayan, hazır ve hızlı açık kaynak sunucu havuzu
    const instances = [
      'https://pipedapi.kavin.rocks',
      'https://api.piped.projectsegfau.lt',
      'https://pipedapi.adminforge.de',
      'https://pipedapi.smnz.de'
    ];

    let subtitlesList = null;

    // Çalışan bir sunucu bulana kadar sırayla dene
    for (const baseUrl of instances) {
      try {
        const response = await fetch(`${baseUrl}/streams/${videoId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.subtitles && data.subtitles.length > 0) {
            subtitlesList = data.subtitles;
            break;
          }
        }
      } catch (e) {
        continue; 
      }
    }

    if (!subtitlesList) {
      return res.status(500).json({ error: 'Bu videoda altyazı bulunamadı veya altyazılar kapalı.' });
    }

    // Öncelik Sırası: Yunanca -> İngilizce -> İlk Bulunan
    let targetSub = subtitlesList.find(s => s.code.startsWith('el')) ||
                    subtitlesList.find(s => s.code.startsWith('en')) ||
                    subtitlesList[0];

    // Altyazı VTT dosyasını indir
    const vttRes = await fetch(targetSub.url);
    if (!vttRes.ok) throw new Error("Altyazı metni indirilemedi.");
    const vttText = await vttRes.text();

    // VTT formatını bizim uygulamanın anlayacağı JSON formatına dönüştür
    const lines = vttText.split(/\r?\n/);
    const parsed = [];
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i].trim();
        if (line.includes('-->')) {
            const parts = line.split('-->');
            const start = parseVttTime(parts[0].trim());
            const end = parseVttTime(parts[1].trim());
            i++;
            let text = "";
            while (i < lines.length && lines[i].trim() !== "" && !lines[i].includes('-->')) {
                text += lines[i].replace(/<[^>]+>/g, '').trim() + " ";
                i++;
            }
            if (text.trim()) parsed.push({ start, end, text: text.trim().replace(/\s+/g, ' ') });
        } else {
            i++;
        }
    }

    if (parsed.length === 0) throw new Error("Ayrıştırılmış altyazı boş.");

    // Tüm işlemler başarılıysa altyazıyı gönder
    return res.status(200).json({ isGreek: targetSub.code.startsWith('el'), data: parsed });

  } catch (error) {
    return res.status(500).json({ error: 'Hata oluştu: ' + error.message });
  }
}

// Zaman hesaplama yardımcı fonksiyonu
function parseVttTime(timeStr) {
    const parts = timeStr.split(':');
    let sec = 0;
    if (parts.length === 3) {
        sec = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
        sec = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return sec;
}
