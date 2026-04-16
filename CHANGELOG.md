# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `BAIL()` function: forces the entire formula to produce a blank (null) value, uncatchable by `IFERROR`. Useful for terminating evaluation from deep inside nested expressions when a precondition fails. Implemented with a context flag rather than a thrown sentinel so user-visible control flow isn't modeled as an exception.
- `REQUIRE(value)` function: returns `value` if present, otherwise bails the whole formula. Blankness matches `ISBLANK` semantics (`null`, `undefined`, `""`). Ergonomic for templates where one missing ingredient should make the whole output blank — e.g. `` `https://example.com/users/{REQUIRE(userId)}` ``.

### Fixed

- Autocomplete dropdown now correctly scrolls the selected item into view when the signature hint header is showing. Previously the scroll targeted the item one above the selection because `listRef.children` was shifted by the header element — End jumped past the visible area, and arrow-up landed the selection one row below the viewport top.

## [0.1.0] - 2026-04-16

Initial release.

### Formula engine

- Tokenizer, parser, and evaluator for spreadsheet-style formula expressions
- Arithmetic (`+`, `-`, `*`, `/`, `%`, `^`), comparison (`=`, `!=`, `<`, `>`, `<=`, `>=`), logical, and string-concat (`&`) operators
- Column references as bare identifiers (`price`) and bracketed identifiers (`[First Name]`) for names with spaces
- Template literals: backticks with `{expr}` interpolations, e.g. `` `Hello {firstName}, total: {ROUND(total, 2)}` ``
- Column dependency extraction via `extractColumnRefs`
- Built-in functions: `IF`, `ROUND`, `CONCAT`, `AND`, `OR`, `NOT`, `SUM`, `AVG`, `MIN`, `MAX`, and more
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

[Unreleased]: https://github.com/krtools/grid-formula-editor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/krtools/grid-formula-editor/releases/tag/v0.1.0
