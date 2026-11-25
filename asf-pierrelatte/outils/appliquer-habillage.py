"""Assemble the app-style (myFFF 2026-like) version of the ASF Pierrelatte site from the original upload.

Usage: python3 build10.py <original.html> <tete.css> <tard.css> <appli.js> <faits.js> <favori-faits.js> <tournoi.js> <output.html> [--test]
  tete.css : replaces the /*HABILLAGE-CSS*/ block of the head stylesheet (public site, first paint)
  tard.css : <style> added at the end of <body>, after every module (member spaces, module overrides)
  appli.js : <script> added at the end of <body> (intro, club tabs, Matchs of the weekend, teams, match events)
  tournoi.js : <script> added after it (tournament pages #tournoi/<id> with team choice and schedule, QR code, poster)
--test : runs offline with the built-in data (API set to "") and skips the intro unless the URL has ?intro.
"""
import datetime
import json
import hashlib
import re
import sys

src, tete_path, tard_path, js_path, faits_path, favori_path, tournoi_path, out = sys.argv[1:9]
test = "--test" in sys.argv
html = open(src, encoding="utf-8").read()
tete = open(tete_path, encoding="utf-8").read().strip()
tard = open(tard_path, encoding="utf-8").read().strip()
appli = open(js_path, encoding="utf-8").read().strip()
faits = open(faits_path, encoding="utf-8").read().strip()
tournoi = open(tournoi_path, encoding="utf-8").read().strip()

# the « Faits de match ASF » bookmark: one line (no // comments allowed), injected as a JS string in the faits module
favori = open(favori_path, encoding="utf-8").read()
favori = re.sub(r"^\s*/\*[\s\S]*?\*/\s*", "", favori)
favori = "".join(l.strip() for l in favori.splitlines() if l.strip())
assert "</script" not in favori.lower()
assert faits.count('/*CODE-FAVORI-FAITS*/""') == 1
faits = faits.replace('/*CODE-FAVORI-FAITS*/""', '/*CODE-FAVORI-FAITS*/' + json.dumps(favori).replace("</", "<\\/"))


def sub_once(old, new, text, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"[{label}] expected 1 match, found {n}")
    return text.replace(old, new)


GOLD = [
    (r"#E3B64C", "#C9B07F"), (r"#C9A227", "#B39A68"), (r"#F3D48A", "#E3D3B0"), (r"#F7DC92", "#E3D3B0"),
    (r"#F7D774", "#E3D3B0"), (r"#F2C230", "#C9B07F"), (r"rgba\(227,\s*182,\s*76,", "rgba(201,176,127,"),
]


def regild(text):
    for pat, rep in GOLD:
        text = re.sub(pat, rep, text, flags=re.I)
    return text


# 1) the skin: new block in place of the "nuit de match" one (same markers, so it stays replaceable)
start = html.index("/*HABILLAGE-CSS*/")
end = html.index("/*/HABILLAGE-CSS*/") + len("/*/HABILLAGE-CSS*/")
html = html[:start] + tete + html[end:]

# 2) gold of the base stylesheet becomes the app's muted gold
hs = html.index("<style>")
he = html.index("</style>", hs)
base = html[hs:he]
k = base.index("/*HABILLAGE-CSS*/")
html = html[:hs] + regild(base[:k]) + base[k:] + html[he:]

# 3) same in the stylesheets the modules inject (css.textContent = `...`), never in drawing code
out_parts, i = [], 0
marker = "css.textContent = `"
while True:
    j = html.find(marker, i)
    if j < 0:
        out_parts.append(html[i:])
        break
    s = j + len(marker)
    p, depth = s, 0
    while True:  # find the closing backtick of the template literal
        ch = html[p]
        if ch == "\\":
            p += 2
            continue
        if ch == "$" and html[p + 1] == "{":
            depth += 1
            p += 2
            continue
        if ch == "}" and depth:
            depth -= 1
        elif ch == "`" and not depth:
            break
        p += 1
    out_parts.append(html[i:s])
    out_parts.append(regild(html[s:p]))
    i = p
html = "".join(out_parts)

