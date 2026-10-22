import UIKit

/// Écran natif quand le site ne répond pas : pas de réseau, ou serveur injoignable. Il se recharge seul quand le réseau revient,
/// et montre les prochains matchs gardés sur le téléphone (envoyés par le site à chaque visite : action « cache-matchs »).
final class HorsLigneVue: UIView {
    var surReessayer: (() -> Void)?
    private let titre = UILabel()
    private let texte = UILabel()
    private let matchs = UIStackView()
    private static let cle = "asf.prochains-matchs"
    private static let cleDate = "asf.prochains-matchs-date"

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = Couleurs.fond

        let blason = UIImageView(image: UIImage(named: "Lancement"))
        blason.contentMode = .scaleAspectFit
        blason.translatesAutoresizingMaskIntoConstraints = false
        blason.heightAnchor.constraint(equalToConstant: 120).isActive = true
        blason.widthAnchor.constraint(equalToConstant: 120).isActive = true

        titre.font = .systemFont(ofSize: 24, weight: .heavy)
        titre.textColor = .white
        titre.textAlignment = .center
        titre.numberOfLines = 0
        titre.adjustsFontForContentSizeCategory = true

        texte.font = .preferredFont(forTextStyle: .body)
        texte.textColor = Couleurs.texteDoux
        texte.textAlignment = .center
        texte.numberOfLines = 0
        texte.adjustsFontForContentSizeCategory = true

