import Foundation
import WebKit

/// Ce que l'appli ajoute à chaque page du site, avant ses scripts.
/// - window.ASFApp : le pont vers l'appli (ASFApp.appeler("partager", {…}) renvoie une promesse) ;
/// - navigator.standalone = true : le site se sait « installé » et cache ses boutons « Installer l'application » ;
/// - les notifications : les fonctions Web Push qu'utilise déjà le site (Notification, serviceWorker, pushManager)
///   passent par les notifications d'Apple ; l'abonnement envoyé à /api/push a pour adresse « apns:<jeton> » ;
/// - navigator.share (avec fichiers) et window.print : la feuille de partage et l'impression d'iOS.
enum Pont {

    static func script(etat: String, jeton: String?) -> String {
        let e = json(etat), j = jeton.map(json) ?? "null"
        return """
        (function(){
          var h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.asf;
          if (!h || window.ASFApp) return;
          var versWeb = function(e){ return e === "accorde" ? "granted" : e === "refuse" ? "denied" : "default"; };
          var etat = versWeb(\(e)), jeton = \(j);
          var appeler = function(action, d){ var m = {}; for (var k in (d || {})) m[k] = d[k]; m.action = action; return h.postMessage(m); };
          window.ASFApp = { plateforme: "ios", appeler: appeler, _maj: function(e, j){ etat = versWeb(e); if (j) jeton = j; } };
          var definir = function(o, nom, valeur){ try { Object.defineProperty(o, nom, { configurable: true, get: function(){ return valeur; } }); } catch(err){} };

          /* l'appli est installée : pas de bouton « Installer l'application » */
          definir(navigator, "standalone", true);

          /* notifications (Apple) derrière l'API Web Push du site */
          var demander = function(){
            return appeler("notifications-demander").then(function(r){ etat = versWeb(r && r.etat); if (r && r.jeton) jeton = r.jeton; return etat; }, function(){ return etat; });
          };
          function Abonnement(){ this.endpoint = "apns:" + jeton; this.expirationTime = null; this.options = { userVisibleOnly: true }; }
          Abonnement.prototype.getKey = function(){ return null; };
          Abonnement.prototype.toJSON = function(){ return { endpoint: this.endpoint, expirationTime: null, keys: {} }; };
          Abonnement.prototype.unsubscribe = function(){ return Promise.resolve(true); };
          var pushManager = {
            getSubscription: function(){ return Promise.resolve(etat === "granted" && jeton ? new Abonnement() : null); },
            subscribe: function(){ return demander().then(function(e){ if (e !== "granted" || !jeton){ var x = new Error("Notifications refusées"); x.name = "NotAllowedError"; throw x; } return new Abonnement(); }); },
            permissionState: function(){ return Promise.resolve(etat === "default" ? "prompt" : etat); }
          };
          var rien = function(){};
          var inscription = {
            scope: location.origin + "/", active: { state: "activated", postMessage: rien }, installing: null, waiting: null, pushManager: pushManager,
            update: function(){ return Promise.resolve(); }, unregister: function(){ return Promise.resolve(true); },
            showNotification: function(titre, o){ o = o || {}; return appeler("notifier", { titre: String(titre || ""), texte: String(o.body || ""), url: (o.data && (o.data.lien || o.data.url)) || "" }).then(rien, rien); },
            getNotifications: function(){ return Promise.resolve([]); }, addEventListener: rien, removeEventListener: rien
          };
          definir(navigator, "serviceWorker", { controller: null, ready: Promise.resolve(inscription),
            register: function(){ return Promise.resolve(inscription); }, getRegistration: function(){ return Promise.resolve(inscription); },
            getRegistrations: function(){ return Promise.resolve([inscription]); }, addEventListener: rien, removeEventListener: rien, startMessages: rien });
          function Notif(titre, o){ inscription.showNotification(titre, o); this.title = titre; this.body = (o && o.body) || ""; }
          Notif.prototype.close = rien; Notif.prototype.addEventListener = rien;
          Object.defineProperty(Notif, "permission", { get: function(){ return etat; } });
          Notif.requestPermission = function(rappel){ return demander().then(function(e){ if (typeof rappel === "function") rappel(e); return e; }); };
          window.Notification = Notif;
          if (!window.PushManager) window.PushManager = function PushManager(){};

          /* nouveau jeton (appli réinstallée…) : l'appareil est de nouveau relié au compte connecté */
          window.addEventListener("asf-app-jeton", function(ev){
            if (ev.detail && ev.detail.jeton) jeton = ev.detail.jeton;
            try { for (var i = sessionStorage.length - 1; i >= 0; i--){ var k = sessionStorage.key(i); if (k && k.indexOf("asfp-appareil2-") === 0) sessionStorage.removeItem(k); } } catch(err){}
            if (typeof window.lierAppareil === "function") window.lierAppareil(true);
          });

          /* partage (texte, lien, fichiers : affiches, stories…) */
          var abandon = function(){ var x = new Error("Partage annulé"); x.name = "AbortError"; return x; };
          var lireFichier = function(f){ return new Promise(function(ok, ko){ var r = new FileReader(); r.onload = function(){ ok({ nom: f.name || "fichier", type: f.type || "", donnees: String(r.result).split(",")[1] || "" }); }; r.onerror = ko; r.readAsDataURL(f); }); };
          var partager = function(d){
            d = d || {};
            var texte = [d.title, d.text].filter(Boolean).join("\\n");
            var fichiers = d.files && d.files.length ? Promise.all([].slice.call(d.files, 0, 10).map(lireFichier)) : Promise.resolve([]);
            return fichiers.then(function(f){ return appeler("partager", { texte: texte, url: d.url || "", fichiers: f }); })
              .then(function(fait){ if (fait === false) throw abandon(); });
          };
          definir(navigator, "share", partager);
          definir(navigator, "canShare", function(){ return true; });

          /* impression : la fenêtre d'impression d'iOS */
          window.print = function(){ appeler("imprimer").then(rien, rien); };

          var marquer = function(){ if (document.documentElement) document.documentElement.classList.add("app-ios"); };
          marquer(); document.addEventListener("DOMContentLoaded", marquer);
        })();
        """
    }

    /// une chaîne pour JavaScript (guillemets et caractères spéciaux échappés)
    static func json(_ s: String) -> String {
        guard let d = try? JSONSerialization.data(withJSONObject: [s]), let t = String(data: d, encoding: .utf8) else { return "\"\"" }
        return String(t.dropFirst().dropLast())
    }
}

/// le site appelle : await window.webkit.messageHandlers.asf.postMessage({ action: "…", … }) (ou ASFApp.appeler)
final class PontFaible: NSObject, WKScriptMessageHandlerWithReply {
    weak var cible: WebViewController?
    init(_ cible: WebViewController) { self.cible = cible }

    @MainActor
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) async -> (Any?, String?) {
        guard let cible else { return (nil, "appli indisponible") }
        return await cible.recevoir(message)
    }
}
