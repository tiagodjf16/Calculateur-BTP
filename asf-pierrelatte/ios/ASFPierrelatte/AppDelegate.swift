import UIKit
import UserNotifications

/// L'appli du club : le site asf-pierrelatte.fr dans une vue web, avec ce que seule une appli iPhone peut faire
/// (notifications Apple, calendrier, partage, écran hors connexion, liens universels).
@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        Notifications.shared.renouvelerSiAccorde()
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    // MARK: notifications Apple (APNs)

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Notifications.shared.jetonRecu(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Notifications.shared.echec(error)
    }

    /// appli ouverte : la notification s'affiche quand même en bandeau
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    /// toucher une notification ouvre la bonne page du site (champ « url » envoyé par le serveur)
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        let lien = (info["url"] as? String) ?? ((info["data"] as? [String: Any])?["url"] as? String)
        DispatchQueue.main.async {
            if let lien, !lien.isEmpty { Navigation.shared.ouvrir(chemin: lien) }
            completionHandler()
        }
    }
}
