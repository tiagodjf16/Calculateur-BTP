"""Assemble the myFFF-style version of the ASF Pierrelatte site from the original upload.

Usage: python3 build.py <original.html> <myfff.css> <output.html> [--test]
--test : also points the API to "" so the page runs offline with its built-in data (for screenshots only).
"""
import re
import sys

src, css_path, out = sys.argv[1:4]
test = "--test" in sys.argv
html = open(src, encoding="utf-8").read()
css = open(css_path, encoding="utf-8").read().strip()


def sub_once(old, new, text, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"[{label}] expected 1 match, found {n}")
    return text.replace(old, new)


# 1) swap the "nuit de match" skin for the app skin (same markers, so the block stays replaceable)
start = html.index("/*HABILLAGE-CSS*/")
end = html.index("/*/HABILLAGE-CSS*/") + len("/*/HABILLAGE-CSS*/")
html = html[:start] + css + html[end:]

# 2) gold accents of the base stylesheet (first <style> of <head>) become the app's sky blue
head_style_start = html.index("<style>")
head_style_end = html.index("</style>", head_style_start)
base = html[head_style_start:head_style_end]
skin_start = base.index("/*HABILLAGE-CSS*/")
before, skin = base[:skin_start], base[skin_start:]
GOLD = [
    (r"#E3B64C", "#7FB0FF"), (r"#C9A227", "#4C82FF"), (r"#F3D48A", "#BFD6FF"),
    (r"#F7DC92", "#BFD6FF"), (r"#F2C230", "#7FB0FF"), (r"rgba\(227,\s*182,\s*76,", "rgba(127,176,255,"),
]
for pat, rep in GOLD:
    before = re.sub(pat, rep, before, flags=re.I)
# text on the former gold badges was navy: keep it readable on the new light-blue badges
html = html[:head_style_start] + before + skin + html[head_style_end:]

# 3) fonts: add Barlow (titles of the app skin) next to the fonts already loaded
html = sub_once(
    "family=Barlow+Condensed:ital,wght@",
    "family=Barlow:wght@600;700;800&family=Barlow+Condensed:ital,wght@",
    html, "fonts")

# 4) browser bar colour = app header colour
html = sub_once('<meta name="theme-color" content="#0F2257">', '<meta name="theme-color" content="#060D22">', html, "theme-color")

# 5) bottom tab bar: "Plus" gets a grid icon (the hamburger stays the header's) and opens the full menu;
#    the "Mon espace" tab shows the unread-messages badge like the header button did
html = sub_once(
    '<button id="btn-plus" aria-expanded="false" aria-controls="plus"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>Plus</button>',
    '<button id="btn-plus" aria-expanded="false" aria-controls="drawer"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>Plus</button>',
    html, "btn-plus")
html = sub_once(
    '<span>Se connecter</span></a>\n  <button id="btn-plus"',
    '<span>Se connecter</span><span class="burger-badge tab-badge" data-badge-messages hidden></span></a>\n  <button id="btn-plus"',
    html, "tab-badge")

# 6) Samsung Internet fallback colours follow the new accent
samsung_start = html.index('<script id="samsung-js">')
samsung_end = html.index("</script>", samsung_start)
block = html[samsung_start:samsung_end]
block = block.replace("#E3B64C", "#7FB0FF").replace("#F7DC92", "#BFD6FF")
html = html[:samsung_start] + block + html[samsung_end:]

# 7) small script: the "Plus" tab opens the site menu panel (always up to date: stage, members area, theme)
APP_JS = """<script id="appli-js">
/* barre d'onglets du téléphone : « Plus » ouvre le menu complet du site (le même que les trois traits) */
(() => {
  const bt = document.getElementById("btn-plus");
  if (!bt || typeof ouvrirMenuMobile !== "function") return;
  bt.onclick = ev => {
    ev.preventDefault();
    document.body.classList.contains("drawer-ouvert") ? fermerMenuMobile() : ouvrirMenuMobile();
    bt.setAttribute("aria-expanded", document.body.classList.contains("drawer-ouvert"));
  };
  new MutationObserver(() => bt.setAttribute("aria-expanded", document.body.classList.contains("drawer-ouvert")))
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  /* « Changer de thème » du menu : le lien est recréé à chaque ouverture, il n'avait donc pas d'action */
  document.addEventListener("click", ev => {
    const t = ev.target.closest && ev.target.closest("#drawer-contenu [data-theme-btn]");
    if (!t) return;
    ev.preventDefault();
    const r = document.documentElement;
    r.dataset.theme = r.dataset.theme === "light" ? "dark" : "light";
    try { localStorage.setItem("theme", r.dataset.theme); } catch(e){}
  });
})();
</script>
"""
last_body = html.rindex("</body>")  # the page's own closing tag (others live inside JS templates)
html = html[:last_body] + APP_JS + html[last_body:]

if test:
    html = sub_once('window.ASFP_API = "/api";', 'window.ASFP_API = "";', html, "api")

open(out, "w", encoding="utf-8").write(html)
print("ok", out, len(html))
