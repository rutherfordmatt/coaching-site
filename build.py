#!/usr/bin/env python3
"""Build mattrutherfordcoaching.com from src/ into the repo root.

The site is still plain static HTML served by nginx. This script only exists
so the nav, footer, booking links, prices and packages live in one place
instead of being copied into every page.

    python3 build.py          build, then run the checks
    python3 build.py --og     also regenerate the Open Graph images in og/ (needs Google Chrome)

Edit src/config.json for links, booking URLs, email and policy wording, and
src/content/*.json for packages, testimonials and FAQ. Pages are in
src/pages, shared blocks in src/partials. Never edit the generated .html files
in the repo root directly; they are overwritten on every build.

Template syntax:
    {{ name.path }}     value from config, page front matter or a helper
    {{> partial }}      contents of src/partials/partial.html
    {{ helper arg }}    output of a helper function below, with one argument
"""

import datetime
import hashlib
import html
import json
import pathlib
import re
import subprocess
import sys
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

TOKEN = re.compile(r"\{\{\s*(>)?\s*([A-Za-z_][\w.-]*)(?:\s+([\w./-]+))?\s*\}\}")
FRONT_MATTER = re.compile(r"\A<!--\s*(\{.*?\})\s*-->\s*", re.S)
PLACEHOLDER = re.compile(r"\[(TITLE|CONFIRM|CRO_NUMBER)[^\]]*\]")


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def is_set(value):
    """Empty strings and unfilled [PLACEHOLDER] values count as not set."""
    return bool(value) and not str(value).startswith("[")


def esc(value):
    return html.escape(str(value), quote=True)


# ─── Data ───

CONFIG = load_json(SRC / "config.json")
PACKAGES = load_json(SRC / "content" / "packages.json")
TESTIMONIALS = load_json(SRC / "content" / "testimonials.json")
FAQ = load_json(SRC / "content" / "faq.json")
PACKAGES_BY_SLUG = {p["slug"]: p for p in PACKAGES}
SITE = CONFIG["siteUrl"].rstrip("/")


def booking_links():
    """Every booking button reads from here. An empty URL falls back to the
    contact form so the site keeps working while a Calendly event is missing."""
    return {k: (v if is_set(v) else "/#contact") for k, v in CONFIG["booking"].items()}


# ─── Helpers callable from templates ───

def price_html(p):
    note = f'<span class="price-note">{p["priceNote"]}</span>' if p.get("priceNote") else ""
    return f'<span class="price">{p["price"]}</span>{note}'


def card_price_html(p):
    """Cards can add a cardNote line under the price. It sits inside the
    price paragraph so every card keeps the same number of children."""
    extra = f'<span class="price-note">{p["cardNote"]}</span>' if p.get("cardNote") else ""
    return price_html(p) + extra


def h_package_cards(ctx, style):
    """Cards use CSS subgrid, so every child is one row and the rows line up
    across cards. Keep the number of children the same for every package."""
    book = ctx["book"]
    cards = []
    for p in PACKAGES:
        if style == "compact":
            cards.append(f"""
            <article class="package-card package-card--compact">
                <h3><a href="{p['url']}">{p['name']}</a></h3>
                <p class="package-who">{p['who']}</p>
                <p class="package-price">{card_price_html(p)}</p>
                <p class="package-length">{p['length']}</p>
                <a href="{p['url']}" class="text-link">View package<span class="visually-hidden">: {p['name']}</span><span aria-hidden="true"> &rarr;</span></a>
            </article>""")
        else:
            items = "".join(f"<li>{i}</li>" for i in p["includes"])
            cards.append(f"""
            <article class="package-card" id="{p['slug']}">
                <h3><a href="{p['url']}">{p['name']}</a></h3>
                <p class="package-who">{p['who']}</p>
                <p class="package-price">{card_price_html(p)}</p>
                <p class="package-length">{p['length']}</p>
                <div>
                    <h4 class="package-sub">What is included</h4>
                    <ul class="feature-list">{items}</ul>
                </div>
                <p class="package-note">{p.get('note', '')}</p>
                <div class="package-actions">
                    <a href="{book[p['booking']]}" class="btn btn-primary">Book this package<span class="visually-hidden">: {p['name']}</span></a>
                    <p class="booking-note">{p['bookingNote']}</p>
                    <a href="{p['url']}" class="text-link">View package<span class="visually-hidden">: {p['name']}</span><span aria-hidden="true"> &rarr;</span></a>
                </div>
            </article>""")
    return "\n".join(cards)


