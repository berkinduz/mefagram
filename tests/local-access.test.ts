import { expect, test } from "vitest";
import { isLoopbackOrigin, rejectNonLocal } from "@/lib/http/local";

const check = (headers: Record<string, string>) =>
  rejectNonLocal(new Headers(headers));

test.each([
  "127.0.0.1:3000",
  "127.0.0.1",
  "localhost:3000",
  "LOCALHOST:3000",
  "[::1]:3000",
])("accepts the loopback host %s", (host) => {
  expect(check({ host })).toBeNull();
});

test.each([
  "",
  "evil.example",
  "evil.example:3000",
  "127.0.0.1.evil.example",
  "localhost.evil.example",
  "192.168.1.10:3000",
  "0.0.0.0:3000",
  "127.0.0.1@evil.example",
])("refuses the rebinding or remote host %j", (host) => {
  expect(check(host ? { host } : {})).toMatch(/localhost/);
});

test("refuses other websites but allows the workspace's own pages and origin-less agents", () => {
  const host = "127.0.0.1:3000";
  expect(check({ host, origin: "https://evil.example" })).toMatch(/websites/);
  expect(check({ host, origin: "null" })).toMatch(/websites/);
  expect(check({ host, origin: "http://127.0.0.1:3000" })).toBeNull();
  expect(check({ host, origin: "http://localhost:5173" })).toBeNull();
  expect(check({ host })).toBeNull();
  expect(isLoopbackOrigin("file://localhost/x")).toBe(false);
});
