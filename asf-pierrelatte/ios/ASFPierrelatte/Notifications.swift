import UIKit
import UserNotifications

/// Autorisation des notifications et jeton d'appareil APNs. Le site (module ios-app.js) le demande par le pont
/// et l'enregistre lui-même sur le serveur du club, pour le compte connecté (même cookie de session que le site).
final class Notifications {
    static let shared = Notifications()
    private let cle = "asf.jeton-apns"
    private(set) var jeton: String?
    private var attentes: [(String?) -> Void] = []
    /// appelé quand le jeton change (la page est prévenue et l'enregistre sur le serveur)
    var surNouveauJeton: ((String) -> Void)?

    private init() {
        jeton = UserDefaults.standard.string(forKey: cle)
    }

    /// au lancement : si l'utilisateur a déjà accepté, on redemande le jeton (Apple peut le changer)
    func renouvelerSiAccorde() {
        UNUserNotificationCenter.current().getNotificationSettings { reglages in
            guard Notifications.estAccorde(reglages.authorizationStatus) else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    func jetonRecu(_ donnees: Data) {
        let hex = donnees.map { String(format: "%02x", $0) }.joined()
        let nouveau = hex != jeton
        jeton = hex
        UserDefaults.standard.set(hex, forKey: cle)
        terminer(hex)
        if nouveau { surNouveauJeton?(hex) }
    }

    func echec(_ erreur: Error) {
        terminer(nil)
    }

    private func terminer(_ j: String?) {
        let a = attentes
        attentes = []
        a.forEach { $0(j) }
    }

    /// état pour le site : accorde, refuse, a-demander (+ le jeton s'il est connu)
    func etat(_ fin: @escaping (String, String?) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { reglages in
            let e = Notifications.texte(reglages.authorizationStatus)
            DispatchQueue.main.async { fin(e, e == "accorde" ? self.jeton : nil) }
        }
    }

    /// demande l'autorisation (fenêtre d'iOS la première fois), puis le jeton d'appareil
    func demander(_ fin: @escaping (String, String?) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { accorde, _ in
            DispatchQueue.main.async {
                guard accorde else { fin("refuse", nil); return }
                self.attentes.append { j in fin(j == nil ? "erreur" : "accorde", j) }
                UIApplication.shared.registerForRemoteNotifications()
                // sans réponse d'Apple au bout de 20 s (pas de réseau…) : on rend ce qu'on a
                DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
                    guard let self, !self.attentes.isEmpty else { return }
                    self.terminer(self.jeton)
                }
            }
        }
    }

    /// notification affichée par l'appli elle-même (nouveau message vu par le site pendant qu'il est ouvert)
    func locale(titre: String, texte: String, url: String?) {
        let c = UNMutableNotificationContent()
        c.title = titre
        c.body = texte
        c.sound = .default
        if let url, !url.isEmpty { c.userInfo = ["url": url] }
        let r = UNNotificationRequest(identifier: "asf-locale-" + UUID().uuidString, content: c, trigger: nil)
        UNUserNotificationCenter.current().add(r)
    }

    static func estAccorde(_ s: UNAuthorizationStatus) -> Bool {
        s == .authorized || s == .provisional || s == .ephemeral
    }

    static func texte(_ s: UNAuthorizationStatus) -> String {
        if estAccorde(s) { return "accorde" }
        return s == .denied ? "refuse" : "a-demander"
    }
}