def h_package_hero(ctx, slug):
    """Header for a package page: back link, name, price, facts and the one
    booking action that matches how the package is bought."""
    p = PACKAGES_BY_SLUG[slug]
    book = ctx["book"]
    secondary = ""
    if p.get("secondary"):
        secondary = f'<a href="{book["conversation"]}" class="text-link">{p["secondary"]}<span aria-hidden="true"> &rarr;</span></a>'
    extra = ""
    if p.get("heroFact"):
        extra = f'<div><dt>{p["heroFact"][0]}</dt><dd>{p["heroFact"][1]}</dd></div>'
    return f"""
        <section class="page-hero">
            <div class="page-hero-inner">
                <a href="/coaching/" class="back-link"><span aria-hidden="true">&larr; </span>All packages</a>
                <h1>{p['name']}</h1>
                <p class="page-lede">{p['who']}</p>
                <p class="package-price package-price--hero">{price_html(p)}</p>
                <dl class="hero-facts">
                    <div><dt>Length</dt><dd>{p['length']}</dd></div>
                    <div><dt>Payment</dt><dd>{p['payment']}</dd></div>
                    {extra}
                </dl>
                <div class="hero-actions">
                    <a href="{book[p['booking']]}" class="btn btn-primary">{p['primary']}</a>
                    {secondary}
                </div>
            </div>
        </section>"""


def h_package_includes(ctx, slug):
    items = "".join(f"<li>{i}</li>" for i in PACKAGES_BY_SLUG[slug]["includes"])
    return f'<ul class="feature-list">{items}</ul>'


def h_package(ctx, path):
    """{{ package next-move.price }} returns one field of one package."""
    slug, field = path.split(".", 1)
    return str(PACKAGES_BY_SLUG[slug][field])


def h_testimonials(ctx, _):
    out = []
    # Entries with an empty quote are kept in the JSON as slots and not shown.
    for t in (t for t in TESTIMONIALS if t.get("quote")):
        role = f'<p class="author-role">{t["role"]}</p>' if t.get("role") else ""
        out.append(f"""
            <figure class="testimonial">
                <div class="quote-mark" aria-hidden="true">&ldquo;</div>
                <blockquote class="testimonial-text"><p>{t['quote']}</p></blockquote>
                <figcaption class="testimonial-author">
                    <p class="author-name">{t['name']}</p>
                    {role}
                </figcaption>
            </figure>""")
    count = len(out)
    return f'<div class="testimonials-grid testimonials-grid--{count}">{"".join(out)}</div>'


def faq_items():
    return [item for group in FAQ for item in group["items"]]


def page_faq(name):
    """A page's own FAQ, from src/content/faq-<name>.json: a flat list of
    {id, question, answer}. The main FAQ in faq.json is grouped."""
    return load_json(SRC / "content" / f"faq-{name}.json")


def h_page_faq(ctx, name):
    return "".join(f"""
                <div class="faq-item" id="{item['id']}">
                    <h3>{item['question']}</h3>
                    {render(item['answer'], ctx)}
                </div>""" for item in page_faq(name))


def h_faq_list(ctx, _):
    jump = "".join(f'<li><a href="#{g["id"]}">{g["group"]}</a></li>' for g in FAQ)
    out = [f'<nav class="faq-jump" aria-label="Question groups"><ul>{jump}</ul></nav>']
    for group in FAQ:
        intro = render(group.get("intro", ""), ctx)
        items = "".join(f"""
                <div class="faq-item" id="{item['id']}">
                    <h3>{item['question']}</h3>
                    {render(item['answer'], ctx)}
                </div>""" for item in group["items"])
        out.append(f"""
            <section class="faq-group" id="{group['id']}" aria-labelledby="{group['id']}-title">
                <h2 id="{group['id']}-title">{group['group']}</h2>
                {intro}
                {items}
            </section>""")
    return "\n".join(out)


