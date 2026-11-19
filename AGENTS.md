# AGENTS.md

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `giovannilondero/sparedut`, used through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels are used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Showcase pictures

`client/public/showcase/` holds the pictures that show the game off outside a match: the link preview, and the install prompt's screenshots that the manifest lists (a match and the menu, on a phone and on a computer). `scripts/showcase.ts` takes them from the running game; CI has no browser, so take them again by hand in the same change whenever it touches a look, the HUD or the touch controls, or the menu. Look at each picture before committing it, and attach it to the pull request.
