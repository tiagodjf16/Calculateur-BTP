import UIKit
import WebKit
import Network

/// L'écran unique de l'appli : le site du club, plein écran (le site gère lui-même les zones sûres : viewport-fit=cover).
final class WebViewController: UIViewController {

    private var webView: WKWebView!
    private let contenu = WKUserContentController()
    private let progression = UIProgressView(progressViewStyle: .bar)
    private let horsLigne = HorsLigneVue()
    private let moniteur = NWPathMonitor()
    private var reseauOK = true
    private var observations: [NSKeyValueObservation] = []
    private var telechargements: [WKDownload: URL] = [:]
    private var derniereActivite = Date()
    private(set) var estPret = false

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Couleurs.fond

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()                       // la connexion au compte est gardée d'une fois sur l'autre
        config.applicationNameForUserAgent = "Mobile/15E148 ASFPierrelatteApp/\(Appli.version) (iOS)"
        config.allowsInlineMediaPlayback = true
        config.dataDetectorTypes = []
        contenu.addScriptMessageHandler(PontFaible(self), contentWorld: .page, name: "asf")
        config.userContentController = contenu

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = Couleurs.fond
        webView.scrollView.backgroundColor = Couleurs.fond
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        let tirer = UIRefreshControl()
        tirer.tintColor = Couleurs.or
        tirer.addTarget(self, action: #selector(tirerPourRecharger(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = tirer

        progression.progressTintColor = Couleurs.or
        progression.trackTintColor = .clear
        progression.isHidden = true

        horsLigne.isHidden = true
        horsLigne.surReessayer = { [weak self] in self?.recharger() }

        for v in [webView!, progression, horsLigne] as [UIView] {
            v.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(v)
        }
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progression.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            progression.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progression.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progression.heightAnchor.constraint(equalToConstant: 2),
            horsLigne.topAnchor.constraint(equalTo: view.topAnchor),
            horsLigne.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            horsLigne.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            horsLigne.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        observations.append(webView.observe(\.estimatedProgress, options: [.new]) { [weak self] wv, _ in
            guard let self else { return }
            let p = Float(wv.estimatedProgress)
            self.progression.isHidden = p >= 1
            self.progression.setProgress(p, animated: p > self.progression.progress)
        })

        moniteur.pathUpdateHandler = { [weak self] chemin in
            DispatchQueue.main.async { self?.reseauChange(chemin.status == .satisfied) }
        }
        moniteur.start(queue: DispatchQueue(label: "fr.asfpierrelatte.reseau"))

        Notifications.shared.surNouveauJeton = { [weak self] jeton in self?.prevenirPage(jeton: jeton) }

        Navigation.shared.controleur = self
        Notifications.shared.etat { [weak self] etat, jeton in
            guard let self else { return }
            self.majPont(etat: etat, jeton: jeton)
            self.estPret = true
            // page de départ : lien en attente (notification, lien universel, raccourci), sinon l'accueil
            // (« -page /#calendrier » au lancement : captures d'écran automatiques sur le simulateur)
            let demandee = UserDefaults.standard.string(forKey: "page").flatMap { URL(string: $0, relativeTo: Appli.site)?.absoluteURL }
            self.webView.load(URLRequest(url: Navigation.shared.prendreEnAttente() ?? demandee ?? Appli.site))
        }
    }

