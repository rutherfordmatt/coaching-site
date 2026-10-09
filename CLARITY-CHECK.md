# The Clarity Check: hand-over note

The free five minute assessment at `/clarity-check/`, built on the
`clarity-check` branch and tested on staging (see `STAGING.md`). The brief and
the master copies of the content, scoring and tests are in Matt's
`Documents/Claude/clarity-check` folder.

## What is where

- `src/pages/clarity-check.html`: the landing page, which is static HTML and
  readable without JavaScript.
- `src/clarity-check.js`: the question and result screens, saved progress,
  the browser back button, the analytics events and the print title.
- `src/clarity-check.css`: everything for the page, prefixed `cc-`,
  including the print layout. `site.css` is unchanged.
- `src/clarity-check-scoring.js` and `src/clarity-check-scoring.test.js`:
  copied unchanged from the master folder. `python3 build.py` runs the tests
  and fails if they fail, so it needs Node.
- `src/content/clarity-check.json`: all the wording. Copy a new version over
  it from the master folder when the wording changes; nothing else needs to
  change.

Questions and results are always read through `questionFor()` and
`buildResult()`, so the tile's group decides the wording, the options and the
possible results.

## Analytics

Umami events, with ids only and never written answers: `cc-tile`,
`cc-start`, `cc-answer`, `cc-text`, `cc-complete`, `cc-book`, `cc-package`,
`cc-newsletter`, `cc-save` and `cc-restart`. `cc-start`, `cc-answer` and
`cc-complete` also carry the group. The booking link carries
`utm_source=clarity-check` and `utm_content=<result>-<situation>` (plus
`utm_medium=staging` on staging). The newsletter link on the result is
`links.newsletterSignup`, which opens the sign-up box on mattrutherford.co.uk
with `ref=clarity-check`.

## Left out of version one

No server, so: no emailed copy of the result, no newsletter tick box, no
answers stored anywhere except as analytics events, and no written answers
sent to Matt when someone books. "Save or print a copy" uses the browser's
print dialog instead.

The browser back button steps back one question within a visit. After a
refresh there are no earlier steps in the browser's history, so it leaves the
page; the on-page Back button still works.

Every answer button is at least 44px tall. On the smallest phones (an iPhone
SE in Safari, or a 360 by 640 Android with the browser bars showing), the
five answers to question 5 need a short scroll to see the last one.

The printed copy fits one A4 page in Chrome for every result, with or without
written answers. Safari, phones and US Letter paper may lay it out a little
differently.

## Before launch

- Matt to approve the privacy wording and remove the two `[CONFIRM: ...]`
  placeholders in `src/pages/privacy.html`.

## Launch-day steps (2 November 2026)

1. Rebuild without the staging flag and merge to `main` (see `STAGING.md`).
2. Remove `noindex` from the page's front matter.
3. Add links to the Clarity Check from the home page "Is this you?" section,
   the footer and the five situation pages.
4. Add it to `llms.txt`.
5. Check the events arrive in the live Umami site.
6. Decide whether the footer newsletter link should use the sign-up address
   too.
