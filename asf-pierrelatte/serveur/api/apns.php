<?php
// Notifications de l'appli iPhone (APNs), sans bibliothèque : jeton JWT ES256 signé par openssl, envoi en HTTP/2 par curl.
// Un iPhone est enregistré comme les autres appareils dans site/abonnes, avec l'« endpoint » apns:<jeton> (POST /api/push,
// envoyé par la page du site dans l'appli). envoyer_notification() (push-lib.php) passe ici pour ces appareils :
// convocations, messages, annonces… tout suit, sans autre changement.
//
// Réglages (dans ce dossier api/, comme vapid.pem ; .htaccess interdit de les lire depuis le web) :
//   apns.p8             la clé APNs téléchargée sur developer.apple.com (Keys) — ou APNS_CLE_FICHIER dans config.php
//   apns-reglages.php   define('APNS_CLE_ID', '…'); define('APNS_EQUIPE_ID', '…');   (ce ne sont pas des secrets)
// Sans réglages, les iPhone sont simplement ignorés (gardés dans la liste) et le Web Push continue de marcher.

if (is_file(__DIR__ . '/apns-reglages.php')) require_once __DIR__ . '/apns-reglages.php';
if (!defined('APNS_CLE_FICHIER')) define('APNS_CLE_FICHIER', __DIR__ . '/apns.p8');
if (!defined('APNS_SUJET'))       define('APNS_SUJET', 'fr.asfpierrelatte.app');          // identifiant de l'appli (Bundle ID)
if (!defined('APNS_CACHE_JWT'))   define('APNS_CACHE_JWT', __DIR__ . '/apns-jwt.json');
if (!defined('APNS_HOTE'))        define('APNS_HOTE', 'https://api.push.apple.com');       // TestFlight et App Store : production

const APNS_HOTE_PROD = APNS_HOTE;
const APNS_HOTE_TEST = 'https://api.sandbox.push.apple.com';    // builds de développement (Xcode) seulement
const APNS_JWT_DUREE = 2700;                                    // 45 min : Apple refuse un jeton de plus d'1 h, et un renouvellement plus d'1 fois / 20 min

function apns_b64u(string $d): string { return rtrim(strtr(base64_encode($d), '+/', '-_'), '='); }

function apns_configure(): bool {
    return defined('APNS_CLE_ID') && APNS_CLE_ID !== '' && defined('APNS_EQUIPE_ID') && APNS_EQUIPE_ID !== '' && is_file(APNS_CLE_FICHIER);
}

/* longueur DER à la position $p (forme courte < 128, ou longue 0x81 / 0x82) ; avance $p */
function apns_der_longueur(string $der, int &$p): int {
    if ($p >= strlen($der)) throw new RuntimeException('signature DER tronquée');
    $l = ord($der[$p++]);
    if ($l < 0x80) return $l;
    $n = $l & 0x7f;
    if ($n < 1 || $n > 2 || $p + $n > strlen($der)) throw new RuntimeException('signature DER : longueur invalide');
    $l = 0;
    for ($i = 0; $i < $n; $i++) $l = ($l << 8) | ord($der[$p++]);
    return $l;
}

/* openssl_sign renvoie une signature ECDSA en DER : 30 L 02 Lr r 02 Ls s.
   JWS (RFC 7518 §3.4) veut r||s bruts, chacun sur 32 octets exactement (64 octets en tout).
   - r ou s commençant par un bit à 1 est précédé d'un octet 0x00 (signe) : 33 octets → on retire ce 0x00 ;
   - r ou s petit est encodé sur moins de 32 octets : on complète par des 0x00 à gauche. */
function apns_der_vers_brut(string $der, int $taille = 32): string {
    $p = 0;
    if (($der[$p++] ?? '') !== "\x30") throw new RuntimeException('signature DER : SEQUENCE attendue');
    $fin = apns_der_longueur($der, $p);
    $fin += $p;
    if ($fin !== strlen($der)) throw new RuntimeException('signature DER : longueur incohérente');
    $brut = '';
    foreach (['r', 's'] as $nom) {
        if ($p >= $fin || $der[$p++] !== "\x02") throw new RuntimeException("signature DER : INTEGER $nom attendu");
        $l = apns_der_longueur($der, $p);
        if ($l < 1 || $p + $l > $fin) throw new RuntimeException("signature DER : $nom tronqué");
        $v = ltrim(substr($der, $p, $l), "\x00");
        $p += $l;
        if (strlen($v) > $taille) throw new RuntimeException("signature DER : $nom trop long");
        $brut .= str_pad($v, $taille, "\x00", STR_PAD_LEFT);
    }
    if ($p !== $fin) throw new RuntimeException('signature DER : octets en trop');
    return $brut;                                              // 64 octets
}

