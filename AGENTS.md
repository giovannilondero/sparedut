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

## Versions

The game's version is `version` in `package.json` (SemVer, `0.x` while the game is pre-1.0), and nowhere else: the build stamps it, with the short commit SHA, into the client and the Worker (`shared/version.ts`, `scripts/game-version.ts`), and the menu's home screen shows it (`dev` on the dev server). After a deploy on `main`, CI tags the commit `vX.Y.Z` and publishes a GitHub Release; a merge without a bump releases nothing.

Bump it by hand in the pull request that ships, following its conventional-commit title: **minor** (`0.6.0` → `0.7.0`) for a `feat:`, something a player can see or do that they could not before; **patch** (`0.6.0` → `0.6.1`) for a `fix:` or `perf:`. Changes a player cannot notice (`docs:`, `test:`, `chore:`, `ci:`, `refactor:`) need no bump.

`PROTOCOL_VERSION` (`shared/protocol.ts`) is a separate decision: it says which client and server can play together, and changes only when the protocol breaks. A release does not have to change it, and changing it does not need a release of its own.
