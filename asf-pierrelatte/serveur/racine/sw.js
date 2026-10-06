/* Service worker du site ASF Pierrelatte : notifications, et un cache pour aller plus vite et s'ouvrir sans réseau.
   - Les pages : toujours le réseau d'abord, donc jamais une vieille version quand on est connecté ; sans réseau, la dernière
     version gardée sur l'appareil, sinon une petite page « Pas de connexion ».
   - Les images du site : gardées sur l'appareil et rafraîchies en arrière-plan.
   - Tout le reste (les données /api, les envois, les autres sites) passe comme avant, sans cache.
   Pour tout vider chez tout le monde : changer les numéros de PAGES et FICHIERS. */
const ICONE = "/notif-icone.png";
const BADGE = "/notif-badge.png";
const PAGES = "asfp-pages-1", FICHIERS = "asfp-fichiers-1";
const MAX_FICHIERS = 150, TAILLE_MAX = 3 * 1024 * 1024;

self.addEventListener("install", e => {
  self.skipWaiting();
  // la page d'accueil gardée tout de suite : hors ligne, l'appli s'ouvre même si on ne l'a ouverte qu'une fois
  // (en général sans rien retélécharger : la page vient d'être chargée). Une erreur ici ne bloque jamais l'installation.
  e.waitUntil((async () => {
    try {
      const r = await fetch("/", { credentials: "same-origin" });
      const type = (r.headers.get("content-type") || "").toLowerCase();
      if (r.status === 200 && r.type === "basic" && type.includes("text/html")) await (await caches.open(PAGES)).put(self.location.origin + "/", r);
    } catch (x) {}
  })());
});
self.addEventListener("activate", e => e.waitUntil((async () => {
  // les anciens caches de ce site (autre numéro) sont supprimés
  try {
    const cles = await caches.keys();
    await Promise.all(cles.filter(k => k.startsWith("asfp-") && k !== PAGES && k !== FICHIERS).map(k => caches.delete(k)));
  } catch (x) {}
  // la page part sur le réseau pendant que le service worker démarre (plus rapide)
  try { if (self.registration.navigationPreload) await self.registration.navigationPreload.enable(); } catch (x) {}
  await self.clients.claim();
})()));

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url; try { url = new URL(req.url); } catch (x) { return; }
  if (url.origin !== self.location.origin) return;                       // polices Google, bibliothèques : le navigateur s'en charge
  const exclu = /^\/(api|\.well-known)\//.test(url.pathname) || url.pathname === "/sw.js" || url.pathname === "/manifest.json";
  if (req.mode === "navigate"){ e.respondWith(exclu ? reseauSeul(e) : page(e, url)); return; }
  if (exclu) return;
  if (!req.headers.has("range") && (req.destination === "image" || /\.(png|jpe?g|webp|gif|svg|ico|avif)$/i.test(url.pathname))){
    e.respondWith(image(e, req));
  }
});

/* une page : le réseau d'abord ; sans réseau, la copie gardée (une seule par adresse, sans « ?… ») */
async function page(e, url){
  const cle = url.origin + url.pathname;
  try {
    let r = null;
    try { r = await e.preloadResponse; } catch (x) { r = null; }
    if (!r) r = await fetch(e.request);
    const type = (r.headers.get("content-type") || "").toLowerCase();
    if (r.status === 200 && r.type === "basic" && type.includes("text/html")){
      const copie = r.clone();
      try { e.waitUntil(caches.open(PAGES).then(c => c.put(cle, copie)).catch(() => {})); } catch (x) {}
    }
    return r;
  } catch (x) {
    try { const c = await caches.match(cle, { cacheName: PAGES }); if (c) return c; } catch (y) {}
    return horsLigne();
  }
}

/* une adresse /api… ouverte comme une page (Réglages Facebook, Télécharger une sauvegarde) : le réseau seulement, sans copie,
   en reprenant la requête déjà partie (préchargement) pour qu'elle ne parte pas deux fois au serveur */
async function reseauSeul(e){
  try {
    let r = null;
    try { r = await e.preloadResponse; } catch (x) { r = null; }
    return r || await fetch(e.request);
  } catch (x) { return horsLigne(); }
}

/* une image : la copie gardée tout de suite (si elle existe), et la nouvelle version téléchargée pour la prochaine fois */
async function image(e, req){
  let cache = null, gardee = null;
  try { cache = await caches.open(FICHIERS); gardee = await cache.match(req); } catch (x) {}
  const reseau = fetch(req).then(r => {
    const taille = +(r.headers.get("content-length") || 0);
    if (cache && r.status === 200 && r.type === "basic" && taille <= TAILLE_MAX){
      const copie = r.clone();
      cache.put(req, copie).then(() => tailler(cache)).catch(() => {});
    }
    return r;
  });
  if (gardee){ try { e.waitUntil(reseau.catch(() => {})); } catch (x) {} return gardee; }
  return reseau.catch(() => Response.error());
}
async function tailler(cache){
  try { const cles = await cache.keys(); if (cles.length > MAX_FICHIERS) await Promise.all(cles.slice(0, cles.length - MAX_FICHIERS).map(k => cache.delete(k))); } catch (x) {}
}

/* sans réseau, une page jamais ouverte : un message clair, et la page se recharge toute seule au retour du réseau */
function horsLigne(){
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0F2257"><link rel="icon" type="image/png" href="/icone-192.png"><title>ASF Pierrelatte · Pas de connexion</title>
<style>html,body{margin:0;height:100%}body{display:grid;place-items:center;background:#0F2257;color:#fff;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
img{width:96px;height:96px;border-radius:50%;margin-bottom:16px}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 20px;color:#C9D4F2}
button{font:700 16px system-ui,sans-serif;padding:12px 22px;border-radius:12px;border:0;background:#2F6BFF;color:#fff;cursor:pointer}</style></head>
<body><main><img src="/icone-192.png" alt=""><h1>Pas de connexion internet</h1><p>Vérifie le réseau : la page s'ouvrira dès que la connexion revient.</p>
<button type="button" onclick="location.reload()">Réessayer</button></main>
<script>addEventListener("online",function(){location.reload()})</script></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let d = null;
    try { d = e.data ? e.data.json() : null; } catch (x) { d = null; }
    if (!d || !d.titre){
      try { const r = await fetch("/api/push?dernier=1", { credentials: "include", cache: "no-store" }); d = await r.json(); } catch (x) {}
    }
    d = d && d.titre ? d : { titre: "ASF Pierrelatte", texte: "Nouveauté sur le site du club", lien: "/" };
    await self.registration.showNotification(d.titre, {
      body: d.texte || "",
      icon: ICONE,
      badge: BADGE,
      tag: d.tag || ("asfp-" + Date.now()),
      renotify: true,
      vibrate: [120, 60, 120],
      data: { lien: d.lien || "/" }
    });
  })());
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.lien) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const f of fenetres){
      if (new URL(f.url).origin === self.location.origin){
        try { if (f.navigate) await f.navigate(url); } catch (x) {}
        return f.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});

/* le navigateur a renouvelé l'abonnement : on prévient le site, pour ne rien rater */
self.addEventListener("pushsubscriptionchange", e => {
  e.waitUntil((async () => {
    try {
      const { cle } = await (await fetch("/api/push?cle_publique=1")).json();
      const b = (cle + "=".repeat((4 - cle.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
      const cleOctets = Uint8Array.from(atob(b), c => c.charCodeAt(0));
      const abo = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleOctets });
      await fetch("/api/push", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: abo.toJSON() }) });
    } catch (x) {}
  })());
});