def h_newsletter(ctx, _):
    url = CONFIG["links"]["newsletter"]
    if is_set(url):
        return f'<a href="{url}">Stuff that MattRs</a>'
    return "Stuff that MattRs"


def h_newsletter_li(ctx, _):
    url = CONFIG["links"]["newsletter"]
    return f'<li><a href="{url}">Newsletter</a></li>' if is_set(url) else ""


def h_byline(ctx, _):
    """Visible author and date for article pages, matching their Article schema."""
    page = ctx["page"]
    date = datetime.date.fromisoformat(page.get("dateModified", page["datePublished"]))
    return (f'<p class="byline">By <a href="/about/">{CONFIG["personName"]}</a>, {CONFIG["label"]}'
            f' &middot; Updated <time datetime="{date.isoformat()}">{date.day} {date:%B %Y}</time></p>')


def h_values_note(ctx, _):
    """The Values Finder line under the first-step button. A page that
    already offers the Values Finder just above sets hideValuesNote."""
    if ctx["page"].get("hideValuesNote"):
        return ""
    return (f'<p class="muted-note">Want something to bring? Try the '
            f'<a href="{CONFIG["links"]["valuesFinder"]}">Values Finder</a> beforehand.</p>')


def h_cro_line(ctx, _):
    number = CONFIG.get("croNumber", "")
    if not is_set(number):
        return ""
    return f"<p>Registered business name number {esc(number)}</p>"


def h_photo(ctx, args):
    """{{ photo portrait }} or {{ photo portrait/eager }}."""
    name, _, mode = args.partition("/")
    p = CONFIG["photos"][name]
    srcset = ", ".join(f"{f} {w}w" for f, w in p["srcset"])
    loading = 'fetchpriority="high"' if mode == "eager" else 'loading="lazy"'
    return (f'<img src="/{p["src"]}" srcset="{srcset}" sizes="{p["sizes"]}" '
            f'width="{p["width"]}" height="{p["height"]}" {loading} decoding="async" '
            f'alt="{esc(p["alt"])}">')


def h_jsonld(ctx, _):
    blocks = []
    for kind in ctx["page"].get("schema", []):
        blocks.append(schema(kind, ctx))
    if ctx["page"]["path"] != "/":
        blocks.append(breadcrumb(ctx["page"]))
    return "\n".join(
        '<script type="application/ld+json">\n'
        + json.dumps(b, indent=2, ensure_ascii=False)
        + "\n</script>"
        for b in blocks)


HELPERS = {
    "package_cards": h_package_cards,
    "package_hero": h_package_hero,
    "package_includes": h_package_includes,
    "package": h_package,
    "testimonials": h_testimonials,
    "faq_list": h_faq_list,
    "newsletter": h_newsletter,
    "newsletter_li": h_newsletter_li,
    "page_faq": h_page_faq,
    "values_note": h_values_note,
    "byline": h_byline,
    "cro_line": h_cro_line,
    "photo": h_photo,
    "jsonld": h_jsonld,
}


# ─── Structured data ───

