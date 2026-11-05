// Releases before v0.1.2 stored these system-generated summaries in Turkish.
// Translate only known summaries at read time; never rewrite saved history.
const legacySummaries = new Map([
  ["Diyagram oluşturuldu", "Diagram created"],
  ["Diyagram bilgileri güncellendi", "Diagram details updated"],
  ["Düğüm eklendi", "Node added"],
  ["Düğüm güncellendi", "Node updated"],
  ["Düğüm silindi", "Node removed"],
  ["Bağlantı eklendi", "Connection added"],
  ["Bağlantı güncellendi", "Connection updated"],
  ["Bağlantı silindi", "Connection removed"],
]);

export function englishRevisionSummary(summary: string): string {
  const legacy = legacySummaries.get(summary);
  if (legacy) return legacy;
  return summary
    .replace(/^(\d+) değişiklik uygulandı$/, "$1 changes applied")
    .replace(/^Sürüm (\d+) geri yüklendi$/, "Restored revision $1");
}
