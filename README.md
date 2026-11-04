# Mefagram

Agentların oluşturup güncellediği; senin süreçleri, fikirleri ve projeleri okuyup analiz ettiğin kişisel diyagram alanı.

React Flow canvas, açılabilir aşamalar, not/kaynak paneli, arama ve liste görünümü içerir. İnsan arayüzü okuma modunda açılır; düğüm ve bağlantı düzenleme ayrıca açılır. Agentlar aynı kayıt katmanına kimliği doğrulanmış MCP araçlarıyla erişir. Model API anahtarı veya ek AI aboneliği gerekmez.

## Mac’te çalıştır

Node.js 24+ gerekir. Repo dizininde:

```sh
npm ci
npm run setup
npm run build
npm start
```

[Çalışma alanını aç](http://127.0.0.1:3000). İlk girişin e-posta/parolası `.mefagram/local-access.json` içindedir. Bu dosyada agent anahtarı da vardır; git tarafından dışlanır. Sonraki açılışlarda `npm start` yeterlidir. Geliştirirken `npm run dev` kullan; iki sunucuyu aynı anda çalıştırma.

`setup` gerçek bir yerel Postgres veritabanı (PGlite), özel hesap ve başlangıç Mefa Apps haritası oluşturur. Mevcut kayıtları sıfırlamaz. Sunucu çalışırken aynı veritabanıyla `setup` çalıştırma. Mefa Apps haritasındaki 28 düğüm başlangıç önerisidir; stüdyonun doğrulanmış işleyişi olarak sunulmaz.

## Kullanım

- Soldan bir diyagram aç veya ad/içerik araması yap.
- Canvas’ı sürükleyerek gez; trackpad, yakınlaştırma kontrolleri ve **F** ile incele. Bir aşamadaki **alt adım** düğmesi daha küçük süreci açar.
- Düğüm seçince açıklama, notlar, kaynaklar ve ilişkiler sağda açılır. Klavyeyle düğüme odaklanıp Enter/boşluk ile de seçebilirsin. Liste görünümü daha uzun metinler için alternatiftir.
- **Düzenle** ile düğüm/bağlantı ekle, taşı veya düzenle. Odaklanan düğümü ok tuşlarıyla taşıyabilirsin; Shift adımı büyütür. Yalnızca sunucunun onayladığı değişiklikler kaydedilmiş sayılır.
- **⋯** menüsünden JSON dışa aktarma, arşiv ve sürüm geçmişi açılır. Önceki sürümü geri yüklemek yeni sürüm oluşturur.
- Agent değişiklikleri okuma modunda görünür sekmede yaklaşık 15 saniyede kontrol edilir. Yenile düğmesi hemen son kaydı açar.

## Agent erişimi

```sh
npm run agent -- list
npm run agent -- get <diagram-id>
npm run agent -- tools
npm run agent -- call update_diagram /absolute/path/to/arguments.json
```

Bu komutlar veritabanını doğrudan açmaz; çalışan uygulamanın MCP adresini kullanır. Yerel erişim dosyasını otomatik okur. Remote agent için `MEFAGRAM_URL` ve `MEFAGRAM_AGENT_TOKEN` veya özel `MEFAGRAM_ACCESS_FILE` tanımlanabilir.

MCP adresi: `http://127.0.0.1:3000/api/mcp`. OAuth 2.1/PKCE ve kişisel Bearer anahtarları desteklenir. Arayüzdeki **Agent bağlantıları** panelinden kısıtlı süreli anahtar oluşturup iptal edebilirsin. [Agent rehberi](docs/agent-integration.md) araçları, güncelleme sözleşmesini ve Codex bağlantısını açıklar.

## Kalıcılık ve taşınabilirlik

Veri `.mefagram/db` altında diske yazılır; tarayıcı deposu kanonik kayıt değildir. Yenileme, yeni tarayıcı oturumu ve sunucu yeniden başlatma test edilmiştir. Yerel PGlite dizinini aynı anda **tek Node süreci** açmalıdır. Tam yedek için sunucuyu durdurup `.mefagram` ve `.env.local` dosyalarını özel bir yedek konumuna kopyala. JSON dışa/içe aktarma, içerik taşır; hesap, anahtarlar ve bütün sürüm geçmişini taşımaz.

[JSON şeması](docs/diagram-export.schema.json) düğümleri, bağlantıları, üst düğümleri, koordinatları, notları ve kaynakları korur. İçe aktarma yeni bir diyagram oluşturur. Sınırlar: diyagram içeriği başına 2 MB (JSON dosya aktarımı en fazla 8 MB), 2.000 düğüm, 6.000 bağlantı; hiyerarşi en fazla 12 seviye. Bunlar performans garantisi değildir; tarayıcıda doğrulanan büyük örnek 150 düğümdür. Büyük haritaları aşamalara ayırmak okumayı kolaylaştırır.

## Yerel ve bulut kullanım

Mac’teki uygulama, bağımlılıklar kurulduktan sonra internet olmadan açılabilir. Bulut AI asistanı internetsiz çalışmaz. Dot’un bu Mac’teki kuruluma erişmesi Mac’in ve sunucunun açık, bağlantının erişilebilir olmasına bağlıdır. Ayrı bilgisayara repo kurmak, eski veritabanını kendiliğinden eşitlemez.

Sürekli erişim için uygulama erişilebilir bir sunucuda ve ortak Postgres ile çalıştırılabilir. Vercel’de `DATABASE_URL` zorunludur; dosya sistemine sessizce kayıt yapılmaz. [Dağıtım rehberi](docs/deployment.md) kurulum yolunu ve ücretsiz plan koşullarını açıklar. **Bu teslimde Vercel/Neon dağıtımı ve gerçek Dot bağlantısı tamamlanmış değildir.**

## Doğrulama

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run verify:bundle
```

Tarayıcı testleri ayrı, silinip yeniden oluşturulabilen `.mefagram/e2e-*` verisi kullanır. Ana veritabanına dokunmaz. Test sunucusunu çalıştırırken başka `next dev/start` süreci kapalı olmalı. [Doğrulama kaydı](docs/verification.md) çalışanlarla henüz doğrulanmayanları ayrı listeler.