def strip_tags(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", text))).strip()


def offers_for(p):
    return [{
        "@type": "Offer",
        "name": o["name"],
        "price": o["price"],
        "priceCurrency": "EUR",
        "url": SITE + p["url"],
        "itemOffered": {"@id": SITE + p["url"] + "#service"},
    } for o in p["offers"]]


def service_node(p):
    return {
        "@type": "Service",
        "@id": SITE + p["url"] + "#service",
        "name": p["name"],
        "serviceType": "Career and leadership coaching",
        "description": strip_tags(p["who"]),
        "url": SITE + p["url"],
        "provider": {"@id": SITE + "/#business"},
        "areaServed": area_served(),
        "offers": offers_for(p),
    }


# The three offers on /for-organisations/. Prices come from the package
# each one is built on, so they cannot drift from the price list.
ORG_SERVICES = [
    ("new-manager-coaching", "New-manager coaching", "the-next-move",
     "The Next Move for a manager in their first year: six sessions over twelve weeks, a transition map and a written 90 day plan."),
    ("individual-outplacement", "Individual outplacement", "the-next-move",
     "The Next Move for someone leaving: six sessions over twelve weeks on what comes next, from their story, CV and LinkedIn to interviews and the offer."),
    ("leadership-coaching", "Leadership coaching", "leadership-engagement",
     "The Leadership Engagement for more senior people: six months, structured feedback at the start and a written mid-point review."),
]


def org_service_nodes():
    url = SITE + "/for-organisations/"
    nodes = []
    for key, name, slug, description in ORG_SERVICES:
        sid = f"{url}#{key}"
        nodes.append({
            "@type": "Service",
            "@id": sid,
            "name": name,
            "serviceType": "Career and leadership coaching",
            "description": description,
            "url": url,
            "provider": {"@id": SITE + "/#business"},
            "areaServed": area_served(),
            "offers": [{
                "@type": "Offer",
                "name": name,
                "price": PACKAGES_BY_SLUG[slug]["offers"][0]["price"],
                "priceCurrency": "EUR",
                "url": url,
                "itemOffered": {"@id": sid},
            }],
        })
    return nodes


def area_served():
    return [
        {"@type": "City", "name": "Dublin"},
        {"@type": "Country", "name": "Ireland"},
        {"@type": "Country", "name": "United Kingdom"},
        {"@type": "Place", "name": "Europe"},
    ]


def business_node():
    c = CONFIG
    return {
        "@type": "ProfessionalService",
        "@id": SITE + "/#business",
        "name": c["businessName"],
        "url": SITE + "/",
        "image": SITE + "/og-image.png",
        "logo": SITE + "/favicon.svg",
        "description": c["positioning"],
        "email": c["email"],
        "address": {"@type": "PostalAddress", "addressLocality": "Dublin", "addressCountry": "IE"},
        "areaServed": area_served(),
        "founder": {"@id": SITE + "/#matt"},
        "sameAs": [c["links"]["linkedin"], c["links"]["acDirectory"]],
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Coaching packages",
            "url": SITE + "/coaching/",
            "itemListElement": [o for p in PACKAGES for o in offers_for(p)],
        },
    }


def person_node():
    c = CONFIG
    return {
        "@type": "Person",
        "@id": SITE + "/#matt",
        "name": c["personName"],
        "jobTitle": c["label"],
        "description": c["background"],
        "url": SITE + "/about/",
        "image": SITE + "/" + c["photos"]["portrait"]["src"],
        "worksFor": {"@id": SITE + "/#business"},
        "workLocation": {"@type": "Place", "name": "Dublin, Ireland"},
        "memberOf": {"@type": "Organization", "name": "Association for Coaching"},
        "hasCredential": {
            "@type": "EducationalOccupationalCredential",
            "name": "Diploma in Executive and Business Coaching",
            "dateCreated": "2024",
        },
        "knowsAbout": ["Career coaching", "Leadership coaching", "Change management", "Career transition"],
        "sameAs": [c["links"]["linkedin"], c["links"]["acDirectory"], c["links"]["personalSite"], c["links"]["newsletter"]],
    }


def website_node():
    return {
        "@type": "WebSite",
        "@id": SITE + "/#website",
        "name": CONFIG["businessName"],
        "url": SITE + "/",
        "inLanguage": "en-IE",
        "publisher": {"@id": SITE + "/#business"},
    }


def breadcrumb(page):
    """Home > (Coaching >) this page. Package pages sit under /coaching/;
    every other page sits directly under home and names itself in its
    front matter as crumb."""
    trail = [("Home", SITE + "/")]
    pkg = next((p for p in PACKAGES if p["url"] == page["path"]), None)
    if pkg:
        trail += [("Coaching", SITE + "/coaching/"), (pkg["name"], SITE + pkg["url"])]
    else:
        trail.append((page["crumb"], page["canonical"]))
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [{"@type": "ListItem", "position": i, "name": n, "item": u}
                            for i, (n, u) in enumerate(trail, 1)],
    }


