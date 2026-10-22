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
          <p class="cx-note">Ton compte est supprimé tout de suite : identifiant, mot de passe, connexions et téléphones reliés aux notifications.
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
      await delierAppareil();                                           // tant que la connexion est encore valable
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

  /* ---------- appli iPhone : rester connecté ---------- */
  if (window.ASFApp || document.documentElement.classList.contains("app-ios")){
    const cocher = () => document.querySelectorAll('input[name="rester"]:not([data-appli-vu])').forEach(c => { c.dataset.appliVu = "1"; c.checked = true; });
    new MutationObserver(cocher).observe(document.documentElement, { childList: true, subtree: true });
    cocher();
  }

  const css = document.createElement("style");
  css.id = "compte-appli-css";
  css.textContent = `.cx-suppr summary{color:#F2A3A3}.cx-suppr .cx-note a{color:inherit}`;
  document.head.appendChild(css);
})();
