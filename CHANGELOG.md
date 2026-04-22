# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Quote auto-pair no longer doubles up when the caret is inside a string literal. Typing `'` inside `"..."`, `"` inside `'...'`, or either inside a backtick template's text now inserts a single literal character. The step-past-the-closer shortcut is now gated to the string's own delimiter at its closer position — previously a stray quote char that happened to sit at the caret (e.g. `'` in the middle of a double-quoted string) could trigger step-past when typed. Outside strings, the original pair-and-caret-between behavior is unchanged.

## [0.6.1] - 2026-04-21

### Fixed

- Autocomplete dropdown now opens inside a function call when the caret sits between a separator and a closer with whitespace between them — e.g. `IF(something, |)` behaves the same as `IF(something,|)`. Previously the cursor-at-token-start check matched the closing `)` first and fell through to "inside a literal → none", suppressing suggestions. The context classifier now also consults the preceding token when there's a whitespace gap and the preceding token is a separator/operator/`(` — so whitespace before `)` no longer hides the function-arg context.

## [0.6.0] - 2026-04-21

### Added

- `requireTemplateVars` compile option. When `true`, every template interpolation is treated as if wrapped in `REQUIRE()` — a blank value (null, undefined, "") anywhere in a template bails the whole formula to `null`. Default `false`, so existing formulas are unaffected. Implemented as a compile-time AST rewrite so there's no per-eval overhead and the existing REQUIRE semantics (including IFERROR-immunity) apply unchanged.
- `OPTIONAL(x)` builtin. Identity function used as a marker at the top of a template interpolation to opt out of `requireTemplateVars` for that one interp — e.g. `` `{firstName} {OPTIONAL(middleName)} {lastName}` `` renders `middleName` as blank instead of bailing. Outside that role it's a no-op. Explicit `REQUIRE(x)` and `BAIL()` at the top of an interp are similarly left alone by the auto-wrap.
- Alt+Shift+ArrowRight / ArrowLeft expands and shrinks the editor selection through the AST hierarchy — caret → innermost token → enclosing expression → parent → … → whole formula. Any other keypress resets the expansion ladder. AST nodes now carry optional `start`/`end` offsets (set by the parser) to support this and future position-aware tooling.

## [0.5.0] - 2026-04-21

### Added

- Template interpolation brace auto-close. Typing `{` with no selection in **template text** (between `` ` `` or `}` and `{` or `` ` ``) pairs it to `{}` with the caret between — e.g. `` `hello|` `` + `{` yields `` `hello{|}` ``. Inside an interpolation's expression space (including nested string literals like `` `{'|'}` ``) `{` stays a plain character, so string contents aren't surprised by pairing. Typing `}` right before an existing `}` while inside an interpolation steps past it rather than stacking a new one, so `` `{foo|}` `` + `}` yields `` `{foo}|` `` instead of `` `{foo}}` ``.

## [0.4.0] - 2026-04-17

### Added

- String-delimiter auto-close. Typing `` ` ``, `"`, or `'` with no selection inserts the pair and places the caret between. If the caret already sits right before a matching closer, typing the same char steps past it instead of stacking a new pair — so typing the natural closer at the end of a string works as expected rather than producing doubled delimiters.
- `reopenDropdownOnClick` prop on `<FormulaEditor>`. When `true`, clicking inside an already-focused editor re-opens the autocomplete dropdown at the new caret position. Previously enabled unconditionally; now **off by default** so the click gesture doesn't surprise users who didn't opt in.
- Autocomplete dropdown now auto-dismisses when the caret moves (via click or arrow-key navigation) to a position with no applicable suggestions or signature hint — e.g. into template text, inside a number literal, or past the end of an expression. Typing paths already reconciled dropdown visibility; this closes the loop for caret-only moves.

### Changed

- **Breaking:** The click-to-reopen-dropdown behavior added in [0.3.0] is now gated behind the new `reopenDropdownOnClick` prop and defaults to off. Pass `reopenDropdownOnClick` to restore the earlier behavior.

## [0.3.0] - 2026-04-17

### Added

- Hover tooltip on function-name tokens in the editor. After a short delay, hovering a function name (`ROUND`, `IF`, etc.) shows a floating box with the signature and description, reusing the same `SignatureHint` component (and styling) as the autocomplete dropdown's parameter header — so the visual language stays consistent between hover and in-call hints. Positioned above the hovered token via a portal.
- `FormulaEditorHandle` now exposes `isDropdownOpen()` and `getSelectedSuggestion()` so consumers can observe autocomplete state imperatively (e.g. to intercept Enter only when no suggestion is highlighted).
- Clicking inside the editor while it already has focus reopens the autocomplete dropdown if the new caret position would yield suggestions. The first click (the one that focuses the editor) does nothing extra — only re-clicks on an already-focused editor reopen the dropdown. Active drag-selections are skipped.
- `{` is now an auto-wrap trigger alongside `(`, `[`, `"`, `'`, and `` ` ``. Typing `{` with an active selection wraps it as `{…}` — convenient for converting literal text inside a template (`` `Hello world` `` → `` `Hello {world}` ``) into an interpolation.

### Fixed

- Missing validation squiggle for trailing binary operators (e.g. `ABS(price * quantity) + `). The parser raised a zero-width parse error at EOF, which the squiggle renderer filtered out (`r.width < 1`). The validator now re-anchors zero-width EOF errors to the last non-EOF token with the message "Unexpected end of formula", so the `+` gets a red squiggle. Unclosed-paren cases are unchanged — they still emit a targeted error at the opening `(` instead of at the end.

### Changed

- **Breaking:** Registered functions now receive a `FunctionContext` as their first argument. The context exposes `row` (the row currently being processed) and `column` (the name of the formula column being evaluated). Previous signature `(...args) => unknown` becomes `(ctx, ...args) => unknown`. Motivated by functions that need to consult row state beyond their explicit arguments (e.g. cross-column lookups).

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

[Unreleased]: https://github.com/krtools/grid-formula-editor/compare/v0.6.1...HEAD
[0.6.1]: https://github.com/krtools/grid-formula-editor/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/krtools/grid-formula-editor/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/krtools/grid-formula-editor/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/krtools/grid-formula-editor/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/krtools/grid-formula-editor/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/krtools/grid-formula-editor/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/krtools/grid-formula-editor/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/krtools/grid-formula-editor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/krtools/grid-formula-editor/releases/tag/v0.1.0