def schema(kind, ctx):
    if kind == "graph":
        return {"@context": "https://schema.org", "@graph":
                [website_node(), business_node(), person_node()] + [service_node(p) for p in PACKAGES]}
    if kind.startswith("service:"):
        p = PACKAGES_BY_SLUG[kind.split(":", 1)[1]]
        node = service_node(p)
        node["@context"] = "https://schema.org"
        return node
    if kind == "organisations":
        return {"@context": "https://schema.org", "@graph": org_service_nodes()}
    if kind == "article":
        page = ctx["page"]
        return {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": page["headline"],
            "description": page["description"],
            "url": page["canonical"],
            "mainEntityOfPage": page["canonical"],
            "image": SITE + "/og-image.png",
            "datePublished": page["datePublished"],
            "dateModified": page.get("dateModified", page["datePublished"]),
            "inLanguage": "en-IE",
            "author": {"@type": "Person", "@id": SITE + "/#matt", "name": CONFIG["personName"], "url": SITE + "/about/"},
            "publisher": {"@type": "Organization", "@id": SITE + "/#business", "name": CONFIG["businessName"], "logo": {"@type": "ImageObject", "url": SITE + "/favicon.svg"}},
        }
    if kind.startswith("faq:"):
        return {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [{
                "@type": "Question",
                "name": item["question"],
                "acceptedAnswer": {"@type": "Answer", "text": strip_tags(render(item["answer"], ctx))},
            } for item in page_faq(kind.split(":", 1)[1])],
        }
    if kind == "faq":
        return {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [{
                "@type": "Question",
                "name": item["question"],
                "acceptedAnswer": {"@type": "Answer", "text": strip_tags(render(item["answer"], ctx))},
            } for item in faq_items()],
        }
    raise ValueError(f"Unknown schema kind: {kind}")


# ─── Templating ───

def lookup(ctx, dotted):
    value = ctx
    for part in dotted.split("."):
        if isinstance(value, dict) and part in value:
            value = value[part]
        else:
            raise KeyError(dotted)
    return value


def render(text, ctx, depth=0):
    if depth > 10:
        raise RecursionError("Template includes nest too deeply")

    def sub(m):
        include, name, arg = m.groups()
        if include:
            return render((SRC / "partials" / f"{name}.html").read_text(encoding="utf-8"), ctx, depth + 1)
        if name in HELPERS:
            return HELPERS[name](ctx, arg)
        value = lookup(ctx, name)
        return render(str(value), ctx, depth + 1)

    return TOKEN.sub(sub, text)


def output_path(url_path):
    rel = url_path.strip("/")
    return ROOT / rel / "index.html" if rel else ROOT / "index.html"


def asset_version():
    digest = hashlib.sha1()
    for name in ("site.css", "site.js"):
        digest.update((SRC / name).read_bytes())
    return digest.hexdigest()[:8]


