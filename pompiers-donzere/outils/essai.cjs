// Essai automatique du jeu dans Chromium (Playwright), sans serveur : les fichiers du projet sont servis par interception.
// Usage : node outils/essai.cjs <capture.png> [#options] [secondes] ["code JS à exécuter dans la page après le départ"]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [, , capture = 'essai.png', hash = '', attente = '6', code = ''] = process.argv;
const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream' };

(async () => {
  const nav = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await nav.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const erreurs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') erreurs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
  page.on('pageerror', (e) => erreurs.push('[exception] ' + String(e.stack || e).slice(0, 600)));
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    const f = path.join(RACINE, decodeURIComponent(u.pathname));
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'absent' });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  const t0 = Date.now();
  await page.goto('http://jeu.test/index.html' + hash);
  try {
    await page.waitForFunction(() => { const b = document.querySelector('#jouer'); return (b && !b.disabled) || /Erreur/.test(document.querySelector('#charge-texte')?.textContent || ''); }, null, { timeout: 240000 });
  } catch (e) { erreurs.push('délai de chargement dépassé'); }
  console.log('chargement :', ((Date.now() - t0) / 1000).toFixed(1), 's —', await page.textContent('#charge-texte').catch(() => '?'));
  if (await page.$('#jouer:not([disabled])')) {
    await page.click('#jouer');
    if (code.startsWith('@')) await require(path.resolve(code.slice(1)))(page, (nom) => page.screenshot({ path: capture.replace(/\.png$/, `_${nom}.png`) })).catch((err) => erreurs.push('[scénario] ' + String(err).slice(0, 300)));   // scénario en plusieurs étapes
    else if (code) { const r = await page.evaluate(code).catch((e) => 'ERREUR ' + e.message); if (r !== undefined) console.log('résultat :', JSON.stringify(r)); }
    await page.waitForTimeout(parseFloat(attente) * 1000);
    const infos = await page.evaluate(() => { const j = window.__jeu; const i = j.renderer.info; return { triangles: i.render.triangles, appels: i.render.calls, textures: i.memory.textures, x: +j.vsav.x.toFixed(1), z: +j.vsav.z.toFixed(1), v: +j.vsav.v.toFixed(2), etat: j.jeu.etat }; }).catch((e) => String(e));
    console.log('rendu :', JSON.stringify(infos));
  }
  await page.screenshot({ path: capture });
  for (const e of erreurs.slice(0, 12)) console.log(e);
  await nav.close();
})();
