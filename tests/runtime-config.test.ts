import { afterEach, expect, test, vi } from "vitest";
import { getDatabase } from "@/lib/db";

afterEach(() => vi.unstubAllEnvs());
test.each(["VERCEL", "NETLIFY", "MEFAGRAM_REQUIRE_DATABASE_URL"])(
  "%s refuses an ephemeral database fallback",
  (key) => {
    for (const name of [
      "VERCEL",
      "NETLIFY",
      "MEFAGRAM_REQUIRE_DATABASE_URL",
      "DATABASE_URL",
    ])
      vi.stubEnv(name, undefined);
    vi.stubEnv(key, key === "MEFAGRAM_REQUIRE_DATABASE_URL" ? "true" : "1");
    expect(() => getDatabase()).toThrow("DATABASE_URL");
  },
);