    /// l'état des notifications est donné au site (pages suivantes : script injecté ; page ouverte : mise à jour)
    private func majPont(etat: String, jeton: String?) {
        contenu.removeAllUserScripts()
        contenu.addUserScript(WKUserScript(source: Pont.script(etat: etat, jeton: jeton), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let j = jeton.map(Pont.json) ?? "null"
        webView?.evaluateJavaScript("window.ASFApp && ASFApp._maj(\(Pont.json(etat)), \(j))", completionHandler: nil)
    }

    deinit {
        moniteur.cancel()
    }

    // MARK: navigation

    /// ouvre une page du site ; si seule l'ancre change (#joueur, #espace…), pas de rechargement
    func aller(_ url: URL) {
        if let actuelle = webView.url, memeDocument(actuelle, url), let ancre = url.fragment {
            let js = "location.hash = \(Pont.json(ancre))"
            webView.evaluateJavaScript(js, completionHandler: nil)
        } else {
            webView.load(URLRequest(url: url))
        }
    }

    private func memeDocument(_ a: URL, _ b: URL) -> Bool {
        var ca = URLComponents(url: a, resolvingAgainstBaseURL: false)
        var cb = URLComponents(url: b, resolvingAgainstBaseURL: false)
        ca?.fragment = nil
        cb?.fragment = nil
        return ca?.url == cb?.url && ca != nil
    }

    func devientActive() {
        // revenue après longtemps en arrière-plan avec une page en erreur : on réessaie
        if !horsLigne.isHidden && reseauOK { recharger() }
        derniereActivite = Date()
        // notifications autorisées ou coupées dans les Réglages pendant ce temps
        Notifications.shared.etat { [weak self] etat, jeton in self?.majPont(etat: etat, jeton: jeton) }
    }

    private func recharger() {
        horsLigne.isHidden = true
        if webView.url == nil { webView.load(URLRequest(url: Appli.site)) } else { webView.reload() }
    }

    @objc private func tirerPourRecharger(_ r: UIRefreshControl) {
        // une saisie est en cours dans l'espace club : on demande avant de tout perdre
        webView.evaluateJavaScript("!!(window.espaceSaisieEnCours && window.espaceSaisieEnCours())") { [weak self] resultat, _ in
            guard let self else { return }
            guard (resultat as? Bool) == true else { r.endRefreshing(); self.recharger(); return }
            let a = UIAlertController(title: "Recharger la page ?", message: "Ce que tu es en train de saisir n'est pas encore enregistré.", preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in r.endRefreshing() })
            a.addAction(UIAlertAction(title: "Recharger", style: .destructive) { _ in r.endRefreshing(); self.recharger() })
            self.present(a, animated: true)
        }
    }

    private func reseauChange(_ ok: Bool) {
        let revenu = ok && !reseauOK
        reseauOK = ok
        if revenu && !horsLigne.isHidden { recharger() }
    }

    private func afficherHorsLigne(_ erreur: Error) {
        let e = erreur as NSError
        if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return }
        if e.domain == "WebKitErrorDomain" && (e.code == 102 || e.code == 204) { return }   // lien ouvert ailleurs, téléchargement
        let reseau = e.domain == NSURLErrorDomain && [NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost,
            NSURLErrorTimedOut, NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed,
            NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff].contains(e.code)
        horsLigne.montrer(reseau: reseau)
    }

    /// le jeton de notifications a changé : la page (si elle est chargée) le renvoie au serveur
    private func prevenirPage(jeton: String) {
        let js = "window.dispatchEvent(new CustomEvent('asf-app-jeton', { detail: { jeton: \(Pont.json(jeton)) } }))"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: fichiers téléchargés (affiches, exports, fichiers .ics)

    fileprivate func ouvrirFichier(_ url: URL) {
        if url.pathExtension.lowercased() == "ics", Calendrier.shared.ouvrirFichier(url, depuis: self) { return }
        partager([url], source: nil)
    }

    func partager(_ elements: [Any], source: CGRect?, fin: ((Bool) -> Void)? = nil) {
        let feuille = UIActivityViewController(activityItems: elements, applicationActivities: nil)
        feuille.completionWithItemsHandler = { _, fait, _, _ in fin?(fait) }
        if let pop = feuille.popoverPresentationController {
            pop.sourceView = view
            pop.sourceRect = source ?? CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
        }
        presenter(feuille)
    }

    /// fichier envoyé par le site (base64) → fichier temporaire à partager
    private static func fichierTemporaire(_ f: [String: Any]) -> URL? {
        guard let b64 = f["donnees"] as? String, let data = Data(base64Encoded: b64) else { return nil }
        var nom = ((f["nom"] as? String) ?? "fichier").replacingOccurrences(of: "/", with: "-")
        if nom.isEmpty { nom = "fichier" }
        let dossier = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
            let url = dossier.appendingPathComponent(nom)
            try data.write(to: url)
            return url
        } catch { return nil }
    }

