# Electron Dossier Markdown Smoke Checklist

## Setup

- Run `pnpm dev:cdp`.
- Open `Dossier / People`, `Groups`, `Places`, and `Timeline`.

## Core Checks

- Confirm each dossier home keeps search/filter/table layout.
- Click a file in the left sidebar dossier tree and verify the markdown panel opens.
- Click `View` in each dossier home table and verify the selected markdown opens.
- Click a `[[wikilink]]` inside the markdown panel and verify resolved navigation opens the target file.
- Validate unresolved wikilink shows warning state instead of crashing navigation.

## Watch Refresh

- Open one document in the markdown panel.
- Edit the same file in `lab/agent/filesystem/dossier/...` and save.
- Confirm the panel refreshes automatically with updated content.
- Delete the opened file and confirm deleted-state warning appears.