# 4) fonts: Barlow (interface) and Bebas Neue (big titles) next to the fonts already loaded
html = sub_once("family=Barlow+Condensed:ital,wght@",
                "family=Bebas+Neue&family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:ital,wght@", html, "fonts")

# 5) browser bar colour = app background
html = sub_once('<meta name="theme-color" content="#0F2257">', '<meta name="theme-color" content="#030E1C">', html, "theme-color")

# 6) intro: shown once per visit (the flag is read before the first paint)
TRN = 'if(/^#tournoi\\//.test(location.hash))document.documentElement.classList.add("trn-mode","intro-vue");'
INTRO_HEAD = ('<script>' + TRN + 'try{if(sessionStorage.getItem("asf-intro"))document.documentElement.classList.add("intro-vue");'
              'else if(!/^#tournoi\\//.test(location.hash))sessionStorage.setItem("asf-intro","1")}catch(e){}</script>')
if test:
    INTRO_HEAD = '<script>' + TRN + 'if(location.search.indexOf("intro")<0)document.documentElement.classList.add("intro-vue")</script>'
html = sub_once('<meta charset="UTF-8">', '<meta charset="UTF-8">\n' + INTRO_HEAD, html, "intro-head")
INTRO = """<div id="intro" aria-hidden="true">
  <div class="intro-centre">
    <div class="intro-blason"><img src="/img/blason.png" alt="" onerror="this.remove()"><span data-blason></span></div>
    <div class="intro-club">Atom'Sports Football</div>
    <div class="intro-nom">Pierrelatte</div>
    <div class="intro-trait"></div>
    <div class="intro-depuis">DEPUIS 1923</div>
  </div>
</div>"""
html = sub_once("<body>\n<header class=\"top\">", "<body>\n" + INTRO + "\n<header class=\"top\">", html, "intro")

# 7) the club header with its tabs, on every page of the public site
CLUB = """<section class="club-tete" id="club-tete" aria-label="ASF Pierrelatte">
  <a class="club-blason" href="#accueil" aria-label="Accueil du club"><span data-blason></span></a>
  <p class="club-nom">Atom'Sports Football Pierrelatte</p>
  <nav class="club-onglets" id="club-onglets" aria-label="Rubriques du club">
    <a href="#accueil" data-o="accueil">Accueil</a><a href="#club" data-o="club">Le club</a><a href="#equipes" data-o="equipes">Équipes</a><a href="#calendrier" data-o="matchs">Matchs</a><a href="#compos" data-o="compos">Compos</a><a href="#photos" data-o="photos">Photos</a><a href="#inscriptions" data-o="inscriptions">Inscriptions</a><a href="#partenaires" data-o="partenaires">Partenaires</a><a href="#contact" data-o="contact">Contact</a>
  </nav>
</section>"""
html = sub_once("</header>\n\n<main>", "</header>\n" + CLUB + "\n\n<main>", html, "club-tete")

# 8) LE CLUB page: general information and facilities, as in the app
ICO = {
    "equipes": '<path d="M12 3l7 2.5v6c0 4.5-3 7.6-7 9.5-4-1.9-7-5-7-9.5v-6z"/><path d="M9 11.5l2 2 4-4"/>',
    "ligue": '<path d="M9.5 3.5l3 1.4 2.8-.6 1 2.6 3 1.3-.9 3.1 1.4 2.9-2.4 2-.8 3.4-3.4-.8-3 1.5-2-2.4-3.2-.9.9-3.1-1.6-2.6 2.2-2.1.6-3.1z"/>',
    "district": '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><circle cx="12" cy="11.5" r="3.4"/><path d="M12 8.1v1.6M9 12.6l1.5-.5M15 12.6l-1.5-.5"/>',
    "affil": '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9.5 3h5v4h-5z"/><circle cx="12" cy="12" r="2.4"/><path d="M8 18.2c.8-1.8 2.2-2.6 4-2.6s3.2.8 4 2.6"/>',
    "maillot": '<path d="M8.4 3.6L3.8 6.2l1.7 4.3 2.1-.9V20.4h8.8V9.6l2.1.9 1.7-4.3-4.6-2.6c-.5 1.5-1.9 2.5-3.6 2.5s-3.1-1-3.6-2.5z"/><path d="M7.6 13h8.8"/>',
    "date": '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    "siege": '<rect x="5" y="3" width="10" height="18"/><path d="M15 9h4v12h-4M8 7h1M11 7h1M8 11h1M11 11h1M8 15h1M11 15h1M3 21h18"/>',
    "terrain": '<rect x="2" y="5" width="20" height="14"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.6"/><path d="M2 9h3v6H2M22 9h-3v6h3"/>',
}
PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>'


