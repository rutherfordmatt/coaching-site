# CLAUDE.md: mattrutherfordcoaching.com

Static site. Source in `src/`, built by `build.py` into the folders at the root,
which nginx serves as they are (Coolify runs no build step). Details of the
staging build are in `STAGING.md`.

## Branches: the rule

- `main` is production. The live Coolify app deploys `main`.
- `staging` is permanent. The staging Coolify app deploys `staging`, always.
- Never repoint the staging app at another branch. Sprint work goes on
  `staging` (or on a short branch merged into `staging`), never on a branch of
  its own that staging is pointed at.
- Nothing reaches `main` without Matt's yes.
- `brand-alignment` and `aeo-audit` are old staging branches from before this
  rule (27 Nov 2026). Neither holds work that is not on `main`.

## The cycle

1. On `staging`: make the change in `src/` (or `build.py`), run
   `python3 build.py --staging`, commit, push. Staging deploys by itself.
2. Matt checks staging.mattrutherfordcoaching.com.
3. On Matt's yes, merge to `main` as set out in `STAGING.md` ("Before merging
   to main"): the commit that lands on `main` must hold a live build
   (`python3 build.py`, no flag), never the staging build.
4. Push `main`, then run `scripts/indexnow.sh`.
5. Back on `staging`: merge `main` in, run `python3 build.py --staging`,
   commit and push, so staging matches live again.

## Other rules

- Coolify settings go through Matt. For a shell on the server use SSH and
  `docker exec`, never the Coolify web terminal.
- Keep copy changes to what was asked; show proposed copy before changing it.
