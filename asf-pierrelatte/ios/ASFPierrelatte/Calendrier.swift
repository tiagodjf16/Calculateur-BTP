import UIKit
import EventKit
import EventKitUI

/// « Ajouter au calendrier » : la fiche d'événement d'iOS, pré-remplie (le match, l'heure, le stade).
/// Depuis iOS 17 elle s'ouvre sans demander l'accès au calendrier ; sur iOS 16, l'accès est demandé avant.
final class Calendrier: NSObject, EKEventEditViewDelegate {
    static let shared = Calendrier()
    private let magasin = EKEventStore()

    struct Quand { let date: Date; let journee: Bool }

    func ajouter(titre: String, debut: Date, fin: Date?, journee: Bool, lieu: String?, notes: String?, url: URL?,
                 depuis controleur: WebViewController) {
        let ouvrir = { [self] in
            let ev = EKEvent(eventStore: magasin)
            ev.title = titre
            ev.isAllDay = journee
            ev.startDate = debut
            ev.endDate = fin ?? debut.addingTimeInterval(journee ? 86_400 : 2 * 3_600)
            ev.location = lieu
            ev.notes = notes
            ev.url = url
            let fiche = EKEventEditViewController()
            fiche.eventStore = magasin
            fiche.event = ev
            fiche.editViewDelegate = self
            controleur.presenter(fiche)
        }
        if #available(iOS 17.0, *) {
            ouvrir()
        } else {
            magasin.requestAccess(to: .event) { accorde, _ in
                DispatchQueue.main.async {
                    if accorde { ouvrir(); return }
                    let a = UIAlertController(title: "Calendrier", message: "Autorise l'accès au calendrier dans les Réglages de l'iPhone pour y ajouter les matchs.", preferredStyle: .alert)
                    a.addAction(UIAlertAction(title: "OK", style: .default))
                    controleur.presenter(a)
                }
            }
        }
    }

    func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        controller.dismiss(animated: true)
    }

    // MARK: fichier .ics (export du calendrier d'une équipe, d'un match…)

    /// ouvre le premier événement du fichier ; false si le fichier n'est pas lisible (il sera alors partagé tel quel)
    func ouvrirFichier(_ fichier: URL, depuis controleur: WebViewController) -> Bool {
        guard let texte = try? String(contentsOf: fichier, encoding: .utf8) else { return false }
        // lignes repliées : une ligne qui commence par une espace continue la précédente
        var lignes: [String] = []
        for l in texte.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n") {
            if (l.hasPrefix(" ") || l.hasPrefix("\t")), !lignes.isEmpty { lignes[lignes.count - 1] += String(l.dropFirst()) }
            else { lignes.append(l) }
        }
        var dansEvenement = false
        var champs: [String: (params: String, valeur: String)] = [:]
        for l in lignes {
            if l == "BEGIN:VEVENT" { dansEvenement = true; continue }
            if l == "END:VEVENT" { break }
            guard dansEvenement, let deuxPoints = l.firstIndex(of: ":") else { continue }
            let tete = String(l[..<deuxPoints]), valeur = String(l[l.index(after: deuxPoints)...])
            let nom = tete.components(separatedBy: ";")[0].uppercased()
            let params = String(tete.dropFirst(nom.count))
            if champs[nom] == nil { champs[nom] = (params, valeur) }
        }
        guard let d = champs["DTSTART"], let debut = Calendrier.dateIcs(d.valeur, params: d.params) else { return false }
        let fin = champs["DTEND"].flatMap { Calendrier.dateIcs($0.valeur, params: $0.params) }
        let lien = champs["URL"].flatMap { URL(string: $0.valeur) }
        ajouter(titre: Calendrier.texteIcs(champs["SUMMARY"]?.valeur ?? "Match"), debut: debut.date, fin: fin?.date, journee: debut.journee,
                lieu: champs["LOCATION"].map { Calendrier.texteIcs($0.valeur) }, notes: champs["DESCRIPTION"].map { Calendrier.texteIcs($0.valeur) },
                url: lien, depuis: controleur)
        return true
    }

    private static func texteIcs(_ s: String) -> String {
        s.replacingOccurrences(of: "\\n", with: "\n").replacingOccurrences(of: "\\N", with: "\n")
         .replacingOccurrences(of: "\\,", with: ",").replacingOccurrences(of: "\\;", with: ";").replacingOccurrences(of: "\\\\", with: "\\")
    }

    private static let paris = TimeZone(identifier: "Europe/Paris") ?? .current

    private static func format(_ f: String, _ tz: TimeZone) -> DateFormatter {
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = tz
        df.dateFormat = f
        return df
    }

    /// 20261024T090000Z, 20261024T090000 (TZID=… ou heure de Paris), 20261024 (journée entière)
    private static func dateIcs(_ v: String, params: String) -> Quand? {
        let v = v.trimmingCharacters(in: .whitespaces)
        if v.count == 8, let d = format("yyyyMMdd", paris).date(from: v) { return Quand(date: d, journee: true) }
        if v.hasSuffix("Z"), let d = format("yyyyMMdd'T'HHmmss'Z'", TimeZone(identifier: "UTC")!).date(from: v) { return Quand(date: d, journee: false) }
        var tz = paris
        if let r = params.range(of: "TZID=") {
            let nom = params[r.upperBound...].components(separatedBy: ";")[0]
            tz = TimeZone(identifier: nom) ?? paris
        }
        if let d = format("yyyyMMdd'T'HHmmss", tz).date(from: v) { return Quand(date: d, journee: false) }
        return nil
    }

    /// date envoyée par le site : « 2026-10-24 » (journée), « 2026-10-24T09:00 » (heure de Paris) ou ISO 8601 complet
    static func date(_ s: String) -> Quand? {
        if s.count == 10, let d = format("yyyy-MM-dd", paris).date(from: s) { return Quand(date: d, journee: true) }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: s) { return Quand(date: d, journee: false) }
        iso.formatOptions = [.withInternetDateTime]
        if let d = iso.date(from: s) { return Quand(date: d, journee: false) }
        for f in ["yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd HH:mm"] {
            if let d = format(f, paris).date(from: s) { return Quand(date: d, journee: false) }
        }
        return nil
    }
}
