import { expect, test } from "vitest";
import { toSvg } from "@/lib/graph/svg";
import { createDiagramSchema } from "@/lib/diagrams/schema";
import { newsletterTemplate } from "@/lib/diagrams/seed";

test("draws the overview and a phase as standalone, escaped SVG", async () => {
  const content = createDiagramSchema.parse(newsletterTemplate());
  const overview = await toSvg(content);
  expect(overview).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  expect(overview).not.toMatch(/<script|<foreignObject|href=/i);
  for (const node of content.document.nodes.filter((item) => !item.parentId))
    expect(overview).toContain(node.label.replace(/&/g, "&amp;"));
  const phase = content.document.nodes.find((item) => item.kind === "phase")!;
  const scoped = await toSvg(content, { scopeId: phase.id });
  expect(scoped).toContain(`${content.title} › ${phase.label}`);
  const tricky = createDiagramSchema.parse({
    title: "<b>Unsafe</b> & \"quoted\"",
    document: {
      schemaVersion: 1,
      nodes: [{ id: "a", label: "<script>alert(1)</script>" }],
      edges: [],
    },
  });
  const escaped = await toSvg(tricky);
  expect(escaped).not.toContain("<script>");
  expect(escaped).toContain("&lt;script&gt;");
  expect(escaped).toContain("&lt;b&gt;Unsafe&lt;/b&gt; &amp; &quot;quoted&quot;");
});
