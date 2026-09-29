# Command reference

## Palette and context menus

Every ID below has the `two-way-table-of-contents:` prefix. Assign optional hotkeys through Obsidian settings.

| ID | Action |
|---|---|
| `insert-toc` | Insert a TOC through a dialog; editor only |
| `edit-toc` | Edit a selected TOC, preserving comments, unknown options and untouched values |
| `find-heading` | Search included heading labels, numbers, levels and parent context |
| `back-to-toc` | Return to the first TOC; Reading view |
| `previous-heading` / `next-heading` | Navigate included headings; do not wrap at the ends |
| `expand-all` / `collapse-all` / `reset-folds` | Set temporary branch state; Reading view; never save global defaults |
| `copy-toc-markdown` / `copy-toc-text` | Copy all included entries, even folded ones |
| `copy-heading-link` | Copy the current included heading link |
| `copy-section` | Copy its original heading and descendants, until the next equal/shallower heading |
| `copy-section-toc` | Copy descendants only, retaining document numbering |
| `inspect-toc` | Show effective settings, their source, and diagnostics |
| `show-options` | Show block option syntax and ranges |

The cursor-containing block takes precedence in the editor. Otherwise use the explicit context-menu target, a valid last-focused TOC, the sole TOC, or a choice dialog. Returning always uses the first TOC. Copying and navigation use the current editor content in editing mode; Reading view uses the saved file. The previous-heading command goes to the current section heading from its body, or the preceding heading when already at a heading.

Only numbers navigate. Title text stays selectable. Context menus provide per-branch expand/collapse, in addition to palette actions. Previewing headings requires Obsidian Page preview and respects its modifier/source preferences. Copying links cannot guarantee distinct external destinations for duplicate heading text; Markdown copies show a warning for this case.

Explicit **Reset overrides** removes known appearance options, including invalid values and duplicates. Ordinary edits preserve untouched invalid rows. Comments, unknown options and ignored legacy options remain. Unclosed TOC fences produce `UNCLOSED_BLOCK` diagnostics and cannot be edited through the dialog.

Heading snapshots exclude Obsidian block comments, HTML blocks/comments, code and quoted headings. Labels omit balanced inline comments while source heading identities remain available for navigation. `section` returns the original source, so comments inside that section remain in its text.

## Official CLI

These are registered CLI handlers, not arguments to the generic `command id=...` palette runner. Obsidian, CLI, and this plugin must be enabled. All handlers return a JSON string and never write notes, settings, or the clipboard. File-backed commands read the saved file (`sourceKind: "vault-file"`), not unsaved editor text.

```sh
obsidian vault="My Vault" two-way-table-of-contents:inspect path="Notes/example.md"
obsidian vault="My Vault" two-way-table-of-contents:validate path="Notes/example.md" blockLine=8
obsidian vault="My Vault" two-way-table-of-contents:section path="Notes/example.md" headingLine=42 expectedHash="<sourceHash from inspect>" maxChars=12000
obsidian vault="My Vault" two-way-table-of-contents:block title="Contents" depth=3 guides=true
obsidian vault="My Vault" two-way-table-of-contents:export path="Notes/example.md" style=markdown
```

| Handler | Parameters | Result |
|---|---|---|
| `inspect` | Required `path`; optional `blockLine` | Heading text, included status, labels, numbers, parents, global settings, TOC blocks and effective block settings |
| `validate` | Required `path`; optional `blockLine` | `valid`, TOC presence, heading counts, error/warning diagnostics with block and option lines |
| `section` | Required `path`, `headingLine`, `expectedHash`; optional `maxChars` | Section source, `startLine`, `endLineExclusive`, total length, truncation flag |
| `block` | Optional `title`, `position`, `scale`, `border`, `background`, `collapsible`, `branches`, `depth`, `guides` | A fenced `tw-toc` string containing only explicit overrides |
| `export` | Required `path`; optional `blockLine`, `style=markdown\|text` | Static outline, output style, duplicate-link warnings |

Paths are exact vault-relative Markdown file paths. Lines are 1-based. `blockLine` means the opening code-fence line. Without it, inspect/validate return all blocks; with it, they reject a missing block. Export uses the shared document heading range and numbering; block appearance does not change exported text.

`section` includes the selected heading and descendants. A stale SHA-256 returns `STALE_SOURCE`; callers should inspect again before using new line numbers. `maxChars` defaults to 20,000 and accepts 1–1,000,000 UTF-16 code units. Inspect returns at most 5,000 heading records with `headingCount` and `truncated`; it does not fabricate current window visibility.

Success returns `schemaVersion: 1`, `pluginVersion`, and `ok: true`. File results include `path` and `sourceHash`. A validation result can have `ok: true` and `valid: false`: the command succeeded and found invalid options. Failures return `ok: false` and `error: {code, message}`.

Error codes include `INVALID_PATH`, `FILE_NOT_FOUND`, `UNKNOWN_ARGUMENT`, `INVALID_ARGUMENT`, `INVALID_OPTION`, `BLOCK_NOT_FOUND`, `HEADING_NOT_FOUND`, `STALE_SOURCE`, and `READ_FAILED`. JSON errors are distinct from the CLI process exit status; errors before Obsidian invokes a handler may use the core CLI's own format.

The ordinary `outline path=... format=json` command remains useful when plugin-specific numbering, overrides, or diagnostics are unnecessary.

## Setting provenance

Each setting reports `value` and `source` (`default`, `global`, or `block`). Only accepted input determines the source. Invalid global input that falls back to the default reports `default`; an invalid block override falls back to the valid global value or default. Rejected input is available in the optional `rejectedInputs` array, with `source`, `input`, and `reason` (`INVALID_SETTING` or `INVALID_OPTION`). This is additive to schema version 1.
