import {
  validated,
  createDiagramSchema,
  type DiagramNode,
  type DiagramEdge,
} from "./schema";

const phases = [
  {
    id: "research",
    label: "Ürün araştırması",
    description: "Çözmeye değer bir ihtiyacı ve ürün fırsatını görünür kıl.",
    notes:
      "İlk hedef bir özellik listesi değil, kimin hangi sorununu çözeceğimizi anlamak. Bulguları, varsayımları ve açık soruları birbirinden ayır.",
    steps: [
      [
        "problem",
        "Problemi tanımla",
        "Kim, hangi bağlamda, ne yapmakta zorlanıyor? Mevcut çözümler neden yeterli değil?",
      ],
      [
        "landscape",
        "Pazarı ve alternatifleri incele",
        "Benzer uygulamaları, kullanıcı yorumlarını ve farklılaşma alanlarını incele. Kaynakları bulgunun yanında sakla.",
      ],
      [
        "opportunity",
        "Fırsatı çerçevele",
        "Hedef kullanıcıyı, kullanım sıklığını ve neden şimdi sorusunu kısa bir fırsat notuna dönüştür.",
      ],
    ],
  },
  {
    id: "validate",
    label: "Fikri doğrulama",
    description:
      "En riskli varsayımları, küçük ve somut deneylerle sınamaya al.",
    notes:
      "Bu aşamanın çıktısı yalnızca devam kararı değildir. Kapsamı daraltmak, farklı bir probleme yönelmek veya fikri beklemeye almak da geçerli sonuçlardır.",
    steps: [
      [
        "assumptions",
        "Varsayımları sırala",
        "Ürünün işe yaraması için doğru olması gerekenleri yaz. Belirsizlik ve etki birlikte önceliği belirlesin.",
      ],
      [
        "experiment",
        "Küçük bir deney yap",
        "Görüşme, prototip veya küçük bir işlev üzerinden gerçek davranışa ilişkin kanıt topla.",
      ],
      [
        "decision",
        "Devam kararını ver",
        "Kanıtlar yeterliyse ilerle. Sonucu ve kararı değiştirecek yeni bilgiyi kaydet.",
      ],
    ],
  },
  {
    id: "design",
    label: "Ürün ve tasarım",
    description:
      "Ürünün ilk sürümünü ve anlaşılır kullanım deneyimini şekillendir.",
    notes:
      "İlk sürümün sınırlarını görünür tut. Her ek özellik, kullanıcının temel işini daha iyi yapmasına katkısıyla değerlendirilsin.",
    steps: [
      [
        "scope",
        "İlk sürümü sınırla",
        "Temel kullanıcı akışını, kapsam dışını ve başarı ölçütünü belirle.",
      ],
      [
        "flows",
        "Akışları tasarla",
        "Başlangıç, boş durum, hata ve geri dönüş adımlarını birlikte ele al.",
      ],
      [
        "interface",
        "Arayüzü netleştir",
        "Bileşenleri ve platform davranışlarını tutarlı bir görsel dille birleştir.",
      ],
    ],
  },
  {
    id: "build",
    label: "Geliştirme",
    description: "Dar kapsamı, çalışan ve sürdürülebilir bir ürüne dönüştür.",
    notes:
      "İşleri uçtan uca doğrulanabilir küçük parçalara böl. Agentların ürettiği değişiklikler de aynı kalite kontrollerinden geçsin.",
    steps: [
      [
        "foundation",
        "Temeli kur",
        "Veri, uygulama yapısı ve kritik entegrasyonları gerçek akışla doğrula.",
      ],
      [
        "features",
        "Akışları tamamla",
        "Özellikleri yalnızca ekranlarıyla değil, kayıt ve hata davranışlarıyla birlikte geliştir.",
      ],
      [
        "review",
        "Değişiklikleri gözden geçir",
        "Testleri çalıştır; erişilebilirlik, güvenlik ve bakım açısından incele.",
      ],
    ],
  },
  {
    id: "test",
    label: "Test ve hazırlık",
    description: "Gerçek kullanımda güvenilecek bir sürüm hazırla.",
    notes:
      "Simülatör ve otomatik test sonuçlarını gerçek cihaz gözlemlerinden ayrı tut. Yayını engelleyen bulguların durumunu açıkça kaydet.",
    steps: [
      [
        "critical",
        "Kritik akışları doğrula",
        "Kayıt, tekrar açma, hata durumları ve gerekiyorsa satın alma gibi temel akışları test et.",
      ],
      [
        "devices",
        "Cihazda incele",
        "Hedef macOS/iOS sürümlerinde okunabilirliği, performansı ve etkileşimleri kontrol et.",
      ],
      [
        "release-candidate",
        "Yayın adayını hazırla",
        "Bilinen eksikleri, sürüm notlarını ve geri dönüş planını netleştir.",
      ],
    ],
  },
  {
    id: "release",
    label: "Yayın",
    description:
      "Ürünü, doğru bilgiler ve kontrollü bir yayın süreciyle kullanıcıya ulaştır.",
    notes:
      "Mağaza bilgileri, uygulamanın gerçekten sunduğu davranışı yansıtsın. İnceleme ve yayın sonucunu varsayım yerine kayıtlı kanıtla takip et.",
    steps: [
      [
        "store",
        "Mağaza sayfasını tamamla",
        "Açıklama, ekran görüntüleri, gizlilik bilgileri ve gerekli destek bağlantılarını hazırla.",
      ],
      [
        "submit",
        "İncelemeye gönder",
        "Uygun build’i, erişim bilgilerini ve inceleme notlarını doğrulayarak gönder.",
      ],
      [
        "launch",
        "Yayını kontrol et",
        "Mağaza görünürlüğünü, indirme ve ilk açılış deneyimini doğrula.",
      ],
    ],
  },
  {
    id: "maintain",
    label: "Bakım ve öğrenme",
    description:
      "Kullanımdan öğren, sorunları gider ve bir sonraki kararı besle.",
    notes:
      "Ölçüm tek başına amaç değildir. Kullanıcı geri bildirimi ve teknik sinyalleri birleştirerek neyin değişmesi gerektiğine karar ver.",
    steps: [
      [
        "signals",
        "Sinyalleri topla",
        "Kullanıcı geri bildirimini, hataları ve anlamlı kullanım ölçümlerini bir araya getir.",
      ],
      [
        "priorities",
        "İyileştirmeleri önceliklendir",
        "Etki, çaba ve ürün yönünü birlikte değerlendir. Bakım ile yeni özellikleri görünür biçimde dengele.",
      ],
      [
        "iterate",
        "Yeni döngüyü başlat",
        "Öğrenilenleri araştırma ve ürün kararlarına geri taşı.",
      ],
    ],
  },
];

