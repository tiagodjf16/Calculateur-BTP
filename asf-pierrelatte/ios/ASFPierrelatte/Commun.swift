import UIKit

enum Couleurs {
    /// bleu nuit du club (manifest.json : background_color et theme_color)
    static let fond = UIColor(red: 0x0F / 255, green: 0x22 / 255, blue: 0x57 / 255, alpha: 1)
    /// or des affiches du club
    static let or = UIColor(red: 0xE3 / 255, green: 0xB6 / 255, blue: 0x4C / 255, alpha: 1)
    static let texteDoux = UIColor(red: 0xC9 / 255, green: 0xD4 / 255, blue: 0xF2 / 255, alpha: 1)
}

enum Appli {
    static let site = URL(string: "https://asf-pierrelatte.fr/")!
    static let hotes: Set<String> = ["asf-pierrelatte.fr", "www.asf-pierrelatte.fr"]
    static var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0" }
    static var build: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1" }

    /// une page du site du club (le reste s'ouvre en dehors de l'appli : Waze, Facebook, téléphone…)
    static func estInterne(_ url: URL) -> Bool {
        guard let s = url.scheme?.lowercased(), s == "https" || s == "http", let h = url.host?.lowercased() else { return false }
        return hotes.contains(h)
    }
}

/// Ouvre une page du site dans l'appli (notification touchée, lien universel), même si la vue web n'est pas encore prête.
final class Navigation {
    static let shared = Navigation()
    weak var controleur: WebViewController?
    private var enAttente: URL?

    func ouvrir(chemin: String) {
        guard let url = URL(string: chemin, relativeTo: Appli.site)?.absoluteURL else { return }
        ouvrir(url: url)
    }

    func ouvrir(url: URL) {
        guard Appli.estInterne(url) else { UIApplication.shared.open(url); return }
        if let c = controleur, c.estPret { c.aller(url) } else { enAttente = url }
    }

    func prendreEnAttente() -> URL? {
        defer { enAttente = nil }
        return enAttente
    }
}

enum Vibreur {
    static func jouer(_ type: String) {
        switch type {
        case "succes": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "erreur": UINotificationFeedbackGenerator().notificationOccurred(.error)
        case "alerte": UINotificationFeedbackGenerator().notificationOccurred(.warning)
        default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }
}