def build():
    layout = (SRC / "layout.html").read_text(encoding="utf-8")
    version = asset_version()
    pages = []

    for src in sorted((SRC / "pages").glob("*.html")):
        raw = src.read_text(encoding="utf-8")
        m = FRONT_MATTER.match(raw)
        if not m:
            raise ValueError(f"{src.name}: missing JSON front matter")
        page = json.loads(m.group(1))
        page.setdefault("schema", [])
        page.setdefault("bodyClass", "")
        page["canonical"] = SITE + page["path"]
        page["sources"] = page_sources(src, raw)
        page["ogTitle"] = page.get("ogTitle", page["title"])
        page.setdefault("ogType", "website")
        page["og"] = og_card(page)
        page["ogImage"] = f"{SITE}/og/{og_slug(page)}.png"
        page["ogImageAlt"] = f"{strip_tags(page['og']['headline'])}. {CONFIG['businessName']}."
        page["meta"] = {k: esc(page[k]) for k in ("title", "description", "ogTitle", "ogImageAlt")}

        ctx = dict(CONFIG)
        ctx.update(book=booking_links(), page=page, assetVersion=version)
        body = render(raw[m.end():], ctx)
        ctx["content"] = body
        out = render(layout, ctx)

        # Mark the current section in the main nav.
        section = "/" + page["path"].strip("/").split("/")[0] + "/" if page["path"] != "/" else None
        out = re.sub(r' data-nav="([^"]*)"',
                     lambda n: ' aria-current="page"' if n.group(1) == section else "", out)

        dest = output_path(page["path"])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(out, encoding="utf-8")
        pages.append((page, dest))

    (ROOT / "styles.css").write_bytes((SRC / "site.css").read_bytes())
    (ROOT / "site.js").write_bytes((SRC / "site.js").read_bytes())
    write_sitemap(pages)
    write_llms_txt(pages)
    (ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n", encoding="utf-8")
    return pages


# ─── Open Graph cards ───

def og_slug(page):
    return page["path"].strip("/").replace("/", "-") or "home"


def og_card(page):
    """What the page's 1200x630 share image says. Package pages are built
    from the package; other pages set og.label and og.headline in their
    front matter, and fall back to the home card."""
    pkg = next((p for p in PACKAGES if p["url"] == page["path"]), None)
    if pkg:
        card = {"label": "Coaching package", "headline": pkg["name"],
                "tagline": f"{pkg['price']}, {pkg['length'][0].lower()}{pkg['length'][1:]}"}
    elif page.get("og"):
        card = {"tagline": CONFIG["businessName"], **page["og"]}
    else:
        card = {"label": CONFIG["label"], "headline": CONFIG["businessName"],
                "tagline": "Make your next move with clarity."}
    n = len(card["headline"])
    card["size"] = "96px" if n <= 28 else "76px" if n <= 48 else "62px"
    return card


def build_og_images(pages):
    import tempfile
    (ROOT / "og").mkdir(exist_ok=True)
    template = (SRC / "og-image.html").read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory() as tmp:
        for page, _ in pages:
            src = pathlib.Path(tmp) / f"{og_slug(page)}.html"
            src.write_text(render(template, {"og": page["og"]}), encoding="utf-8")
            out = ROOT / "og" / f"{og_slug(page)}.png"
            subprocess.run([
                CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                "--force-device-scale-factor=1", "--window-size=1200,630",
                "--virtual-time-budget=5000", f"--screenshot={out}", src.as_uri(),
            ], check=True, capture_output=True)
    # The home card doubles as the site-wide image used in the schema.
    (ROOT / "og-image.png").write_bytes((ROOT / "og" / "home.png").read_bytes())
    print(f"Wrote {len(pages)} Open Graph images to og/")


# ─── llms.txt: a plain summary of the site for language models ───

def write_llms_txt(pages):
    by_path = {p["path"]: p for p, _ in pages}
    def line(path, note=None):
        p = by_path[path]
        return f"- [{p.get('crumb') or p['og']['headline']}]({SITE}{path}): {note or p['description']}"
    packages = "\n".join(
        f"- [{p['name']}]({SITE}{p['url']}): {strip_tags(p['who'])} {p['price']} ({p['priceNote']}). {p['length']}."
        for p in PACKAGES)
    situations = "\n".join(line(p) for p in ("/laid-off/", "/new-manager/", "/new-role/", "/leading-through-change/", "/next-role/"))
    more = "\n".join(line(p) for p in ("/about/", "/faq/", "/for-organisations/", "/coaching/"))
    text = f"""# {CONFIG['businessName']}

> {CONFIG['personName']} is a {CONFIG['label'].lower()} based in Dublin, Ireland, working online with clients in Ireland, the UK and Europe, and in person by arrangement. {CONFIG['positioning']} {CONFIG['background']}

Prices are published and the same whoever pays, including when an employer funds the coaching. The first conversation is free: 30 minutes, online, and not a sales call. Contact: {CONFIG['email']}. Booking: {CONFIG['booking']['conversation']}

## Packages

{packages}

## Situations

{situations}

## More

{more}

## Optional

- [Privacy statement]({SITE}/privacy/)
- [The Values Finder]({CONFIG['links']['valuesFinder']}): a free 15 minute exercise to work out what matters to you at work.
- [Stuff that MattRs]({CONFIG['links']['newsletter']}): Matt's weekly newsletter.
"""
    (ROOT / "llms.txt").write_text(text, encoding="utf-8")


def page_sources(src, raw):
    """The files whose content a page shows: its own source, plus the
    package and FAQ data it pulls in. Shared layout and partials are left
    out so a footer tweak does not mark every page as changed."""
    files = [src]
    if re.search(r"\{\{\s*package", raw) or "/coaching/" in raw[:200]:
        files.append(SRC / "content" / "packages.json")
    if "faq_list" in raw:
        files.append(SRC / "content" / "faq.json")
    files += [SRC / "content" / f"faq-{name}.json" for name in re.findall(r"page_faq\s+([\w-]+)", raw)]
    return files


def last_changed(files):
    """Date of the last commit touching any of these files, or today if any
    of them has uncommitted changes (or git is unavailable)."""
    today = datetime.date.today().isoformat()
    paths = [str(f.relative_to(ROOT)) for f in files]
    try:
        dirty = subprocess.run(["git", "status", "--porcelain", "--", *paths], cwd=ROOT,
                               capture_output=True, text=True, check=True).stdout.strip()
        if dirty:
            return today
        date = subprocess.run(["git", "log", "-1", "--format=%cs", "--", *paths], cwd=ROOT,
                              capture_output=True, text=True, check=True).stdout.strip()
        return date or today
    except (OSError, subprocess.CalledProcessError):
        return today


def write_sitemap(pages):
    urls = "".join(
        f"  <url>\n    <loc>{SITE}{p['path']}</loc>\n    <lastmod>{last_changed(p['sources'])}</lastmod>\n"
        f"    <priority>{p.get('priority', '0.7')}</priority>\n  </url>\n"
        for p, _ in pages if not p.get("noindex"))
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n",
        encoding="utf-8")