    /// la fenêtre d'impression d'iOS (fiches d'accès des joueurs, compos…)
    func imprimer(_ vue: WKWebView) {
        let p = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = vue.title?.isEmpty == false ? vue.title! : "ASF Pierrelatte"
        p.printInfo = info
        p.printFormatter = vue.viewPrintFormatter()
        p.present(animated: true)
    }

    /// présente par-dessus ce qui est déjà affiché (une fenêtre peut déjà être ouverte)
    func presenter(_ vc: UIViewController) {
        var haut: UIViewController = self
        while let p = haut.presentedViewController, !p.isBeingDismissed { haut = p }
        haut.present(vc, animated: true)
    }

    // MARK: pont avec le site

    private static func reponseNotifications(_ etat: String, _ jeton: String?) -> [String: Any] {
        var r: [String: Any] = ["etat": etat, "environnement": "production"]
        if let jeton { r["jeton"] = jeton }
        return r
    }

    func recevoir(_ message: WKScriptMessage) async -> (Any?, String?) {
        guard let d = message.body as? [String: Any], let action = d["action"] as? String else { return (nil, "message illisible") }
        // seules les pages du club parlent à l'appli
        guard message.frameInfo.isMainFrame, Appli.hotes.contains(message.frameInfo.securityOrigin.host.lowercased()) else {
            return (nil, "origine refusée")
        }
        switch action {
        case "infos":
            return (["plateforme": "ios", "version": Appli.version, "build": Appli.build], nil)
        case "notifications-etat":
            let (e, j) = await withCheckedContinuation { (c: CheckedContinuation<(String, String?), Never>) in
                Notifications.shared.etat { e, j in c.resume(returning: (e, j)) }
            }
            return (WebViewController.reponseNotifications(e, j), nil)
        case "notifications-demander":
            let (e, j) = await withCheckedContinuation { (c: CheckedContinuation<(String, String?), Never>) in
                Notifications.shared.demander { e, j in c.resume(returning: (e, j)) }
            }
            majPont(etat: e, jeton: j)
            return (WebViewController.reponseNotifications(e, j), nil)
        case "notifier":
            Notifications.shared.locale(titre: d["titre"] as? String ?? "ASF Pierrelatte", texte: d["texte"] as? String ?? "", url: d["url"] as? String)
            return (true, nil)
        case "imprimer":
            imprimer(message.webView ?? webView)
            return (true, nil)
        case "reglages":
            if let u = URL(string: UIApplication.openSettingsURLString) { _ = await UIApplication.shared.open(u) }
            return (true, nil)
        case "partager":
            var elements: [Any] = []
            for f in (d["fichiers"] as? [[String: Any]] ?? []) {
                if let url = WebViewController.fichierTemporaire(f) { elements.append(url) }
            }
            if let t = d["texte"] as? String, !t.isEmpty { elements.append(t) }
            if let s = d["url"] as? String, !s.isEmpty, let u = URL(string: s, relativeTo: Appli.site)?.absoluteURL { elements.append(u) }
            guard !elements.isEmpty else { return (false, nil) }
            let fait = await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
                partager(elements, source: nil) { ok in c.resume(returning: ok) }
            }
            return (fait, nil)
        case "calendrier":
            guard let titre = d["titre"] as? String, let debut = (d["debut"] as? String).flatMap(Calendrier.date) else { return (false, "date illisible") }
            let fin = (d["fin"] as? String).flatMap(Calendrier.date)
            let lien = (d["url"] as? String).flatMap { URL(string: $0, relativeTo: Appli.site)?.absoluteURL }
            Calendrier.shared.ajouter(titre: titre, debut: debut.date, fin: fin?.date, journee: debut.journee,
                                      lieu: d["lieu"] as? String, notes: d["notes"] as? String, url: lien, depuis: self)
            return (true, nil)
        case "vibrer":
            Vibreur.jouer(d["type"] as? String ?? "")
            return (true, nil)
        case "ouvrir":
            guard let s = d["url"] as? String, let u = URL(string: s) else { return (false, nil) }
            return (await UIApplication.shared.open(u), nil)
        default:
            return (nil, "action inconnue : \(action)")
        }
    }
}

