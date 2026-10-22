import UIKit

/// La barre d'onglets de l'appli (pages publiques du site) : Accueil, Matchs, Résultats, Mon espace, Plus.
/// Les espaces joueur et club ont leur propre navigation (barre du joueur, tuiles de l'espace club) : la barre s'efface.
enum Onglet: Int, CaseIterable {
    case accueil, matchs, resultats, espace, plus

    var titre: String {
        switch self {
        case .accueil: return "Accueil"
        case .matchs: return "Matchs"
        case .resultats: return "Résultats"
        case .espace: return "Mon espace"
        case .plus: return "Plus"
        }
    }

    var symbole: String {
        switch self {
        case .accueil: return "house.fill"
        case .matchs: return "calendar"
        case .resultats: return "list.number"
        case .espace: return "person.crop.circle.fill"
        case .plus: return "ellipsis.circle.fill"
        }
    }

    /// l'onglet qui correspond à une page du site (#accueil, #calendrier…)
    static func depuis(page: String) -> Onglet? {
        switch page {
        case "", "accueil": return .accueil
        case "calendrier": return .matchs
        case "resultats", "classement": return .resultats
        case "connexion": return .espace
        default: return nil
        }
    }

    /// pages où la barre s'efface (le site y a sa propre navigation)
    static func sansBarre(_ page: String) -> Bool { ["joueur", "espace", "espaces", "portail"].contains(page) }

    static func barre() -> UITabBar {
        let barre = UITabBar()
        let a = UITabBarAppearance()
        a.configureWithOpaqueBackground()
        a.backgroundColor = Couleurs.fond
        a.shadowColor = UIColor(red: 0x24 / 255, green: 0x3B / 255, blue: 0x7E / 255, alpha: 1)
        for etat in [a.stackedLayoutAppearance, a.inlineLayoutAppearance, a.compactInlineLayoutAppearance] {
            etat.normal.iconColor = Couleurs.texteDoux
            etat.normal.titleTextAttributes = [.foregroundColor: Couleurs.texteDoux]
            etat.selected.iconColor = Couleurs.or
            etat.selected.titleTextAttributes = [.foregroundColor: Couleurs.or]
        }
        barre.standardAppearance = a
        barre.scrollEdgeAppearance = a
        barre.tintColor = Couleurs.or
        barre.items = Onglet.allCases.map { o in
            let item = UITabBarItem(title: o.titre, image: UIImage(systemName: o.symbole), tag: o.rawValue)
            item.accessibilityLabel = o.titre
            return item
        }
        return barre
    }
}
