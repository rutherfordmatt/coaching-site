# Staging

staging.mattrutherfordcoaching.com is a password-protected copy of the whole
site, built from a work branch, so that changes can be tested before they reach
the live site. It is the only place a work branch is deployed.

## How a staging build differs

`python3 build.py --staging` lays `src/config.staging.json` over
`src/config.json`. In a staging build:

- the site URL, and so every canonical link, Open Graph URL and sitemap entry,
  uses the staging hostname;
- every page has `noindex, nofollow`, and `robots.txt` disallows everything;
- the Umami tag reports to the staging website in Umami, and only from the
  staging hostname;
- booking links from the Clarity Check carry `utm_medium=staging`, so tester
  bookings can be told apart in Calendly. They still go into the real calendar.

Anything else that should differ on staging belongs in `config.staging.json`,
not in a page or the layout.

## Working on a branch

1. Branch from `main`. Never commit work in progress to `main`.
2. Before each commit on the branch, run `python3 build.py --staging`, so the
   generated files in the branch are the staging build that Coolify deploys.
3. Push the branch. The staging app in Coolify deploys it.

## Before merging to main

The branch holds a staging build, which must never reach the live site.

1. Run `python3 build.py` with no flag, and commit the result.
2. Check that `robots.txt` allows crawlers and that `index.html` has
   `index, follow` and the live hostname in its canonical link.
3. Run `git diff main --stat` and confirm it shows only the changes you meant
   to make. A file you did not touch means something from staging is still
   there.
4. Merge only when Matt says so.

## How the staging app is set up

- **DNS:** an A record for `staging` pointing at the same server as the live
  site.
- **Coolify:** a second application from the same repository, with the branch
  set to the work branch and the domain set to
  `https://staging.mattrutherfordcoaching.com`. Coolify issues the certificate.
- **Password:** HTTP basic authentication on the staging application in
  Coolify (one shared username and password for testers). The live
  application is untouched.
- **Umami:** a separate website in Umami for the staging hostname. Its id is
  in `config.staging.json`.

The `noindex` tags and `robots.txt` are a second line of defence. The password
is what keeps staging private.