// MARK: - WKNavigationDelegate

extension WebViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload { decisionHandler(.download); return }
        guard let url = navigationAction.request.url, let schema = url.scheme?.lowercased() else { decisionHandler(.allow); return }
        if ["about", "blob", "data", "javascript"].contains(schema) { decisionHandler(.allow); return }
        let cadrePrincipal = navigationAction.targetFrame?.isMainFrame ?? true
        if schema == "http" || schema == "https" {
            // une page du club, ou un cadre intégré (carte, vidéo…) : dans l'appli ; un autre site : dans Safari ou son appli
            if Appli.estInterne(url) || !cadrePrincipal { decisionHandler(.allow); return }
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
            return
        }
        // tel:, mailto:, sms:, waze:, maps:, whatsapp:… : l'appli qui sait les ouvrir
        decisionHandler(.cancel)
        if navigationAction.navigationType == .linkActivated || cadrePrincipal {
            UIApplication.shared.open(url, options: [:]) { ok in
                if !ok && schema == "waze", let web = URL(string: "https://waze.com/ul?" + (url.query ?? "")) {
                    UIApplication.shared.open(web)
                }
            }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let r = navigationResponse.response as? HTTPURLResponse,
           let dispo = r.value(forHTTPHeaderField: "Content-Disposition"), dispo.lowercased().hasPrefix("attachment") {
            decisionHandler(.download)
            return
        }
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        horsLigne.isHidden = true
        webView.scrollView.refreshControl?.endRefreshing()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        webView.scrollView.refreshControl?.endRefreshing()
        afficherHorsLigne(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        webView.scrollView.refreshControl?.endRefreshing()
        afficherHorsLigne(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

// MARK: - WKUIDelegate (fenêtres du site : alertes, confirmations, nouveaux onglets)

extension WebViewController: WKUIDelegate {

    /// lien « nouvel onglet » (target=_blank, window.open) : page du club ici, le reste dehors
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let url = navigationAction.request.url
        let vide = url == nil || url?.absoluteString == "" || url?.absoluteString == "about:blank"
        if vide {
            // page fabriquée par le site (fiches à imprimer…) : une fenêtre de l'appli, avec Imprimer et Fermer
            let fenetre = FenetreVC(configuration: configuration, parent: self)
            presenter(UINavigationController(rootViewController: fenetre))
            return fenetre.webView
        }
        if let url {
            if Appli.estInterne(url) { webView.load(navigationAction.request) }
            else if let s = url.scheme?.lowercased(), !["about", "blob", "data", "javascript"].contains(s) { UIApplication.shared.open(url) }
        }
        return nil
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView !== self.webView { presentedViewController?.dismiss(animated: true) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard viewIfLoaded?.window != nil else { completionHandler(); return }
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        presenter(a)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard viewIfLoaded?.window != nil else { completionHandler(false); return }
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        presenter(a)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        guard viewIfLoaded?.window != nil else { completionHandler(nil); return }
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { $0.text = defaultText }
        a.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text ?? "") })
        presenter(a)
    }
}

// MARK: - WKDownloadDelegate

extension WebViewController: WKDownloadDelegate {

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let dossier = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
        let nom = suggestedFilename.isEmpty ? "fichier" : suggestedFilename.replacingOccurrences(of: "/", with: "-")
        let destination = dossier.appendingPathComponent(nom)
        telechargements[download] = destination
        completionHandler(destination)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let url = telechargements.removeValue(forKey: download) else { return }
        ouvrirFichier(url)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        telechargements.removeValue(forKey: download)
        let a = UIAlertController(title: "Téléchargement impossible", message: error.localizedDescription, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default))
        presenter(a)
    }
}