# ─── Checks ───

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class PageScan(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errors = [], []
        self.ids, self.hrefs, self.headings = [], [], []
        self.labels_for, self.controls = set(), []
        self.text = []
        self.in_skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag not in VOID:
            self.stack.append(tag)
        if tag in ("script", "style"):
            self.in_skip += 1
        if "id" in a:
            self.ids.append(a["id"])
        if tag in ("a", "link") and a.get("href"):
            self.hrefs.append(a["href"])
        if tag in ("img", "script") and a.get("src"):
            self.hrefs.append(a["src"])
        if tag == "img" and "alt" not in a:
            self.errors.append(f"<img src={a.get('src')}> has no alt")
        if re.fullmatch(r"h[1-6]", tag):
            self.headings.append(int(tag[1]))
        if tag == "label" and "for" in a:
            self.labels_for.add(a["for"])
        if tag in ("input", "select", "textarea") and a.get("type") not in ("hidden", "submit"):
            self.controls.append(a.get("id"))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if tag in ("script", "style"):
            self.in_skip -= 1
        if not self.stack or self.stack[-1] != tag:
            self.errors.append(f"unexpected </{tag}> (open: {self.stack[-3:]})")
            if tag in self.stack:
                while self.stack and self.stack.pop() != tag:
                    pass
            return
        self.stack.pop()

    def handle_data(self, data):
        if not self.in_skip:
            self.text.append(data)


def check(pages):
    problems, warnings = [], []
    scans = {}
    for page, dest in pages:
        text = dest.read_text(encoding="utf-8")
        scan = PageScan()
        scan.feed(text)
        scans[dest] = scan
        name = dest.relative_to(ROOT)
        for e in scan.errors:
            problems.append(f"{name}: {e}")
        if scan.stack:
            problems.append(f"{name}: unclosed tags {scan.stack}")
        if "{{" in text:
            problems.append(f"{name}: unrendered template token")
        dupes = {i for i in scan.ids if scan.ids.count(i) > 1}
        if dupes:
            problems.append(f"{name}: duplicate ids {sorted(dupes)}")
        if scan.headings.count(1) != 1:
            problems.append(f"{name}: has {scan.headings.count(1)} h1 elements")
        for prev, cur in zip(scan.headings, scan.headings[1:]):
            if cur > prev + 1:
                problems.append(f"{name}: heading jumps from h{prev} to h{cur}")
                break
        for control in scan.controls:
            if not control or control not in scan.labels_for:
                problems.append(f"{name}: form control {control!r} has no <label for>")
        visible = " ".join(scan.text)
        if re.search(r"\s&\s", visible):
            warnings.append(f"{name}: visible '&' in copy; the house style is 'and'")

    for f in [d for _, d in pages] + [ROOT / "styles.css", ROOT / "site.js"]:
        body = f.read_text(encoding="utf-8")
        for dash, label in (("—", "em-dash"), ("–", "en-dash")):
            if dash in body:
                line = body[:body.index(dash)].count("\n") + 1
                problems.append(f"{f.relative_to(ROOT)}:{line}: contains an {label}")

    # Every internal link and anchor must resolve to a built file and id.
    for page, dest in pages:
        for href in scans[dest].hrefs:
            if re.match(r"^(https?:|mailto:|tel:|data:)", href):
                continue
            path, _, frag = href.partition("#")
            path = path.split("?")[0]
            if path == "":
                target = dest
            elif path.startswith("/"):
                target = ROOT / path.lstrip("/")
                if path.endswith("/") or target.is_dir():
                    target = target / "index.html"
            else:
                target = dest.parent / path
            if not target.exists():
                problems.append(f"{dest.relative_to(ROOT)}: broken link {href}")
                continue
            if frag and target in scans and frag not in scans[target].ids:
                problems.append(f"{dest.relative_to(ROOT)}: link {href} points at a missing id")

    # Search results cut titles at about 60 characters and descriptions at 155.
    for page, dest in pages:
        for field, limit in (("title", 60), ("description", 155)):
            if len(page[field]) > limit:
                warnings.append(f"{dest.relative_to(ROOT)}: {field} is {len(page[field])} characters (limit {limit})")

    for page, dest in pages:
        if not (ROOT / "og" / f"{og_slug(page)}.png").exists():
            problems.append(f"{dest.relative_to(ROOT)}: og/{og_slug(page)}.png is missing; run build.py --og")

    titles = [p["title"] for p, _ in pages]
    descs = [p["description"] for p, _ in pages]
    for label, values in (("title", titles), ("description", descs)):
        for v in {v for v in values if values.count(v) > 1}:
            problems.append(f"duplicate {label}: {v}")

    return problems, warnings


def placeholders():
    found = []
    for f in sorted(SRC.rglob("*")):
        if f.is_file() and f.suffix in (".html", ".json", ".css", ".js"):
            for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
                for m in PLACEHOLDER.finditer(line):
                    found.append(f"{f.relative_to(ROOT)}:{n}: {m.group(0)}")
    return found


def main():
    pages = build()
    if "--og" in sys.argv:
        build_og_images(pages)
    print(f"Built {len(pages)} pages:")
    for page, dest in pages:
        print(f"  {page['path']:<40} {dest.relative_to(ROOT)}  ({dest.stat().st_size / 1024:.1f} KB)")
    problems, warnings = check(pages)
    for w in warnings:
        print(f"warning: {w}")
    marks = placeholders()
    if marks:
        print(f"\n{len(marks)} placeholders to fill:")
        for m in marks:
            print(f"  {m}")
    problems = list(dict.fromkeys(problems))
    if problems:
        print(f"\n{len(problems)} problems:")
        for p in problems:
            print(f"  {p}")
        sys.exit(1)
    print("\nChecks passed.")


if __name__ == "__main__":
    main()
