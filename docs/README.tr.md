# Mefagram

AI agentlarının oluşturup güncellediği, senin okuyup analiz ettiğin kişisel diyagram alanı. Kod ücretsiz ve MIT lisanslıdır; katkılar kabul edilir. Arayüz şu anda Türkçedir. Her kullanıcı kendi özel kurulumuna ve verisine sahip olur.

## Hızlı kurulum

Node.js 24+ gerekir:

```sh
git clone https://github.com/berkinduz/mefagram.git
cd mefagram
npm ci
npm run setup -- --name "Adın" --email sen@example.com
npm run build
npm start
```

`http://127.0.0.1:3000` adresini aç. Giriş parolası `.mefagram/local-access.json` içindedir. Yeni çalışma alanı boştur. İsteğe bağlı Mefa Apps örneği için sunucu kapalıyken `npm run setup -- --example mefa-apps` çalıştır. Bu harita bir başlangıç önerisidir.

Sonraki açılışlarda `npm start` yeterlidir. Güncellemeden ve yedekten önce sunucuyu durdur; `.mefagram` ile `.env.local` dosyalarını özel bir konumda sakla. Kurulumu yeniden çalıştırmak mevcut hesabı, anahtarları, diyagramları ve geçmişi sıfırlamaz.

## Agent → Diyagram → Kullanıcı

Bir kişinin bütün agentları, aynı kurulumun kimliği doğrulanmış `/api/mcp` adresine bağlanır. Tarayıcı da aynı veriyi okur. Agent başına ayrı bir canlı veritabanı oluşturulmaz. GitHub’dan kodu alan başka kullanıcılar kendi kurulumlarını yönetir.

```sh
npm run agent -- list
npm run agent -- get <diagram-id>
npm run agent -- call update_diagram /absolute/path/to/arguments.json
```

Uzak agentın ihtiyaçları `MEFAGRAM_URL` ve `MEFAGRAM_AGENT_TOKEN` veya OAuth bağlantısıdır. Veritabanı yönetici parolasına ihtiyacı yoktur. Agentları mümkünse kendi sınırlı ve iptal edilebilir anahtarlarıyla bağla.

Mac kapalıyken erişim için özel kurulumun Mac’ten bağımsız, erişilebilir bir sunucuda çalışması gerekir. Agentın bulut ortamına repoyu kopyalamak, tüm agentlara ortak veri veya sürekli web sunucusu sağlamaz. Yerel kullanımda ek servis/API ücreti gerekmez; dış hosting hizmetlerinin kendi kotaları ve koşulları vardır.

[Kurulum/güncelleme/yedekleme](installation.md) · [Agent bağlantısı](agent-integration.md) · [Dağıtım](deployment.md) · [Katkı rehberi](../CONTRIBUTING.md) · [Doğrulama](verification.md)
