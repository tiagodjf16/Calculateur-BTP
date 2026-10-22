import UIKit
import UserNotifications

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        // appli lancée par un lien asf-pierrelatte.fr (lien universel) : la page s'ouvrira directement
        if let activite = connectionOptions.userActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb }),
           let url = activite.webpageURL {
            Navigation.shared.ouvrir(url: url)
        }
        // appli lancée par un raccourci de l'icône (appui long) : Matchs, Espace joueur, Espace club
        if let raccourci = connectionOptions.shortcutItem { ouvrir(raccourci) }
        let fenetre = UIWindow(windowScene: scene)
        fenetre.backgroundColor = Couleurs.fond
        fenetre.tintColor = Couleurs.or
        fenetre.rootViewController = WebViewController()
        fenetre.makeKeyAndVisible()
        window = fenetre
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL {
            Navigation.shared.ouvrir(url: url)
        }
    }

    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        completionHandler(ouvrir(shortcutItem))
    }

    @discardableResult
    private func ouvrir(_ raccourci: UIApplicationShortcutItem) -> Bool {
        guard let chemin = raccourci.userInfo?["url"] as? String else { return false }
        Navigation.shared.ouvrir(chemin: chemin)
        return true
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        UNUserNotificationCenter.current().setBadgeCount(0) { _ in }
        Navigation.shared.controleur?.devientActive()
    }
}