export function mefaAppsTemplate() {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  for (const [index, phase] of phases.entries()) {
    nodes.push({
      id: phase.id,
      label: phase.label,
      kind: "phase",
      description: phase.description,
      notes: phase.notes,
      tags: ["Mefa Apps"],
      sources: [],
    });
    for (const [stepIndex, [id, label, description]] of phase.steps.entries()) {
      nodes.push({
        id,
        label,
        description,
        kind: id === "decision" ? "decision" : "step",
        parentId: phase.id,
        notes: "",
        tags: [],
        sources: [],
      });
      if (stepIndex > 0)
        edges.push({
          id: `${phase.steps[stepIndex - 1][0]}-${id}`,
          source: phase.steps[stepIndex - 1][0],
          target: id,
          label: "",
          kind: "flow",
        });
    }
    if (index > 0)
      edges.push({
        id: `${phases[index - 1].id}-${phase.id}`,
        source: phases[index - 1].id,
        target: phase.id,
        label: "",
        kind: "flow",
      });
  }
  edges.push({
    id: "learning-loop",
    source: "maintain",
    target: "research",
    label: "Öğrenilenleri geri taşı",
    kind: "feedback",
  });
  return validated(createDiagramSchema, {
    title: "Mefa Apps ürün yaşam döngüsü",
    description:
      "Ürün araştırmasından yayına, bakımdan yeni fikirlere uzanan çalışma haritası. Başlangıç taslağıdır; aşamalar doğrulanmış stüdyo süreçleri olarak sunulmaz.",
    tags: ["Mefa Apps", "iOS / macOS", "Başlangıç taslağı"],
    document: { schemaVersion: 1, nodes, edges },
  });
}