        var conf = UIButton.Configuration.filled()
        conf.title = "Réessayer"
        conf.baseBackgroundColor = Couleurs.or
        conf.baseForegroundColor = Couleurs.fond
        conf.cornerStyle = .capsule
        conf.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 28, bottom: 12, trailing: 28)
        let bouton = UIButton(configuration: conf, primaryAction: UIAction { [weak self] _ in self?.surReessayer?() })

        matchs.axis = .vertical
        matchs.spacing = 8
        matchs.alignment = .fill

        let pile = UIStackView(arrangedSubviews: [blason, titre, texte, bouton, matchs])
        pile.axis = .vertical
        pile.alignment = .center
        pile.spacing = 16
        pile.setCustomSpacing(24, after: texte)
        pile.setCustomSpacing(32, after: bouton)
        pile.translatesAutoresizingMaskIntoConstraints = false

        let defile = UIScrollView()
        defile.alwaysBounceVertical = true
        defile.translatesAutoresizingMaskIntoConstraints = false
        addSubview(defile)
        defile.addSubview(pile)
        NSLayoutConstraint.activate([
            defile.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
            defile.bottomAnchor.constraint(equalTo: bottomAnchor),
            defile.leadingAnchor.constraint(equalTo: leadingAnchor),
            defile.trailingAnchor.constraint(equalTo: trailingAnchor),
            pile.topAnchor.constraint(equalTo: defile.contentLayoutGuide.topAnchor, constant: 48),
            pile.bottomAnchor.constraint(equalTo: defile.contentLayoutGuide.bottomAnchor, constant: -32),
            pile.leadingAnchor.constraint(equalTo: defile.frameLayoutGuide.leadingAnchor, constant: 24),
            pile.trailingAnchor.constraint(equalTo: defile.frameLayoutGuide.trailingAnchor, constant: -24),
            matchs.widthAnchor.constraint(equalTo: pile.widthAnchor),
        ])
        isHidden = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non utilisé") }

    func montrer(reseau: Bool) {
        titre.text = reseau ? "Pas de connexion internet" : "Le site du club ne répond pas"
        texte.text = reseau
            ? "L'appli du club a besoin d'internet pour les compos, les convocations et les messages. Elle se recharge toute seule dès que le réseau revient."
            : "Réessaie dans un instant. Si ça dure, le site asf-pierrelatte.fr est peut-être en maintenance."
        remplirMatchs()
        isHidden = false
    }

    // MARK: les prochains matchs gardés sur le téléphone

    /// appelé par le pont : [{ date: "2026-10-24", heure: "15:00", equipe, adv, dom, comp, lieu }]
    static func garder(_ liste: [[String: Any]]) {
        let propre: [[String: String]] = liste.prefix(30).map { m in
            var r: [String: String] = [:]
            for k in ["date", "heure", "equipe", "adv", "comp", "lieu"] { if let v = m[k] { r[k] = String(describing: v).prefix(120).description } }
            if let dom = m["dom"] as? Bool { r["dom"] = dom ? "1" : "0" }
            return r
        }
        UserDefaults.standard.set(propre, forKey: cle)
        UserDefaults.standard.set(Date(), forKey: cleDate)
    }

    private func remplirMatchs() {
        matchs.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let aujourdhui = HorsLigneVue.jour.string(from: Date())
        let liste = (UserDefaults.standard.array(forKey: HorsLigneVue.cle) as? [[String: String]] ?? [])
            .filter { ($0["date"] ?? "") >= aujourdhui }
            .prefix(8)
        guard !liste.isEmpty else { return }
        let entete = UILabel()
        entete.text = "PROCHAINS MATCHS"
        entete.font = .systemFont(ofSize: 13, weight: .heavy)
        entete.textColor = Couleurs.or
        matchs.addArrangedSubview(entete)
        for m in liste { matchs.addArrangedSubview(ligne(m)) }
        if let d = UserDefaults.standard.object(forKey: HorsLigneVue.cleDate) as? Date {
            let note = UILabel()
            let f = DateFormatter()
            f.locale = Locale(identifier: "fr_FR")
            f.dateFormat = "d MMMM 'à' HH'h'mm"
            note.text = "Enregistrés sur ce téléphone le \(f.string(from: d)). Un horaire a pu changer depuis."
            note.font = .preferredFont(forTextStyle: .footnote)
            note.textColor = Couleurs.texteDoux
            note.numberOfLines = 0
            matchs.addArrangedSubview(note)
        }
    }

    private static let jour: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Paris")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private func ligne(_ m: [String: String]) -> UIView {
        let carte = UIView()
        carte.backgroundColor = UIColor.white.withAlphaComponent(0.06)
        carte.layer.cornerRadius = 12
        let haut = UILabel(), bas = UILabel()
        var quand = m["date"] ?? ""
        if let d = HorsLigneVue.jour.date(from: quand) {
            let f = DateFormatter()
            f.locale = Locale(identifier: "fr_FR")
            f.timeZone = TimeZone(identifier: "Europe/Paris")
            f.dateFormat = "EEEE d MMMM"
            quand = f.string(from: d).capitalized(with: Locale(identifier: "fr_FR"))
        }
        if let h = m["heure"], !h.isEmpty { quand += " · " + h.replacingOccurrences(of: ":", with: "h") }
        haut.text = quand
        haut.font = .systemFont(ofSize: 15, weight: .bold)
        haut.textColor = .white
        let ou = m["dom"] == "1" ? "à domicile" : (m["dom"] == "0" ? "à l'extérieur" : "")
        bas.text = [m["equipe"], m["adv"].map { "contre " + $0 }, ou.isEmpty ? nil : ou].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        bas.font = .preferredFont(forTextStyle: .subheadline)
        bas.textColor = Couleurs.texteDoux
        bas.numberOfLines = 0
        let pile = UIStackView(arrangedSubviews: [haut, bas])
        pile.axis = .vertical
        pile.spacing = 2
        pile.translatesAutoresizingMaskIntoConstraints = false
        carte.addSubview(pile)
        NSLayoutConstraint.activate([
            pile.topAnchor.constraint(equalTo: carte.topAnchor, constant: 10),
            pile.bottomAnchor.constraint(equalTo: carte.bottomAnchor, constant: -10),
            pile.leadingAnchor.constraint(equalTo: carte.leadingAnchor, constant: 14),
            pile.trailingAnchor.constraint(equalTo: carte.trailingAnchor, constant: -14),
        ])
        return carte
    }
}
