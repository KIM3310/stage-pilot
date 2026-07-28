import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "site");
const origin = "https://stage-pilot.pages.dev";
const publisher = "ca-pub-4973160293737562";
const loader =
  "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js" +
  `?client=${publisher}`;

function read(name) {
  return readFileSync(path.join(site, name), "utf8");
}

const index = read("index.html");
assert.match(
  index,
  new RegExp(`name="google-adsense-account" content="${publisher}"`)
);
assert.doesNotMatch(index, /pagead2\.googlesyndication\.com/);

for (const name of ["guide.html", "architecture.html", "verification.html"]) {
  const html = read(name);
  assert.ok(html.includes(loader), `${name} must load AdSense`);
  assert.ok(
    html.includes('data-ad-surface="editorial"'),
    `${name} must declare an editorial ad surface`
  );
}

for (const name of ["publisher.html", "privacy.html", "terms.html"]) {
  assert.ok(
    !read(name).includes(loader),
    `${name} must remain advertising-free`
  );
}

const sitemap = read("sitemap.xml");
for (const route of [
  "/",
  "/guide.html",
  "/architecture.html",
  "/verification.html",
  "/publisher.html",
  "/privacy.html",
  "/terms.html",
]) {
  assert.ok(
    sitemap.includes(`<loc>${origin}${route}</loc>`),
    `sitemap must include ${route}`
  );
}
assert.doesNotMatch(sitemap, /\.(?:json|txt)<\/loc>/);

console.log("StagePilot publication surface validated.");