def svg(k):
    return f'<svg viewBox="0 0 24 24" aria-hidden="true">{ICO[k]}</svg>'


def carte(q):
    return "https://www.google.com/maps/search/?api=1&amp;query=" + q.replace(" ", "+")


def info(k, label, value):
    return f'<div class="ic">{svg(k)}<small>{label}</small><b>{value}</b></div>'


def inst(k, nom, adr, q=None):
    pin = f'<a class="pin" href="{carte(q)}" target="_blank" rel="noopener" aria-label="Voir {nom} sur le plan">{PIN}</a>' if q else ""
    return f'<div class="inst">{svg(k)}<div><b>{nom}</b><span>{adr}</span></div>{pin}</div>'


CLUB_PAGE = f"""<div class="page" id="p-club">
  <section class="bloc"><div class="wrap">
    <h2>Informations <span class="t-or">générales</span></h2>
    <div class="infos-club">
      {info("equipes", "Équipes", "16")}
      {info("ligue", "Ligue", "Auvergne-Rhône-Alpes")}
      {info("district", "District", "Drôme-Ardèche")}
      {info("affil", "N° d'affiliation", "504261")}
      {info("maillot", "Couleurs des maillots", "Blanc et bleu")}
      {info("date", "Création", "1923")}
    </div>
    <h2>Les <span class="t-or">installations</span></h2>
    <div class="install">
      {inst("siege", "Siège social", "Complexe sportif Gustave Jaume<br>Avenue Pierre de Coubertin<br>26700 Pierrelatte", "Complexe sportif Gustave Jaume, Avenue Pierre de Coubertin, 26700 Pierrelatte")}
      {inst("terrain", "Stade Michel Hidalgo", "205 allée Fernand Pellegrin<br>26290 Donzère", "205 Allée Fernand Pellegrin, 26290 Donzère")}
      {inst("terrain", "Stade Gustave Jaume 2", "Annexe<br>Avenue Pierre de Coubertin<br>26700 Pierrelatte", "Stade Gustave Jaume, Avenue Pierre de Coubertin, 26700 Pierrelatte")}
      {inst("terrain", "Stade Gustave Jaume 1", "Terrain d'honneur<br>Avenue Pierre de Coubertin<br>26700 Pierrelatte", "Stade Gustave Jaume, Avenue Pierre de Coubertin, 26700 Pierrelatte")}
      {inst("terrain", "Terrains sud et du Rocher", "Entraînements des jeunes<br>Pierrelatte")}
    </div>
    <h2 id="club-staff-t" hidden>Le <span class="t-or">staff</span></h2>
    <div class="staff" id="club-staff" hidden></div>
    <div class="club-deux">
      <div><h2>Notre <span class="t-or">histoire</span></h2>
        <div class="frise">
          <div><b>1923</b>Création du club de football à Pierrelatte.</div>
          <div><b>Atom'Sports</b>Le football rejoint l'association omnisports Atom'Sports de Pierrelatte.</div>
          <div><b>Aujourd'hui</b>Plus de 450 licenciés, une équipe fanion en D1 du district Drôme-Ardèche et une section féminine engagée en Régional 2.</div>
        </div></div>
      <div><h2>Nos <span class="t-or">valeurs</span></h2>
        <div class="valeurs"><p>Respect, plaisir de jouer et esprit d'équipe. Nos éducateurs sont diplômés et le club suit le Programme éducatif fédéral de la FFF pour les plus jeunes.</p><p>Les filles ont toute leur place : équipes mixtes de U6 à U11, puis équipes féminines en U13, U15, U18 et seniors.</p></div>
        <figure class="photo" style="margin-top:18px"><figcaption>Le stade Gustave Jaume</figcaption></figure></div>
    </div>
  </div></section>
</div>

"""
cs = html.index('<div class="page" id="p-club">')
ce = html.index('<div class="page" id="p-equipes">')
html = html[:cs] + CLUB_PAGE + html[ce:]

