import UIKit

/// Écran natif quand le site ne répond pas : pas de réseau, ou serveur injoignable. Il se recharge seul quand le réseau revient.
final class HorsLigneVue: UIView {
    var surReessayer: (() -> Void)?
    private let titre = UILabel()
    private let texte = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = Couleurs.fond

        let blason = UIImageView(image: UIImage(named: "Lancement"))
        blason.contentMode = .scaleAspectFit
        blason.translatesAutoresizingMaskIntoConstraints = false
        blason.heightAnchor.constraint(equalToConstant: 150).isActive = true
        blason.widthAnchor.constraint(equalToConstant: 150).isActive = true

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

        let pile = UIStackView(arrangedSubviews: [blason, titre, texte, bouton])
        pile.axis = .vertical
        pile.alignment = .center
        pile.spacing = 16
        pile.setCustomSpacing(28, after: texte)
        pile.translatesAutoresizingMaskIntoConstraints = false
        addSubview(pile)
        NSLayoutConstraint.activate([
            pile.centerYAnchor.constraint(equalTo: safeAreaLayoutGuide.centerYAnchor),
            pile.leadingAnchor.constraint(equalTo: layoutMarginsGuide.leadingAnchor, constant: 12),
            pile.trailingAnchor.constraint(equalTo: layoutMarginsGuide.trailingAnchor, constant: -12),
        ])
        montrer(reseau: true)
        isHidden = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non utilisé") }

    func montrer(reseau: Bool) {
        titre.text = reseau ? "Pas de connexion internet" : "Le site du club ne répond pas"
        texte.text = reseau
            ? "L'appli du club a besoin d'internet pour afficher les matchs, les compos et les messages. Elle se recharge toute seule dès que le réseau revient."
            : "Réessaie dans un instant. Si ça dure, le site asf-pierrelatte.fr est peut-être en maintenance."
        isHidden = false
    }
}
