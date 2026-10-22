import UIKit

/// Le panneau « Plus » : les autres pages du club, les notifications, la confidentialité, le compte.
final class PlusVC: UITableViewController {

    private struct Ligne { let titre: String; let symbole: String; let action: Action }
    private enum Action { case page(String), notifications, partager }

    private let sections: [(String, [Ligne])] = [
        ("Le club", [
            Ligne(titre: "Classement", symbole: "list.number", action: .page("classement")),
            Ligne(titre: "Compos", symbole: "sportscourt", action: .page("compos")),
            Ligne(titre: "Tournois", symbole: "trophy", action: .page("tournois")),
            Ligne(titre: "Photos", symbole: "photo.on.rectangle", action: .page("photos")),
            Ligne(titre: "Le club", symbole: "shield.lefthalf.filled", action: .page("club")),
            Ligne(titre: "Équipes", symbole: "person.3", action: .page("equipes")),
            Ligne(titre: "Inscriptions", symbole: "square.and.pencil", action: .page("inscriptions")),
            Ligne(titre: "Partenaires", symbole: "hand.thumbsup", action: .page("partenaires")),
            Ligne(titre: "Contact", symbole: "envelope", action: .page("contact")),
        ]),
        ("L'appli", [
            Ligne(titre: "Notifications", symbole: "bell.badge", action: .notifications),
            Ligne(titre: "Partager le site du club", symbole: "square.and.arrow.up", action: .partager),
            Ligne(titre: "Mon compte", symbole: "person.crop.circle", action: .page("connexion")),
            Ligne(titre: "Confidentialité", symbole: "hand.raised", action: .page("confidentialite")),
        ]),
    ]

    private var etatNotifs = "…"
    private weak var web: WebViewController?

    init(web: WebViewController) {
        self.web = web
        super.init(style: .insetGrouped)
        title = "Plus"
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non utilisé") }

    override func viewDidLoad() {
        super.viewDidLoad()
        tableView.backgroundColor = Couleurs.fond
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "c")
        navigationItem.rightBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { [weak self] _ in self?.dismiss(animated: true) })
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        majNotifications()
    }

    private func majNotifications() {
        Notifications.shared.etat { [weak self] e, _ in
            self?.etatNotifs = e == "accorde" ? "Activées" : e == "refuse" ? "Coupées" : "À activer"
            self?.tableView.reloadData()
        }
    }

    override func numberOfSections(in tableView: UITableView) -> Int { sections.count }
    override func tableView(_ tableView: UITableView, numberOfRowsInSection s: Int) -> Int { sections[s].1.count }
    override func tableView(_ tableView: UITableView, titleForHeaderInSection s: Int) -> String? { sections[s].0 }
    override func tableView(_ tableView: UITableView, titleForFooterInSection s: Int) -> String? {
        s == sections.count - 1 ? "ASF Pierrelatte · version \(Appli.version) (\(Appli.build))\nAtom'Sports Football Pierrelatte · depuis 1923" : nil
    }

    override func tableView(_ tableView: UITableView, cellForRowAt i: IndexPath) -> UITableViewCell {
        let l = sections[i.section].1[i.row]
        let c = UITableViewCell(style: .value1, reuseIdentifier: "c")
        var conf = c.defaultContentConfiguration()
        conf.text = l.titre
        conf.image = UIImage(systemName: l.symbole)
        conf.imageProperties.tintColor = Couleurs.or
        if case .notifications = l.action { conf.secondaryText = etatNotifs }
        c.contentConfiguration = conf
        c.accessoryType = .disclosureIndicator
        return c
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt i: IndexPath) {
        tableView.deselectRow(at: i, animated: true)
        switch sections[i.section].1[i.row].action {
        case .page(let p):
            dismiss(animated: true) { [weak web] in web?.allerPage(p) }
        case .partager:
            let feuille = UIActivityViewController(activityItems: ["Le site et l'appli du club : matchs, résultats, compos et convocations.", Appli.site], applicationActivities: nil)
            feuille.popoverPresentationController?.sourceView = tableView.cellForRow(at: i)
            present(feuille, animated: true)
        case .notifications:
            reglerNotifications()
        }
    }

    /// réglage natif : demander l'autorisation, ou ouvrir les Réglages d'iOS si elle a été refusée
    private func reglerNotifications() {
        Notifications.shared.etat { [weak self] e, _ in
            guard let self else { return }
            switch e {
            case "a-demander":
                Notifications.shared.demander { _, _ in
                    self.majNotifications()
                    self.web?.notificationsChangees()
                }
            default:
                let a = UIAlertController(title: "Notifications",
                    message: e == "accorde"
                        ? "Elles sont activées : convocations, compos, messages et infos du club arrivent sur ce téléphone quand tu es connecté à ton compte. Pour les couper, ouvre les Réglages de l'iPhone."
                        : "Elles sont coupées. Pour recevoir les convocations et les messages du club, autorise-les dans les Réglages de l'iPhone.",
                    preferredStyle: .alert)
                a.addAction(UIAlertAction(title: "Ouvrir les Réglages", style: .default) { _ in
                    if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
                })
                a.addAction(UIAlertAction(title: "OK", style: .cancel))
                self.present(a, animated: true)
            }
        }
    }
}