# 9) MATCHS: every match of the weekend, all categories, filled by appli.js (the per-team calendar stays in the page, hidden)
html = sub_once('<div class="page" id="p-calendrier">\n',
                '<div class="page" id="p-calendrier">\n  <section class="bloc mw-bloc"><div class="wrap" id="mw-zone"></div></section>\n', html, "mw-zone")
html = sub_once('["Calendrier", "#calendrier"], ["Résultats", "#resultats"], ', '["Tous les matchs", "#calendrier"], ', html, "nav-matchs")
html = sub_once('<a href="#resultats">Résultats</a><a href="#classement">Classement</a>', '<a href="#calendrier">Matchs</a><a href="#classement">Classement</a>', html, "plus-matchs")

# 9b) ÉQUIPES: the app's list (filled by appli.js); one page per team (#equipe/<name>)
html = sub_once('<div class="diapo" id="diapo-equipes"></div>', '<div class="eqa" id="eq-appli"></div>\n    <div class="diapo" id="diapo-equipes"></div>', html, "eq-appli")
html = sub_once('<div class="page" id="p-photos">', '<div class="page" id="p-equipe"><div id="eqp"></div></div>\n\n<div class="page" id="p-tournoi"><div id="trn"></div></div>\n\n<div class="page" id="p-photos">', html, "p-equipe")
html = sub_once('const p = PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : "accueil";',
                'const p = PAGES.includes(location.hash.slice(1).split("/")[0]) ? location.hash.slice(1).split("/")[0] : "accueil";', html, "route")

# 10) the router knows the team pages (#equipe/<name>)
html = sub_once('const PAGES = ["portail",', 'const PAGES = ["equipe","tournoi","portail",', html, "pages")

# 10b) FOOT ANIMATION: the U13 teams now play championship (FFF results) and U8 · U9 keeps Promotion, Espoir, Bourgeon only
html = sub_once('const ONGLETS_ANIM_CAL = ["U6 · U7", "U8 · U9", "U8 · U9 Promotion", "U8 · U9 Espoir", "U8 · U9 Bourgeon", "U10 · U11 Avenir", "U10 · U11 Espoir", "U10 · U11 Bourgeons", "U13 · équipe 3", "U13 · équipe 4"];',
                'const ONGLETS_ANIM_CAL = ["U6 · U7", "U8 · U9 Promotion", "U8 · U9 Espoir", "U8 · U9 Bourgeon", "U10 · U11 Avenir", "U10 · U11 Espoir", "U10 · U11 Bourgeons"];', html, "onglets-anim-cal")
html = sub_once('const ONGLETS_ANIM_RES = ["U10 · U11 Avenir", "U10 · U11 Espoir", "U10 · U11 Bourgeons", "U13 · équipe 3", "U13 · équipe 4"];',
                'const ONGLETS_ANIM_RES = ["U10 · U11 Avenir", "U10 · U11 Espoir", "U10 · U11 Bourgeons"];', html, "onglets-anim-res")
html = sub_once('const CATS_AN = [["U6 · U7", "Plateau"], ["U8 · U9", "Plateau"], ["U8 · U9 Promotion", "Plateau"],',
                'const CATS_AN = [["U6 · U7", "Plateau"], ["U8 · U9 Promotion", "Plateau"],', html, "cats-an-u89")
html = sub_once(', ["U10 · U11 Bourgeons", "Plateau", true], ["U13 · ÉQUIPE 3", "Brassage", true], ["U13 · ÉQUIPE 4", "Brassage", true]];',
                ', ["U10 · U11 Bourgeons", "Plateau", true]];', html, "cats-an-u13")
