// Exporte les affiches du kit en PNG, sans rien faire à la main.
// Prérequis (une seule fois) :  npm install playwright   puis   npx playwright install chromium
// Utilisation :
//   node capturer.mjs                         toutes les affiches d'exemple, aux 3 formats, dans le dossier « png »
//   node capturer.mjs resultats-dom insta     une seule affiche, un seul format (fb, insta ou story)
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SORTIE = path.join(ICI, "png");
fs.mkdirSync(SORTIE, { recursive: true });
const tous = fs.readdirSync(path.join(ICI, "donnees")).filter(f => f.endsWith(".js") && f !== "logos.js").map(f => f.replace(/\.js$/, ""));
const [nom, format] = process.argv.slice(2);
const affiches = nom ? [nom] : tous;
const formats = format ? [format] : ["fb", "insta", "story"];

const navigateur = await chromium.launch();
const page = await navigateur.newPage({ viewport: { width: 1080, height: 2160 } });
for (const a of affiches) for (const f of formats){
  const url = pathToFileURL(path.join(ICI, "affiche.html")).href + `?d=${a}&f=${f}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("body[data-pret]", { timeout: 20000 });
  const trop = await page.evaluate(() => !!document.body.dataset.trop);
  const boite = await page.locator(".affiche").boundingBox();
  const fichier = path.join(SORTIE, `${f}-${a}.png`);
  await page.screenshot({ path: fichier, clip: boite });
  console.log((trop ? "⚠ trop de matchs, faire deux affiches : " : "✔ ") + fichier);
}
await navigateur.close();
