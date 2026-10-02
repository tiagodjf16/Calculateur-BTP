// Étape 2 : met en page les affiches par-dessus les scènes déjà rendues (pas de 3D ici, rendu rapide).
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import crypto from "crypto";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const SCR = "/tmp/claude-0/-home-user-Calculateur-BTP/291990b4-76f7-5681-9dee-a94b37165096/scratchpad";
const D = SCR + "/affiches/v4";
const OUT = D + "/finales";
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1080, height: 2160 }, deviceScaleFactor: 1 });
await ctx.route("**/*", async route => {
  const u = new URL(route.request().url());
  if (u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com"){
    const css = u.hostname === "fonts.googleapis.com";
    const cle = crypto.createHash("md5").update(u.href + "\n").digest("hex").slice(0, 12);
    const f = path.join(SCR, "fonts", css ? "css-" + cle + ".css" : cle + ".woff2");
    const type = css ? "text/css" : "font/woff2";
    if (fs.existsSync(f)) return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(f), headers: { "access-control-allow-origin": "*" } });
    for (let essai = 0; essai < 4; essai++){
      try { const r = await route.fetch({ timeout: 15000 }); if (r.ok()){ const b = await r.body(); fs.writeFileSync(f, b); return route.fulfill({ status: 200, contentType: type, body: b, headers: { "access-control-allow-origin": "*" } }); } } catch (e) {}
      await new Promise(ok => setTimeout(ok, 800 * (essai + 1)));
    }
    return route.fulfill({ status: 404, body: "" });
  }
  if (u.hostname === "affiches.test"){
    const f = path.join(D, decodeURIComponent(u.pathname));
    if (fs.existsSync(f)) return route.fulfill({ status: 200, contentType: f.endsWith(".html") ? "text/html; charset=utf-8" : "image/png", body: fs.readFileSync(f) });
    return route.fulfill({ status: 404, body: "" });
  }
  return route.abort();
});
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", e.message));
for (const nom of process.argv.slice(2)){
  await p.goto(`http://affiches.test/pages/${nom}.html`, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForSelector("body[data-pret]", { timeout: 15000 }).catch(() => console.log("  (ajustement non signalé)", nom));
  const [w, h] = await p.evaluate(() => { const a = document.querySelector(".affiche"); return [a.offsetWidth, a.offsetHeight]; });
  await p.setViewportSize({ width: w, height: h });
  const deb = await p.evaluate(() => [...document.querySelectorAll("[data-fit]")].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim().slice(0, 40)).concat(document.body.dataset.trop ? ["LISTE TROP LONGUE"] : []));
  if (deb.length) console.log("  débordement :", nom, deb.join(" | "));
  await p.screenshot({ path: `${OUT}/${nom}.png`, clip: { x: 0, y: 0, width: w, height: h } });
  if (process.env.JPG) await p.screenshot({ path: `${process.env.JPG}/${nom}.jpg`, type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: w, height: h } });
  console.log("ok", nom);
}
await b.close();