html = sub_once('  ["U13 · ÉQUIPE 3", "U13 · ÉQUIPE 4"].forEach(e => { if (!eqs.includes(e)) eqs.push(e); });\n', '', html, "classement-u13")
html = sub_once("if (age === 13) lab = eq ? `U13 · ÉQUIPE ${+eq || eq}` : null;",
                "if (age === 13) return false;                                  // les U13 jouent en championnat : résultats de la FFF", html, "fal-u13")
html = sub_once('w.jours.includes(m.date) && /U1[013]/i.test(m.equipe || "")', 'w.jours.includes(m.date) && /U1[01]/i.test(m.equipe || "")', html, "scores-u13")
html = sub_once('<h3 class="club-titre">Foot animation · U10-U11 et U13</h3>', '<h3 class="club-titre">Foot animation · U10-U11</h3>', html, "scores-titre")
html = sub_once('.filter(m => /^pl-/.test(m.id) && /U1[013]/i.test(m.equipe || ""))', '.filter(m => /^pl-/.test(m.id) && /U1[01]/i.test(m.equipe || ""))', html, "resultats-u13")
html = sub_once("Les scores se saisissent pour les U10 · U11 et les deux équipes U13 ;", "Les scores se saisissent pour les U10 · U11 ;", html, "texte-scores-1")
html = sub_once("Les scores se mettent seulement pour les U10 · U11 et les U13 ;", "Les scores se mettent seulement pour les U10 · U11 ;", html, "texte-scores-2")
html = sub_once('"Mon équipe","Plateaux et brassages : dates, adversaires et résultats"]', '"Mon équipe","Plateaux : dates, adversaires et résultats"]', html, "texte-onglet-anim")

# 10c) TOURNAMENTS: online as soon as they are created (spectator page and QR code ready); « Retirer du site » still hides one
html = sub_once('matchs: T.poules.flatMap((p,i) => genererPoule(p,i)), publie: false, cree: Date.now() };',
                'matchs: T.poules.flatMap((p,i) => genererPoule(p,i)), publie: true, cree: Date.now() };', html, "tournoi-en-ligne")
html = sub_once('S.db.doc("tournois/" + T.id).set(doc), "Tournoi créé.");',
                'S.db.doc("tournois/" + T.id).set(doc), "Tournoi créé et en ligne : sa page spectateurs et son QR code sont prêts.");', html, "tournoi-cree")

# 10d) TOURNAMENTS: schedule settings in the creation form; the draw alternates the poules (A, B, A, B…) and sets the times
html = sub_once('<label>Lieu<input data-nt="lieu" value="${esc(n.lieu)}"></label>',
                '<label>Lieu<input data-nt="lieu" value="${esc(n.lieu)}"></label>'
                '<div class="t-horaire"><b class="t-horaire-t">⏱️ Horaires des matchs</b>'
                '<label>Premier match<input type="time" data-nt="debut" value="${esc(n.debut ?? "10:00")}"></label>'
                '<label>Durée d\'un match<select data-nt="duree">${[5,6,7,8,10,12,15,20,25,30,35,40,45].map(v => `<option value="${v}" ${+(n.duree ?? 10) === v ? "selected" : ""}>${v} min</option>`).join("")}</select></label>'
                '<label>Pause entre deux<select data-nt="pause">${[0,1,2,3,4,5,8,10,15].map(v => `<option value="${v}" ${+(n.pause ?? 2) === v ? "selected" : ""}>${v ? v + " min" : "aucune"}</option>`).join("")}</select></label>'
                '<label>Terrains<select data-nt="terrains">${[1,2,3,4,5,6].map(v => `<option ${+(n.terrains ?? 1) === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>'
                '<small class="t-horaire-n">Les matchs alternent poule A, poule B… et chaque équipe souffle entre deux matchs. Les heures s\'affichent sur la page des spectateurs.</small></div>',
                html, "tournoi-horaires-form")