/* un jeton JWT neuf : en-tête { alg: ES256, kid }, contenu { iss: Team ID, iat } */
function apns_jwt_neuf(): array {
    $pem = @file_get_contents(APNS_CLE_FICHIER);
    if ($pem === false || $pem === '') throw new RuntimeException('clé APNs introuvable (APNS_CLE_FICHIER)');
    $cle = openssl_pkey_get_private($pem);
    if (!$cle) throw new RuntimeException('clé APNs illisible (fichier .p8 abîmé ?)');
    $det = openssl_pkey_get_details($cle);
    if (($det['type'] ?? -1) !== OPENSSL_KEYTYPE_EC || ($det['ec']['curve_name'] ?? '') !== 'prime256v1')
        throw new RuntimeException('la clé APNs doit être une clé EC P-256 (fichier .p8 d\'Apple)');
    $iat = time();
    $entete = apns_b64u(json_encode(['alg' => 'ES256', 'kid' => APNS_CLE_ID]));
    $corps  = apns_b64u(json_encode(['iss' => APNS_EQUIPE_ID, 'iat' => $iat]));
    $der = '';
    if (!openssl_sign("$entete.$corps", $der, $cle, OPENSSL_ALGO_SHA256)) throw new RuntimeException('signature APNs impossible');
    return ['jwt' => "$entete.$corps." . apns_b64u(apns_der_vers_brut($der)), 'iat' => $iat, 'pour' => APNS_CLE_ID . '/' . APNS_EQUIPE_ID];
}

/* le jeton à utiliser : le même pendant 45 min (gardé dans un fichier, verrouillé : deux envois en même temps
   ne fabriquent pas deux jetons). $neuf : Apple a répondu ExpiredProviderToken, on en refait un. */
function apns_jwt(bool $neuf = false): string {
    static $memo = null;
    $t = time();
    $bon = fn($c) => is_array($c) && isset($c['jwt'], $c['iat'], $c['pour']) && $c['pour'] === APNS_CLE_ID . '/' . APNS_EQUIPE_ID
        && (int) $c['iat'] <= $t + 60 && $t - (int) $c['iat'] < APNS_JWT_DUREE;
    if (!$neuf && $bon($memo)) return $memo['jwt'];
    $fichier = defined('APNS_CACHE_JWT') ? APNS_CACHE_JWT : dirname(APNS_CLE_FICHIER) . '/apns-jwt.json';
    $f = @fopen($fichier, 'c+');
    if ($f && flock($f, LOCK_EX)) {
        try {
            $c = json_decode((string) stream_get_contents($f), true);
            // déjà renouvelé par un autre passage pendant qu'on attendait le verrou : on le prend tel quel
            if ($bon($c) && (!$neuf || ($memo && (int) $c['iat'] > (int) $memo['iat']))) { $memo = $c; return $c['jwt']; }
            $memo = apns_jwt_neuf();
            ftruncate($f, 0); rewind($f); fwrite($f, json_encode($memo)); fflush($f);
            return $memo['jwt'];
        } finally { flock($f, LOCK_UN); fclose($f); }
    }
    if ($f) fclose($f);
    $memo = apns_jwt_neuf();                                   // pas de fichier possible : gardé le temps de ce passage
    return $memo['jwt'];
}

/* le contenu de la notification (4 096 octets au plus) ; « url » est lue par l'appli quand on touche la notification
   (AppDelegate.swift : userInfo["url"]) */
