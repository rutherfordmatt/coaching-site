# The Clarity Check: hand-over note

The free five minute assessment at `/clarity-check/`, built on the
`clarity-check` branch and tested on staging (see `STAGING.md`). Version one
went live on 14 October 2026. The repository is now the source of truth for the
content, scoring and tests; the copies in Matt's `Documents/Claude/clarity-check`
folder are out of date and should not be copied in again.

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
  change. One exception for now: the wording for keeping the result ("Copy my
  result", "Share my result", "Copied", "Print or save as PDF", its help line
  and the clipboard-blocked message) is in `KEEP` at the top of
  `clarity-check.js`. Move it into the content file's labels the next time
  that file is regenerated, and drop the old `labels.save`.

Questions and results are always read through `questionFor()` and
`buildResult()`, so the tile's group decides the wording, the options and the
possible results.

## Analytics

Umami events, with ids only and never written answers: `cc-tile`,
`cc-start`, `cc-answer`, `cc-text`, `cc-complete`, `cc-book`, `cc-package`,
`cc-newsletter`, `cc-save` and `cc-restart`. `cc-start`, `cc-answer` and
`cc-complete` also carry the group, and `cc-save` carries `how`: `print`,
`copy` or `share`. The booking link goes to `/book/` and carries
`utm_source=clarity-check` and `utm_content=<result>-<situation>` (plus
`utm_medium=staging` on staging). `/book/` passes those tags on to Calendly,
in the embedded calendar and in its fallback link, which is what the privacy
statement relies on. The newsletter link on the result is
`links.newsletterSignup`, which opens the sign-up box on mattrutherford.co.uk
with `ref=clarity-check`. Those two links open in a new tab, so the result
stays in view; links that stay on the site open in the same tab.

## Left out of version one

No server, so: no emailed copy of the result, no newsletter tick box, no
answers stored anywhere except as analytics events, and no written answers
sent to Matt when someone books. Visitors keep the result themselves: "Copy
my result" copies it as plain text ("Share my result" opens the share sheet
on phones and tablets), and "Print or save as PDF" opens the print dialog.

The browser back button steps back one question within a visit. After a
refresh there are no earlier steps in the browser's history, so it leaves the
page; the on-page Back button still works.

Every answer button is at least 44px tall. On the smallest phones (an iPhone
SE in Safari, or a 360 by 640 Android with the browser bars showing), the
five answers to question 5 need a short scroll to see the last one.

The printed copy fits one A4 page in Chrome for every result, with or without
written answers. Safari, phones and US Letter paper may lay it out a little
differently.

## Where it is linked from

The home page "Is this you?" section, the five situation pages (under the
"When a conversation helps" button), the coaching page (under the package
cards), the footer's free tools list, one FAQ question ("How do I know which
kind of coaching I need?") and `llms.txt`. It is not in the main navigation.

## Still open

- Matt to recreate the four-step funnel (page view, `cc-start`,
  `cc-complete`, `cc-book`) on the live Umami site.
- Whether the footer newsletter link should use the sign-up address too.
