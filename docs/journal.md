# Journal Preview

Cyberboss can reuse the source-available `BomBomLab/Journal` frontend as a
local, static visual journal for your existing timeline and diary data.

The build is intentionally static:

- source template: `templates/journal`
- private generated site: `~/.cyberboss/journal/public`
- private generated bundle data: `~/.cyberboss/journal/build`
- local preview server: `127.0.0.1`, static files only

## Build

```bash
npm run journal:build
```

The builder reads:

- `~/.cyberboss/timeline/timeline-state.json`
- `~/.cyberboss/diary/*.md`
- optional `~/.cyberboss/timeline/todos.json` or `~/.cyberboss/todos.json`

If no todos file exists, the builder uses an empty todo map.

## Preview

```bash
npm run journal:preview
```

Open:

```text
http://127.0.0.1:8767/Journal.html
```

Use another port when needed:

```bash
npm run journal:preview -- 8768
```

## Custom Paths

```bash
CYBERBOSS_STATE_DIR=/path/to/state npm run journal:build
CYBERBOSS_JOURNAL_DIR=/path/to/output npm run journal:preview
```

Advanced overrides:

```bash
JOURNAL_TIMELINE_STATE_FILE=/path/to/timeline-state.json npm run journal:build
JOURNAL_DIARY_DIR=/path/to/diary npm run journal:build
JOURNAL_TODOS_FILE=/path/to/todos.json npm run journal:build
```

## Notes

This integration keeps personal data out of the repository by writing generated
runtime files under `~/.cyberboss/journal`. Do not expose the preview server on
a public interface unless you have added your own access control.

The vendored Journal code is licensed for personal, non-commercial use. The
license text is preserved at `templates/journal/LICENSE` and copied into the
generated output as `JOURNAL-LICENSE`.
