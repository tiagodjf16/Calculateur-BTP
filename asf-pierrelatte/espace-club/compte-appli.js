/* Compte et appareil (site et appli iPhone).
   - « Supprimer mon compte » sur la page Mon compte (#connexion) : exigé par Apple pour l'appli iPhone (les comptes joueurs
     se créent à la première connexion), utile partout. Mot de passe demandé, puis /api/auth?action=supprimer_moi.
   - À la déconnexion, ce téléphone n'est plus relié au compte pour les notifications personnelles (convocations, messages) :
     il sera relié de nouveau à la prochaine connexion (lierAppareil de l'application).
   - Dans l'appli iPhone, « Rester connecté » est coché d'office : sans lui, iOS oublie la connexion quand l'appli se ferme.
   Ajouté sans modifier le script de l'application. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.rendreConnexion !== "function") return;
  const api = () => window.ASFP_API || "/api";
  const dire = (t, e) => { if (typeof toast === "function") toast(t, e); };

  /* ---------- l'appareil et le compte ---------- */
  async function abonnementActuel(){
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      return reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    } catch(e){ return null; }
  }
  async function delierAppareil(){
    const abo = await abonnementActuel(); if (!abo || !abo.endpoint) return;
    try {
      await fetch(api() + "/push", { method: "DELETE", credentials: "same-origin", keepalive: true,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: abo.endpoint }) });
    } catch(e){}
  }
  function oublierLiaison(){
    try { for (let i = sessionStorage.length - 1; i >= 0; i--){ const k = sessionStorage.key(i); if (k && k.indexOf("asfp-appareil2-") === 0) sessionStorage.removeItem(k); } } catch(e){}
  }
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest('[data-a="deconnexion"]'); if (!b) return;
    oublierLiaison(); delierAppareil();                                  // la page se recharge ensuite : keepalive garde la demande
  }, true);

  /* ---------- Supprimer mon compte ---------- */
  function ajouterBloc(){
    try {
      const carte = document.querySelector("#zone-connexion .cx-carte");
      if ((S.heberge || /^https?:$/.test(location.protocol)) && S.compte && !S.compte.doitChanger && carte && !carte.querySelector(".cx-suppr")){
        carte.insertAdjacentHTML("beforeend", `<details class="cx-mdp cx-suppr"><summary>Supprimer mon compte</summary>
          <p class="cx-note">Ton compte est supprimé tout de suite : identifiant, mot de passe, connexions, téléphones reliés aux notifications et messages envoyés dans la messagerie.
          Ta fiche de licencié (équipe, licence) reste gérée par le club : pour la faire effacer aussi, écris au bureau
          (<a href="mailto:contact@asf-pierrelatte.fr">contact@asf-pierrelatte.fr</a>).</p>
          <form class="cx-form" data-cpt-suppr>
            <label>Ton mot de passe, pour confirmer<input type="password" name="mdp" required autocomplete="current-password"></label>
            <button class="btn danger">Supprimer définitivement mon compte</button></form></details>`);
      }
    } catch(e){}
  }
  const avant = window.rendreConnexion;
  window.rendreConnexion = function(){
    const r = avant.apply(this, arguments);
    ajouterBloc();
    return r;
  };
  ajouterBloc();                       // la page a pu être dessinée avant ce module (réponse rapide du serveur)
  document.addEventListener("submit", async ev => {
    const f = ev.target.closest && ev.target.closest("form[data-cpt-suppr]"); if (!f) return;
    ev.preventDefault(); ev.stopPropagation();
    if (!confirm("Supprimer définitivement ton compte ? Tu ne pourras plus te connecter avec cet identifiant.")) return;
    const b = f.querySelector("button"); b.disabled = true;
    try {
      // le serveur retire lui-même les téléphones reliés au compte (et seulement si le mot de passe est bon)
      const r = await fetch(api() + "/auth?action=supprimer_moi", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mdp: f.mdp.value }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok){ dire(d.erreur || "Suppression impossible pour le moment.", true); b.disabled = false; return; }
      oublierLiaison();
      try { localStorage.removeItem("asfp-cle"); } catch(e){}
      alert("Ton compte est supprimé.");
      location.hash = "#accueil"; location.reload();
    } catch(e){ dire("Pas de connexion : réessaie dans un instant.", true); b.disabled = false; }
  }, true);

  /* ---------- appli iPhone : réglages des notifications, fiche d'un match (calendrier, partage) ---------- */
  if (window.ASFApp && typeof window.ASFApp.appeler === "function"){
    // « Activer » sur le site : le choix « Désactiver » fait avant est oublié (le téléphone peut de nouveau être relié)
    document.addEventListener("click", ev => {
      if (ev.target.closest && ev.target.closest('[data-a="notif-on"]')) { try { localStorage.removeItem("asf-app-push-coupe"); } catch(e){} }
    }, true);
    // les conseils « installe le site sur l'écran d'accueil » n'ont pas de sens dans l'appli
    const conseil = /Sur iPhone : installe d'abord le site[^.]*\.(?: et ouvre-le depuis l'icône\.)?/;
    const nettoyer = racine => {
      const it = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
      for (let n = it.nextNode(); n; n = it.nextNode())
        if (conseil.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(conseil, "Dans l'appli : touche Plus, puis Notifications (ou Réglages de l'iPhone › ASF Pierrelatte › Notifications), puis réessaie.");
    };
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) nettoyer(n); else if (n.nodeType === 3 && conseil.test(n.nodeValue)) nettoyer(n.parentNode); })))
      .observe(document.documentElement, { childList: true, subtree: true });

    // fiche d'un match à venir : « Ajouter à mon calendrier » (fiche du calendrier de l'iPhone) et « Partager »
    const matchDe = id => (S.matchs || []).find(x => x.id === id) || (S.matchsAnimation || []).find(x => x.id === id);
    const hFr2 = h => /^\d{1,2}:\d{2}/.test(h || "") ? String(h).slice(0, 5).replace(":", "h") : "";
    const lieuDe = m => { try { return m.adresse || (typeof lieuMatch === "function" ? lieuMatch(m) : "") || ""; } catch(e){ return m.adresse || ""; } };
    const titreDe = m => /^pl-/.test(m.id || "") ? `${m.equipe || "Foot animation"} · ${m.comp || "Plateau"}` : `${m.equipe || "ASF"} – ${m.adv || ""}`;
    const avantFiche = window.ouvrirFiche;
    if (typeof avantFiche === "function"){
      window.ouvrirFiche = function(id){
        const r = avantFiche.apply(this, arguments);
        try {
          const m = matchDe(id), d = document.getElementById("fiche-match");
          const auj = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
          const gps = d && d.querySelector(".fm-gps");
          if (m && gps && m.date && m.date >= auj && !d.querySelector(".fm-appli")){
            gps.insertAdjacentHTML("afterend", `<div class="fm-appli btns" style="justify-content:center;margin-top:10px">
              <button type="button" class="btn bleu petit" data-app-cal="${String(id).replace(/"/g, "")}">📅 Ajouter à mon calendrier</button>
              <button type="button" class="btn contour petit" data-app-partage="${String(id).replace(/"/g, "")}">Partager</button></div>`);
          }
        } catch(e){}
        return r;
      };
    }
    document.addEventListener("click", ev => {
      const cal = ev.target.closest && ev.target.closest("[data-app-cal]");
      const par = ev.target.closest && ev.target.closest("[data-app-partage]");
      if (!cal && !par) return;
      ev.preventDefault();
      const m = matchDe((cal || par).dataset.appCal || (cal || par).dataset.appPartage); if (!m) return;
      const lieu = lieuDe(m), heure = hFr2(m.heure);
      if (cal){
        window.ASFApp.appeler("calendrier", { titre: titreDe(m), debut: m.date + (/^\d{1,2}:\d{2}/.test(m.heure || "") ? "T" + String(m.heure).slice(0, 5).padStart(5, "0") : ""),
          lieu, notes: [m.comp, m.dom === false ? "À l'extérieur" : m.dom ? "À domicile" : ""].filter(Boolean).join(" · "), url: "/#calendrier" }).catch(() => {});
      } else {
        const quand = typeof dateLongue === "function" ? dateLongue(m.date) : m.date;
        window.ASFApp.appeler("partager", { texte: `⚽ ${titreDe(m)}\n📅 ${quand}${heure ? " à " + heure : ""}${lieu ? "\n📍 " + lieu : ""}\nAllez Pierrelatte 💙🤍`, url: "https://asf-pierrelatte.fr/#calendrier" }).catch(() => {});
      }
    }, true);
  }

  /* ---------- appli iPhone : rester connecté ---------- */
  if (window.ASFApp || document.documentElement.classList.contains("app-ios")){
    const cocher = () => document.querySelectorAll('input[name="rester"]:not([data-appli-vu])').forEach(c => { c.dataset.appliVu = "1"; c.checked = true; });
    new MutationObserver(cocher).observe(document.documentElement, { childList: true, subtree: true });
    cocher();
  }

  /* ---------- appli iPhone : les prochains matchs gardés sur le téléphone (écran « pas de connexion ») ---------- */
  if (window.ASFApp && typeof window.ASFApp.appeler === "function"){
    let envoye = "";
    const garder = () => {
      try {
        if (!Array.isArray(S.matchs) || !S.matchs.length) return;
        const auj = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });         // AAAA-MM-JJ, heure de Paris
        const l = S.matchs.filter(m => m && typeof m.date === "string" && m.date >= auj && m.adv)
          .sort((a, b) => (a.date + (a.heure || "")).localeCompare(b.date + (b.heure || ""))).slice(0, 30)
          .map(m => ({ date: m.date, heure: m.heure || "", equipe: m.equipe || "", adv: m.adv || "", dom: m.dom !== false, comp: m.comp || "", lieu: m.adresse || "" }));
        const j = JSON.stringify(l);
        if (j === envoye) return;
        envoye = j;
        window.ASFApp.appeler("cache-matchs", { matchs: l }).catch(() => {});
      } catch(e){}
    };
    setTimeout(garder, 4000);
    setInterval(garder, 30000);
  }

  const css = document.createElement("style");
  css.id = "compte-appli-css";
  css.textContent = `.cx-suppr summary{color:#F2A3A3}.cx-suppr .cx-note a{color:inherit}`;
  document.head.appendChild(css);
})();
