# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-04-17

### Fixed

- Invisible gap below the editor in inline layouts. The container was `display: inline-block`, which participates in baseline alignment; combined with `overflow-x: auto` on the editable div (whose baseline then becomes its bottom margin edge per CSS 2.1), the inline-block's baseline was pushed down, leaving a gap below the input. Switched the container to `display: block` — it had `width: 100%` anyway, so no layout change for normal usage.
- Bracket-column autocomplete when the user has pre-typed brackets. Previously `[pri` + complete produced `price]` (the opening `[` was clobbered), and `[pri]` with the caret before the `]` produced `[price]]` (the trailing `]` was duplicated). The replacement now starts after the opening `[` and swallows an existing trailing `]` when present.

## [0.2.1] - 2026-04-16

### Fixed

- Build output no longer imports from `react/jsx-runtime`, which doesn't exist in React 16.x. The library advertises `react >= 16.8` as a peer dep, but 0.2.0 (and 0.1.0) were built with the automatic JSX runtime and failed to load under React 16. Switched to the classic transform (`React.createElement`) so the advertised peer range actually works.

## [0.2.0] - 2026-04-16

### Added

- Self-column-references: a formula may reference the column it's defining (e.g. `price: 'price * 1.1'`). The reference resolves to the column's pre-formula input value, taken from a per-row snapshot built at the start of `process(row)`. `SELF()` is provided as a rename-safe alias for the same behavior.

### Changed

- Dependency cycle detection now ignores self-edges. A formula like `price: 'price + 1'` no longer triggers `CIRCULAR_REFERENCE` — it's a self-transform, not a cycle. Mutual cycles (A → B → A) are still rejected.
- Autocomplete caret placement: for zero-arg functions (`BAIL()`, `SELF()`), the caret is placed after the closing paren on insert. Functions with parameters still get the caret placed between the parens so the user can start typing the first argument.
- Matching-paren highlighting is suppressed when the open/close parens are adjacent (empty body, e.g. `BAIL()`). Highlighting a pair with nothing between them added no information and produced a visual artifact at the span boundary.

### Fixed

- Matching-paren highlight occasionally rendered as a 2px stripe on the left edge of a paren (e.g. the outer `)` in `(SELF())`). The rect measurement used `getClientRects()[0]`, which returned a leading zero-width rect at the span boundary when the range started at the end of the prior token's text node. Switched to `getBoundingClientRect()`, which unions the fragments and returns the correct glyph bounds.

## [0.1.0] - 2026-04-16

Initial release.

### Formula engine

- Tokenizer, parser, and evaluator for spreadsheet-style formula expressions
- Arithmetic (`+`, `-`, `*`, `/`, `%`, `^`), comparison (`=`, `!=`, `<`, `>`, `<=`, `>=`), logical, and string-concat (`&`) operators
- Column references as bare identifiers (`price`) and bracketed identifiers (`[First Name]`) for names with spaces
- Template literals: backticks with `{expr}` interpolations, e.g. `` `Hello {firstName}, total: {ROUND(total, 2)}` ``
- Column dependency extraction via `extractColumnRefs`
- Built-in functions: `IF`, `ROUND`, `CONCAT`, `AND`, `OR`, `NOT`, `SUM`, `AVG`, `MIN`, `MAX`, and more
- `BAIL()` — forces the whole formula to render blank (null), uncatchable by `IFERROR`. For terminating evaluation from deep inside nested expressions when a precondition fails. Implemented via an eval-context flag rather than a thrown sentinel.
- `REQUIRE(value)` — returns `value` if present, otherwise bails the whole formula. Blankness matches `ISBLANK` semantics (`null`, `undefined`, `""`). Ergonomic for templates where one missing ingredient should make the whole output blank — e.g. `` `https://example.com/users/{REQUIRE(userId)}` ``.
- Fault-tolerant tokenizer (`tokenizeSafe`) that surfaces partial tokens for editor squiggles
- Typed AST with exported `ASTNode` union

### Editor (React)

- `<FormulaEditor>` component with syntax highlighting via `contentEditable`
- Controlled and uncontrolled modes; imperative handle with `getValue`, `setValue`, `focus`, `blur`
- Autocomplete dropdown for columns and functions with prefix and substring matching
- Parameter hints that track the current argument index inside function calls
- Validation squiggles for unknown columns, unknown functions, unclosed parens, and unclosed template interpolations
- Matching paren / interpolation brace highlighting at the caret (VS Code–style)
- Auto-wrap selection on `(`, `[`, `"`, `'`, `` ` ``
- Auto-inject closing paren on function autocomplete, with caret placed between the parens (skipped when parens already follow)
- Keyboard shortcuts: Ctrl+Space (trigger autocomplete), Tab/Enter (insert), Arrows, PageUp/PageDown, Home/End
- Dropdown auto-select deferred until the user types a filter-extending character — structural keystrokes (operators, parens, quotes, auto-wrap) leave the dropdown unselected so Enter/Tab can't insert a random match
- Undo/redo with typing-group coalescing
- Dark mode support via CSS custom properties

### Packaging

- Single npm package `@krllc/table-formulas` with formula engine and editor as separate named exports
- TypeScript declarations bundled
- `prepublishOnly` gate runs typecheck + unit tests + browser tests before every publish
- `prepack` builds fresh `dist/` on publish so tarballs are always current
- MIT license

[Unreleased]: https://github.com/krtools/grid-formula-editor/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/krtools/grid-formula-editor/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/krtools/grid-formula-editor/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/krtools/grid-formula-editor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/krtools/grid-formula-editor/releases/tag/v0.1.0
