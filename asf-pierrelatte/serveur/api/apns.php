<?php
// Notifications de l'appli iPhone (APNs, le service de notifications d'Apple).
// Un iPhone est enregistré comme les autres appareils dans site/abonnes, avec un « endpoint » de la forme apns:<jeton>
// (POST /api/push { subscription: { endpoint: "apns:…" } }, envoyé par la page du site dans l'appli : module ios-app.js).
// envoyer_notification() (push-lib.php) passe ici pour ces appareils : convocations, messages, annonces… tout suit.
//
// Réglages, dans ce dossier api/ :
//   apns.p8             la clé APNs téléchargée sur developer.apple.com (Keys) ; jamais servie (.htaccess)
//   apns-reglages.php   define('APNS_CLE_ID', '…'); define('APNS_EQUIPE_ID', '…');  (ce ne sont pas des secrets)
// Sans ces fichiers, les iPhone sont simplement ignorés (le Web Push continue de marcher).

if (is_file(__DIR__ . '/apns-reglages.php')) require_once __DIR__ . '/apns-reglages.php';
if (!defined('APNS_CLE_ID'))    define('APNS_CLE_ID', '');
if (!defined('APNS_EQUIPE_ID')) define('APNS_EQUIPE_ID', '');
if (!defined('APNS_SUJET'))     define('APNS_SUJET', 'fr.asfpierrelatte.app');         // identifiant de l'appli (Bundle ID)
if (!defined('APNS_HOTE'))      define('APNS_HOTE', 'https://api.push.apple.com');      // TestFlight et App Store : production

if (!function_exists('b64u')) {
    function b64u(string $d): string { return rtrim(strtr(base64_encode($d), '+/', '-_'), '='); }
}

/* signature ECDSA DER (openssl) → r||s de 64 octets (format JWT ES256) */
function apns_der_vers_brut(string $der): ?string {
    $lire_long = function (string $d, int &$p): int {
        $l = ord($d[$p++]);
        if ($l & 0x80) { $n = $l & 0x7f; $l = 0; for ($i = 0; $i < $n; $i++) $l = ($l << 8) | ord($d[$p++]); }
        return $l;
    };
    $p = 0;
    if (strlen($der) < 8 || ord($der[$p++]) !== 0x30) return null;
    $lire_long($der, $p);
    $parties = [];
    for ($k = 0; $k < 2; $k++) {
        if (ord($der[$p++]) !== 0x02) return null;
        $l = $lire_long($der, $p);
        $v = ltrim(substr($der, $p, $l), "\x00");
        $p += $l;
        if (strlen($v) > 32) return null;
        $parties[] = str_pad($v, 32, "\x00", STR_PAD_LEFT);
    }
    return $parties[0] . $parties[1];
}

/* jeton d'authentification auprès d'Apple : refait au plus toutes les 40 minutes (Apple refuse s'il change trop souvent) */
function apns_jeton(): ?string {
    $cache = sys_get_temp_dir() . '/asfp-apns-' . md5(APNS_CLE_ID . APNS_EQUIPE_ID) . '.jwt';
    if (is_file($cache) && time() - filemtime($cache) < 2400) { $j = trim((string) @file_get_contents($cache)); if ($j !== '') return $j; }
    $f = __DIR__ . '/apns.p8';
    if (APNS_CLE_ID === '' || APNS_EQUIPE_ID === '' || !is_file($f)) return null;
    $cle = openssl_pkey_get_private((string) file_get_contents($f));
    if (!$cle) return null;
    $entete = b64u(json_encode(['alg' => 'ES256', 'kid' => APNS_CLE_ID]));
    $corps = b64u(json_encode(['iss' => APNS_EQUIPE_ID, 'iat' => time()]));
    if (!openssl_sign("$entete.$corps", $der, $cle, OPENSSL_ALGO_SHA256)) return null;
    $sig = apns_der_vers_brut($der);
    if ($sig === null) return null;
    $jeton = "$entete.$corps." . b64u($sig);
    @file_put_contents($cache, $jeton, LOCK_EX);
    return $jeton;
}

function apns_pret(): bool { return APNS_CLE_ID !== '' && APNS_EQUIPE_ID !== '' && is_file(__DIR__ . '/apns.p8'); }

/* envoie à un iPhone ; même contrat que envoyer_notification() : false = appareil à oublier (jeton périmé) */
function apns_envoyer(array $abo, array &$journal, ?array $message): bool {
    $jetonAppareil = strtolower(preg_replace('/[^0-9a-f]/i', '', substr((string) ($abo['endpoint'] ?? ''), 5)));
    if ($jetonAppareil === '' || strlen($jetonAppareil) < 32) return false;
    if (!apns_pret()) { $journal[] = ['service' => 'apple', 'code' => 0, 'detail' => 'APNs pas encore réglé (apns.p8 / apns-reglages.php)']; return true; }
    $jwt = apns_jeton();
    if ($jwt === null) { $journal[] = ['service' => 'apple', 'code' => 0, 'detail' => 'clé APNs illisible']; return true; }
    $m = $message ?? ['titre' => 'ASF Pierrelatte', 'texte' => 'Nouveauté sur le site', 'lien' => '/'];
    $titre = trim((string) ($m['titre'] ?? '')) ?: 'ASF Pierrelatte';
    $texte = trim((string) ($m['texte'] ?? ''));
    $corps = json_encode([
        'aps' => ['alert' => ['title' => mb_substr($titre, 0, 120), 'body' => mb_substr($texte, 0, 900)], 'sound' => 'default', 'thread-id' => !empty($m['perso']) ? 'perso' : 'club'],
        'url' => (string) ($m['lien'] ?? '/'),
    ], JSON_UNESCAPED_UNICODE);
    if (!defined('CURL_HTTP_VERSION_2_0')) { $journal[] = ['service' => 'apple', 'code' => 0, 'detail' => 'curl sans HTTP/2 sur ce serveur']; return true; }
    $c = curl_init(APNS_HOTE . '/3/device/' . $jetonAppareil);
    curl_setopt_array($c, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_2_0,
        CURLOPT_POSTFIELDS => $corps,
        CURLOPT_HTTPHEADER => [
            'authorization: bearer ' . $jwt,
            'apns-topic: ' . APNS_SUJET,
            'apns-push-type: alert',
            'apns-priority: 10',
            'apns-expiration: ' . (time() + 86400),
            'content-type: application/json',
        ],
    ]);
    $rep = (string) curl_exec($c);
    $code = (int) curl_getinfo($c, CURLINFO_HTTP_CODE);
    $err = curl_error($c);
    curl_close($c);
    $raison = (string) (json_decode($rep, true)['reason'] ?? '');
    $journal[] = ['service' => 'apple', 'code' => $code, 'detail' => $code >= 400 || $code === 0 ? mb_substr($raison ?: $err, 0, 160) : ''];
    if ($code === 410 || ($code === 400 && in_array($raison, ['BadDeviceToken', 'DeviceTokenNotForTopic'], true))) return false;   // appli supprimée, jeton périmé
    if ($code === 403 && in_array($raison, ['ExpiredProviderToken', 'InvalidProviderToken'], true)) @unlink(sys_get_temp_dir() . '/asfp-apns-' . md5(APNS_CLE_ID . APNS_EQUIPE_ID) . '.jwt');
    return true;                                             // autre souci (réseau, réglage) : on garde l'appareil
}
