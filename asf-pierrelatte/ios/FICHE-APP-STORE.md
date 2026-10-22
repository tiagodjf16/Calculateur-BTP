# Fiche App Store de l'appli iPhone « ASF Pierrelatte »

Tout ce qu'il faut recopier dans App Store Connect (appstoreconnect.apple.com › Apps › ASF Pierrelatte).

## Informations de l'appli (App Information)

| Champ | À mettre |
|---|---|
| Nom | `ASF Pierrelatte` |
| Sous-titre | `Matchs, compos et convocations` |
| Catégorie principale | Sports |
| URL de la politique de confidentialité | `https://asf-pierrelatte.fr/confidentialite.html` |
| Classification par âge | voir plus bas |

## Version 1.0 (onglet de la version iOS)

**Texte promotionnel** (170 caractères au plus)

> L'appli officielle de l'Atom'Sports Football Pierrelatte : matchs, résultats, compos, convocations et messages du club, avec les notifications sur ton iPhone.

**Description**

> L'appli officielle de l'Atom'Sports Football Pierrelatte, club de football depuis 1923.
>
> POUR TOUS
> • Le calendrier des matchs de toutes les équipes, les résultats et les classements
> • Les compos publiées par les coachs
> • Ajoute un match à ton calendrier et partage-le en un geste
> • Itinéraire vers le stade avec Waze ou Plans
> • Les prochains matchs restent consultables sans réseau
>
> POUR LES JOUEURS ET LES PARENTS
> • Les convocations du week-end, avec une notification à ton prénom
> • Réponds présent ou absent
> • La messagerie du club avec tes coachs et le groupe de ton équipe
>
> POUR LES COACHS ET LE BUREAU
> • Compos, convocations, entraînements, effectifs, licences
> • Les affiches des matchs prêtes pour Facebook et Instagram
>
> L'espace joueur et l'espace club demandent un compte créé par le club. Tu peux supprimer ton compte à tout moment depuis l'appli (Plus › Mon compte › Supprimer mon compte).

**Mots-clés** (100 octets au plus)

```
foot,football,club,Pierrelatte,ASF,matchs,convocation,compo,résultats,école de foot,Drôme,U13
```

| Champ | À mettre |
|---|---|
| URL d'assistance | `https://asf-pierrelatte.fr/#contact` |
| URL marketing | `https://asf-pierrelatte.fr` |
| Copyright | `2026 Atom'Sports Football Pierrelatte` |
| Captures | au moins une série « iPhone 6,3 pouces » (1206 × 2622) — faites sur l'iPhone avec TestFlight |

## Classification par âge (questionnaire)

Répondre **Non / Aucun** partout, sauf :
- **Messagerie et discussion (Messaging and Chat)** : Oui (messagerie entre membres du club).
- **Contenu créé par les utilisateurs** : Oui.
- **Accès web sans restriction (Unrestricted Web Access)** : **Non** (l'appli n'affiche que le site du club ; les autres liens s'ouvrent dans Safari).
- Ne pas cocher « Made for Kids ».

## Confidentialité de l'appli (App Privacy)

« Collectez-vous des données ? » : **Oui**. Pour chaque type ci-dessous : *liées à l'identité de l'utilisateur*, *pas de pistage*, finalité **Fonctionnalité de l'app** (App Functionality).

| Catégorie Apple | Types |
|---|---|
| Coordonnées (Contact Info) | Nom, Adresse e-mail, Numéro de téléphone |
| Contenu de l'utilisateur (User Content) | E-mails ou messages texte, Photos ou vidéos, Autre contenu de l'utilisateur |
| Identifiants (Identifiers) | Identifiant de l'utilisateur, Identifiant de l'appareil (jeton des notifications) |

(Si le club recueille des certificats médicaux par l'appli, ajouter aussi « Santé ».)

## Infos pour l'examen (App Review Information)

**Compte de démonstration** : créer un compte joueur réservé à Apple (voir « Compte de démo » ci-dessous). Ne jamais donner le compte du président ou le seul compte du bureau.

**Notes** (en anglais, à coller telles quelles) :

> ASF Pierrelatte is the official app of Atom'Sports Football Pierrelatte, a non-profit French football club (founded 1923). It shows the club's own website (asf-pierrelatte.fr, our content) inside a native app with:
> • a native tab bar (Home, Matches, Results, My space, More) and a native "More" panel (club pages, notification settings, account, privacy);
> • native push notifications (APNs): personal call-ups for the weekend match, club messages, announcements; tapping a notification opens the right screen;
> • "Add to my calendar" (EventKit) and "Share" (share sheet) on every upcoming match (tap a match);
> • home screen quick actions (long-press the icon: Matches, Player space, Club space) and universal links;
> • an offline screen that lists the next matches stored on the device;
> • printing and saving the club's posters to Photos.
> The member areas require an account created by the club (closed community: players, parents, coaches and board). Demo account (player role): see the credentials above.
> Account deletion: More › My account (Mon compte) › Supprimer mon compte (delete my account) — the account is deleted immediately.
> Messaging is limited to club members; players can only write to their coaches, the board and their team group. Every message can be reported (it alerts the board, who moderate within 24 hours) and any member can be blocked (⋯ on a message, or Block in a private conversation).
> Contact: contact@asf-pierrelatte.fr

## Compte de démo (à faire une fois, avant chaque soumission)

1. Espace club › **Effectifs** : ajouter un joueur fictif `DEMO Apple` dans une équipe (par exemple Seniors 2), avec un numéro de licence fictif.
2. Espace club › **Accès et rôles** : créer son compte joueur ; noter l'identifiant et le code provisoire.
3. Se connecter une fois avec ce compte (dans un navigateur privé), choisir un mot de passe, puis se déconnecter.
4. Lui mettre une convocation et un message de coach, pour que l'examinateur voie quelque chose.
5. Dans App Store Connect : identifiant et mot de passe de ce compte dans « Sign-in required ».
6. Si Apple supprime ce compte pendant l'examen (« Supprimer mon compte »), le recréer avant la soumission suivante.