function apns_charge(array $message): string {
    $titre = (string) ($message['titre'] ?? 'ASF Pierrelatte');
    $texte = (string) ($message['texte'] ?? '');
    $lien  = (string) ($message['lien'] ?? '/');
    if ($lien === '' || $lien[0] !== '/') $lien = '/';         // toujours une adresse du site
    for ($i = 0; $i < 8; $i++) {
        $aps = ['alert' => ['title' => $titre, 'body' => $texte], 'sound' => 'default'];
        if (!empty($message['tag'])) $aps['thread-id'] = (string) $message['tag'];
        $json = json_encode(['aps' => $aps, 'url' => $lien], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        if (strlen($json) <= 4000) return $json;
        $texte = mb_substr($texte, 0, (int) (mb_strlen($texte) * 0.7)) . '…';
        $titre = mb_substr($titre, 0, 120);
    }
    return json_encode(['aps' => ['alert' => ['title' => mb_substr($titre, 0, 100), 'body' => ''], 'sound' => 'default'], 'url' => '/'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/* envoie à un iPhone. Même contrat que envoyer_notification : true = Apple a accepté ; une ligne est ajoutée au $journal
   (service, code, detail = raison donnée par Apple). Un jeton mort (410, BadDeviceToken, DeviceTokenNotForTopic)
   est noté dans $GLOBALS['push_a_oublier'][endpoint] : push_purger() le retire ensuite de site/abonnes.
   Une panne de notre côté (clé, réseau, 403, 429, 5xx) ne fait JAMAIS oublier l'appareil. */
function envoyer_apns(array $abo, array &$journal, array $message): bool {
    static $ch = null;                                         // une seule connexion HTTP/2 pour tous les envois du passage
    // le jeton : champ « jeton », sinon la fin de l'endpoint « apns:<jeton> » (enregistré par le POST /api/push habituel)
    $jeton = strtolower((string) ($abo['jeton'] ?? substr((string) ($abo['endpoint'] ?? ''), 5)));
    $hote = ($abo['env'] ?? 'production') === 'sandbox' ? APNS_HOTE_TEST : APNS_HOTE_PROD;
    $service = parse_url($hote, PHP_URL_HOST);
    if (!preg_match('/^[0-9a-f]{64,200}$/', $jeton)) {
        $GLOBALS['push_a_oublier'][(string) ($abo['endpoint'] ?? '')] = true;
        $journal[] = ['service' => $service, 'code' => 400, 'chiffre' => true, 'detail' => 'jeton invalide'];
        return false;
    }
    if (!apns_configure()) { $journal[] = ['service' => $service, 'code' => 0, 'chiffre' => true, 'detail' => 'APNs pas encore réglé (apns.p8 et apns-reglages.php)']; return false; }
    if (!defined('CURL_HTTP_VERSION_2TLS') || !(curl_version()['features'] & CURL_VERSION_HTTP2)) {
        $journal[] = ['service' => $service, 'code' => 0, 'chiffre' => true, 'detail' => 'curl sans HTTP/2 sur ce serveur'];
        return false;
    }
    $charge = apns_charge($message);
    if ($ch === null) $ch = curl_init();
    $code = 0; $raison = '';
    for ($essai = 0; $essai < 2; $essai++) {
        try { $jwt = apns_jwt($essai > 0); }
        catch (Throwable $e) { $journal[] = ['service' => $service, 'code' => 0, 'chiffre' => true, 'detail' => $e->getMessage()]; return false; }
        $entetes = [
            'authorization: bearer ' . $jwt,
            'apns-topic: ' . APNS_SUJET,
            'apns-push-type: alert',
            'apns-priority: 10',                                // tout de suite (5 = quand le téléphone le décide)
            'apns-expiration: ' . (time() + 86400),             // gardée 24 h par Apple si le téléphone est éteint (comme le TTL du Web Push)
            'content-type: application/json',
            'expect:',
        ];
        if (!empty($message['tag'])) $entetes[] = 'apns-collapse-id: ' . substr((string) $message['tag'], 0, 64);
        curl_setopt_array($ch, [
            CURLOPT_URL => "$hote/3/device/$jeton",
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_2TLS,     // APNs n'accepte que HTTP/2
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $charge,
            CURLOPT_HTTPHEADER => $entetes,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 12,
        ]);
        $rep = (string) curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        $version = (int) curl_getinfo($ch, CURLINFO_HTTP_VERSION);
        $raison = $code === 200 ? '' : (string) ((json_decode($rep, true) ?: [])['reason'] ?? ($err ?: mb_substr(trim($rep), 0, 120)));
        if ($code !== 0 && $version !== CURL_HTTP_VERSION_2_0) $raison = trim($raison . ' (réponse sans HTTP/2)');
        if (!($code === 403 && $raison === 'ExpiredProviderToken')) break;   // jeton signé trop vieux : un seul nouvel essai
    }
    $journal[] = ['service' => $service, 'code' => $code, 'chiffre' => true, 'detail' => $code === 200 ? '' : $raison];
    if ($code === 410 || ($code === 400 && in_array($raison, ['BadDeviceToken', 'DeviceTokenNotForTopic'], true))) {
        $GLOBALS['push_a_oublier'][(string) ($abo['endpoint'] ?? '')] = true;   // appli supprimée, jeton d'une autre appli ou d'un autre environnement
    }
    return $code === 200;
}

/* retire de site/abonnes les appareils notés morts pendant ce passage (Web Push 404/410 compris si on le souhaite) */
function push_purger(PDO $pdo): int {
    $oublier = $GLOBALS['push_a_oublier'] ?? [];
    $GLOBALS['push_a_oublier'] = [];
    if (!$oublier) return 0;
    $abos = push_lire($pdo, 'site/abonnes') ?: [];
    $reste = array_values(array_filter($abos, fn($a) => empty($oublier[(string) ($a['endpoint'] ?? '')])));
    if (count($reste) !== count($abos)) push_ecrire($pdo, 'site/abonnes', $reste);
    return count($abos) - count($reste);
}