html = sub_once('matchs: T.poules.flatMap((p,i) => genererPoule(p,i)), publie: true, cree: Date.now() };',
                'matchs: T.poules.flatMap((p,i) => genererPoule(p,i)), publie: true, cree: Date.now() };\n'
                '  try { if (window.ASF_TOURNOI && ASF_TOURNOI.programmer) ASF_TOURNOI.programmer(doc, T); } catch(e){}   // poule A, poule B… et les horaires',
                html, "tournoi-programme")

# 11) floating bottom bar with app-style outline icons (same links, ids and labels)
ts = html.index('<nav class="tabbar" aria-label="Navigation mobile">')
te = html.index("</nav>", ts) + len("</nav>")
old_tab = html[ts:te]
for need in ('data-p="accueil"', 'data-p="calendrier"', 'data-p="compos"', 'id="tab-espace"', 'id="btn-plus"'):
    assert need in old_tab, need
TABBAR = """<nav class="tabbar" id="tabbar-site" aria-label="Navigation mobile">
  <a href="#accueil" data-p="accueil"><svg viewBox="0 0 24 24"><path d="M12 3.4l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.4l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/></svg>Accueil</a>
  <a href="#calendrier" data-p="calendrier"><svg viewBox="0 0 24 24"><path d="M12 2.8l7.2 2.6v5.4c0 4.7-3 8.3-7.2 10.4-4.2-2.1-7.2-5.7-7.2-10.4V5.4z"/><circle cx="12" cy="11" r="3.6"/><path d="M12 9.3l1.2.9-.5 1.4h-1.4l-.5-1.4z"/></svg>Matchs</a>
  <a href="#compos" data-p="compos"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.6"/><path d="M3 9.5h2.6v5H3M21 9.5h-2.6v5H21"/></svg>Compos</a>
  <a href="#connexion" data-p="espaces" id="tab-espace"><svg viewBox="0 0 24 24"><path d="M8.4 3.6L3.8 6.2l1.7 4.3 2.1-.9V20.4h8.8V9.6l2.1.9 1.7-4.3-4.6-2.6c-.5 1.5-1.9 2.5-3.6 2.5s-3.1-1-3.6-2.5z"/></svg><span>Se connecter</span><span class="burger-badge tab-badge" data-badge-messages hidden></span></a>
  <button id="btn-plus" aria-expanded="false" aria-controls="drawer"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/></svg>Plus</button>
</nav>"""
html = html[:ts] + TABBAR + html[te:]

# 12) a few section titles get the app's gold second word
for old, new in [
    ("<h2>Derniers résultats</h2>", '<h2>Derniers <span class="t-or">résultats</span></h2>'),
    ("<h2>Comment s'inscrire</h2>", '<h2>Comment <span class="t-or">s\'inscrire</span></h2>'),
    ("<h2>Cotisations</h2>", '<h2>Les <span class="t-or">cotisations</span></h2>'),
]:
    html = sub_once(old, new, html, "titre " + old)

# 13) Samsung Internet fallback colours follow the app's gold
ss = html.index('<script id="samsung-js">')
se = html.index("</script>", ss)
html = html[:ss] + html[ss:se].replace("#7FB0FF", "#C9B07F").replace("#CFAE78", "#C9B07F") + html[se:]

# 14) late stylesheet + small script, after every module
last_body = html.rindex("</body>")  # the page's own closing tag (others live inside JS templates)
html = html[:last_body] + '<style id="appli-tard">\n' + tard + "\n</style>\n" + appli + "\n" + faits + "\n" + tournoi + "\n" + html[last_body:]

# 15) new version stamp, so open pages and installed apps show the "mise à jour" banner
stamp = hashlib.sha1(html.encode("utf-8")).hexdigest()[:12]
html = re.sub(r'<meta name="asf-version" content="[^"]*">', f'<meta name="asf-version" content="{stamp}">', html, count=1)
html = re.sub(r'<meta name="asf-version-date" content="[^"]*">', f'<meta name="asf-version-date" content="{datetime.date.today().isoformat()}">', html, count=1)

if test:
    html = sub_once('window.ASFP_API = "/api";', 'window.ASFP_API = "";', html, "api")

open(out, "w", encoding="utf-8").write(html)
print("ok", out, len(html))
