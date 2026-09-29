# Release preparation

## Build and package

Use Node.js 22.13 or newer. Keep `package.json`, `package-lock.json`, and `manifest.json` versions aligned. Add each release's minimum app version to `versions.json`.

```sh
npm ci --ignore-scripts
npm run package -- /absolute/path/to/release-assets
```

This runs the official Obsidian ESLint recommended checks, type checks, tests, and the build, then copies `main.js`, `manifest.json`, and `styles.css` with SHA-256 checksums to the requested directory. It does not upload or publish anything.

## Verify in Obsidian

Use a backed-up test vault. Check:

- Default theme and the intended custom theme, light and dark, narrow panes, and text scaling.
- Arrow clicks and keyboard Enter/Space, visible focus, hidden descendants absent from tab order, and accurate expanded state.
- Numeric heading limits (0, 1, 3, 6), no in-box selector, independent branches, whole-table collapse, multiple tables, and separate views/windows.
- Body-to-TOC return opens only target ancestors; TOC-to-body navigation honors body expansion settings.
- Duplicate headings, skipped levels, title edits, insertion/deletion, switching documents, and plugin unload/reload.
- Invalid range/position/size inputs do not save; transparency restores the chosen color; insertion cancellation leaves source unchanged.
- Existing `data.json` values survive upgrades. Korean and English UI preserve saved titles.

Compare installed files to the packaged hashes. Unit tests do not establish app or theme compatibility by themselves.

## Expanded command checks

- Editing preserves comments, unknown options, CRLF, and untouched values; cancel and stale-source rejection never overwrite notes.
- Search distinguishes duplicate headings; escape restores focus; previous/next use the current editor or reading position.
- Context-menu and palette operations target the intended table or ask for selection. Fold/reset operations are idempotent.
- Copies and CLI exports retain global numbering and folded entries. Inspect/validate report the same settings as the UI.
- The five CLI handlers return JSON; wrong paths, invalid flags, missing blocks and stale hashes are distinguishable. CLI reads do not change notes/settings.
- Highlight, guides and modifier-hover preview work with Page preview enabled. New settings are off by default.

## Official review and tools

Check the [official submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins) and [developer policies](https://docs.obsidian.md/community-directory/developer-policies) before each release. The local ESLint gate checks source and package.json; license recognition, name availability, release attachments and remote build verification need separate checks. The current preset has an Obsidian peer-version override to reuse our supported API declarations; keep the inspector and ESLint dependencies compatible when updating them.

The community scanner uses the first available build script from `build`, `build:plugin`, `compile`; keep `build` a production build. Use the directory’s **Review branch** after connecting the repository to check a branch, tag or SHA before releasing. Local tests are not a substitute for this scan or actual app checks.

For beta testing, the official documentation recommends the third-party BRAT plugin. Beta distribution is optional and does not replace community approval. Test in a backed-up test vault and report OS/app/theme evidence separately.

## Publish

Commit the reviewed source, README, LICENSE, notices, and manifest to the public repository. Create a release whose tag **exactly matches** `manifest.json` (for the first release, `0.1.0`, without `v`). Upload the three plugin files as release attachments.

Submit through the [Obsidian Community directory](https://docs.obsidian.md/plugins/releasing/submit-plugin), following its account and GitHub ownership checks. Check the [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins) at submission time. Respond to review feedback in a new version.

## Roll back a local installation

Disable the plugin, restore the backed-up three plugin files and `data.json`, then enable it again. Preserve the source note; folding never rewrites heading text.
