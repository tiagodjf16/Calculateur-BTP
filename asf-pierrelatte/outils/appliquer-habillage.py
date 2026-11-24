"""Assemble the app-style (myFFF-like) version of the ASF Pierrelatte site from the original upload.

Usage: python3 build2.py <original.html> <tete.css> <tard.css> <appli.js> <output.html> [--test]
  tete.css : replaces the /*HABILLAGE-CSS*/ block of the head stylesheet (public site, first paint)
  tard.css : <style> added at the end of <body>, after every module (member spaces, module overrides)
  appli.js : <script> added at the end of <body> (Plus tab, theme button, match events)
--test : points the API to "" so the page runs offline with its built-in data (screenshots only).
"""
import re
import sys

src, tete_path, tard_path, js_path, out = sys.argv[1:6]
test = "--test" in sys.argv
html = open(src, encoding="utf-8").read()
tete = open(tete_path, encoding="utf-8").read().strip()
tard = open(tard_path, encoding="utf-8").read().strip()
appli = open(js_path, encoding="utf-8").read().strip()


def sub_once(old, new, text, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"[{label}] expected 1 match, found {n}")
    return text.replace(old, new)


GOLD = [
    (r"#E3B64C", "#CFAE78"), (r"#C9A227", "#B8955A"), (r"#F3D48A", "#E3CDA4"), (r"#F7DC92", "#E3CDA4"),
    (r"#F7D774", "#E3CDA4"), (r"#F2C230", "#CFAE78"), (r"rgba\(227,\s*182,\s*76,", "rgba(207,174,120,"),
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

# 4) fonts: Barlow (interface) next to the fonts already loaded
html = sub_once("family=Barlow+Condensed:ital,wght@",
                "family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:ital,wght@", html, "fonts")

# 5) browser bar colour = app background
html = sub_once('<meta name="theme-color" content="#0F2257">', '<meta name="theme-color" content="#000E1D">', html, "theme-color")

# 6) bottom tab bar with app-style outline icons (same links, ids and labels)
ts = html.index('<nav class="tabbar" aria-label="Navigation mobile">')
te = html.index("</nav>", ts) + len("</nav>")
old_tab = html[ts:te]
for need in ('data-p="accueil"', 'data-p="calendrier"', 'data-p="compos"', 'id="tab-espace"', 'id="btn-plus"'):
    assert need in old_tab, need
TABBAR = """<nav class="tabbar" aria-label="Navigation mobile">
  <a href="#accueil" data-p="accueil"><svg viewBox="0 0 24 24"><path d="M12 3.4l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.4l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/></svg>Accueil</a>
  <a href="#calendrier" data-p="calendrier"><svg viewBox="0 0 24 24"><path d="M12 2.8l7.2 2.6v5.4c0 4.7-3 8.3-7.2 10.4-4.2-2.1-7.2-5.7-7.2-10.4V5.4z"/><circle cx="12" cy="11" r="3.6"/><path d="M12 9.3l1.2.9-.5 1.4h-1.4l-.5-1.4z"/></svg>Matchs</a>
  <a href="#compos" data-p="compos"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.6"/><path d="M3 9.5h2.6v5H3M21 9.5h-2.6v5H21"/></svg>Compos</a>
  <a href="#connexion" data-p="espaces" id="tab-espace"><svg viewBox="0 0 24 24"><path d="M8.4 3.6L3.8 6.2l1.7 4.3 2.1-.9V20.4h8.8V9.6l2.1.9 1.7-4.3-4.6-2.6c-.5 1.5-1.9 2.5-3.6 2.5s-3.1-1-3.6-2.5z"/></svg><span>Se connecter</span><span class="burger-badge tab-badge" data-badge-messages hidden></span></a>
  <button id="btn-plus" aria-expanded="false" aria-controls="drawer"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/></svg>Plus</button>
</nav>"""
html = html[:ts] + TABBAR + html[te:]

# 7) a few section titles get the app's gold second word
for old, new in [
    ("<h2>Derniers résultats</h2>", '<h2>Derniers <span class="t-or">résultats</span></h2>'),
    ("<h2>Notre histoire</h2>", '<h2>Notre <span class="t-or">histoire</span></h2>'),
    ("<h2>Nos valeurs</h2>", '<h2>Nos <span class="t-or">valeurs</span></h2>'),
    ("<h2>Nos installations</h2>", '<h2>Nos <span class="t-or">installations</span></h2>'),
    ("<h2>Comment s'inscrire</h2>", '<h2>Comment <span class="t-or">s\'inscrire</span></h2>'),
    ("<h2>Cotisations</h2>", '<h2>Les <span class="t-or">cotisations</span></h2>'),
]:
    html = sub_once(old, new, html, "titre " + old)

# 8) Samsung Internet fallback colours follow the app's gold
ss = html.index('<script id="samsung-js">')
se = html.index("</script>", ss)
html = html[:ss] + html[ss:se].replace("#7FB0FF", "#CFAE78") + html[se:]

# 9) late stylesheet + small script, after every module
last_body = html.rindex("</body>")  # the page's own closing tag (others live inside JS templates)
html = html[:last_body] + '<style id="appli-tard">\n' + tard + "\n</style>\n" + appli + "\n" + html[last_body:]

# 10) new version stamp, so open pages and installed apps show the "mise à jour" banner
import hashlib, datetime
stamp = hashlib.sha1(html.encode("utf-8")).hexdigest()[:12]
html = re.sub(r'<meta name="asf-version" content="[^"]*">', f'<meta name="asf-version" content="{stamp}">', html, count=1)
html = re.sub(r'<meta name="asf-version-date" content="[^"]*">', f'<meta name="asf-version-date" content="{datetime.date.today().isoformat()}">', html, count=1)

if test:
    html = sub_once('window.ASFP_API = "/api";', 'window.ASFP_API = "";', html, "api")

open(out, "w", encoding="utf-8").write(html)
print("ok", out, len(html))
