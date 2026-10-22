import UIKit
import WebKit

/// Fenêtre ouverte par le site avec window.open("") puis document.write (fiches d'accès à imprimer…) :
/// affichée par-dessus l'appli, avec « Imprimer » et « Fermer ».
final class FenetreVC: UIViewController {
    let webView: WKWebView
    private weak var parentWeb: WebViewController?

    init(configuration: WKWebViewConfiguration, parent: WebViewController) {
        webView = WKWebView(frame: .zero, configuration: configuration)
        parentWeb = parent
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non utilisé") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        webView.uiDelegate = parentWeb
        webView.navigationDelegate = parentWeb
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { [weak self] _ in
            self?.dismiss(animated: true)
        })
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Imprimer", image: UIImage(systemName: "printer"), primaryAction: UIAction { [weak self] _ in
            guard let self else { return }
            self.parentWeb?.imprimer(self.webView)
        })
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        title = webView.title
    }
}
