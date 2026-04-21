# Formula User Guide

A quick how-to for writing formulas. Aimed at users already comfortable with
Excel formulas — this guide focuses on what's **different** and what's **new**.

## The big differences from Excel

| Excel                                  | Here                                              |
|----------------------------------------|---------------------------------------------------|
| `=A1 * B1`                             | `price * quantity` — columns by **name**, no `=`  |
| `=SUM(A1:A10)`                         | *(no cross-row refs — formulas see only this row)* |
| `=A1 & " " & B1`                       | `` `{first} {last}` `` — template literals        |
| `=IFERROR(x, 0)`                       | Same, plus `BAIL()` / `REQUIRE(x)` for whole-cell bailout |
| `="Value: " & TEXT(x, "0.00")`         | `` `Value: {ROUND(x, 2)}` ``                      |
| Column `A`, `B`, `C`                   | Column names: `price`, `[First Name]`             |

Formulas run **once per row** and only see that row's columns. There is no
`A1`, no `ROW()`, no ranges.

## Column references

Reference columns by name — not by letter.

```
price              -- bare identifier (letters, digits, underscores)
First_Name         -- underscores OK
[First Name]       -- brackets for names with spaces
[Tax Rate (%)]     -- brackets for any special characters
```

Column names are **case-sensitive**. Function names are not.

A formula column can reference other formula columns — the engine figures out
the evaluation order automatically. Order them however reads best.

### Self-references

A formula can reference the column it's defining — the reference resolves to
the column's **pre-formula input value**. Use this to transform incoming data:

```
price      → formula: price * 1.1         -- marks up the incoming price
discount   → formula: REQUIRE(discount)   -- passes through if present, blanks otherwise
```

`SELF()` is a rename-safe alias — same semantics, but renaming the column
doesn't require rewriting the formula body:

```
price      → formula: SELF() * 1.1
```

## Operators

Same as Excel except as noted. Listed lowest to highest precedence:

| Operators                       | Meaning                                  |
|--------------------------------|-------------------------------------------|
| `=`  `!=`  `<>`  `<`  `>`  `<=`  `>=` | Comparisons. `!=` and `<>` are equivalent |
| `+`  `-`  `&`                  | Add, subtract, string concat              |
| `*`  `/`  `%`                  | Multiply, divide, **modulo** (not percent) |
| `^`                             | Power (right-associative)                |
| `-` (unary)                     | Negation                                 |

> **Watch out:** `%` is **modulo**, not "percent of". Excel's standalone `%`
> postfix (`50%` = 0.5) is not supported — write `0.5` directly.

Comparisons do not chain. `1 < x < 10` is **not** equivalent to `AND(1 < x, x < 10)`.

## Literals

```
42          3.14        0.5            -- numbers
"hello"     'world'     "She said ""hi"""   -- strings, Excel-style doubled quotes OK
TRUE        FALSE                       -- booleans (uppercase)
`...`                                    -- template literals (see below)
```

Strings support backslash escapes too: `\n`, `\t`, `\\`, `\"`, `\'`.

## Template literals

The single biggest win over Excel. Instead of chaining `&` and `CONCAT(...)`:

```
-- Old way
CONCAT("Hello, ", firstName, "! You have ", count, " items.")

-- Template literal
`Hello, {firstName}! You have {count} items.`
```

Interpolations use plain `{expr}` — no `$` prefix. Any formula expression
works inside the braces: columns, math, nested calls, even nested templates.

```
`Margin: {ROUND(margin * 100, 1)}%`
`{[First Name]} {[Last Name]}`
`https://example.com/users/{URLENCODE(userId)}`
```

Escapes inside templates: `` \` `` for a literal backtick, `\{` for a literal
open brace, `\\` for a backslash. A lone `}` in template text is literal — no
escape needed.

## Functions

Names are case-insensitive. Call like Excel: `ROUND(x, 2)`.

### Logical
- `IF(condition, thenValue, elseValue)` — short-circuits
- `AND(a, b, ...)` — short-circuits on first `FALSE`
- `OR(a, b, ...)` — short-circuits on first `TRUE`
- `NOT(value)`
- `IFERROR(expr, fallback)` — catches runtime errors inside `expr`

### Math
- `ROUND(n, decimals)` · `FLOOR(n)` · `CEIL(n)` · `ABS(n)` · `SQRT(n)`
- `MIN(...args)` · `MAX(...args)`
- `MOD(n, divisor)` · `POWER(base, exp)` (same as `^`)

### String
- `CONCAT(...args)` · `LEN(text)` · `TRIM(text)` · `UPPER(text)` · `LOWER(text)`
- `LEFT(text, n)` · `RIGHT(text, n)` · `MID(text, start, count)` — `start` is 1-based like Excel
- `SUBSTITUTE(text, old, new)` — replaces **all** occurrences

### URL
- `URLENCODE(text)` · `URLDECODE(text)`

### Type / utility
- `ISNUMBER(value)` · `ISBLANK(value)` — blank means `null`, `undefined`, or `""`
- `VALUE(text)` — parse number from string (throws on non-numeric)
- `TEXT(value)` — convert anything to string (no format argument — use template literals + `ROUND` for formatting)
- `COALESCE(a, b, ...)` — first non-`null`/`undefined` argument

### Control-flow (not in Excel)
- `BAIL()` — forces the **whole formula** to render blank. Uncatchable by `IFERROR`.
- `REQUIRE(value)` — returns `value` if present, otherwise bails the whole formula.
- `OPTIONAL(value)` — identity. Used as a marker at the top of a template interpolation to opt out of `requireTemplateVars` (see below); elsewhere it's a no-op.
- `SELF()` — the current column's pre-formula input value.

#### When to use BAIL / REQUIRE

Use `REQUIRE` when a missing ingredient should make the whole output blank,
instead of rendering partial garbage:

```
-- Without REQUIRE: produces "https://example.com/users/" when userId is missing
`https://example.com/users/{userId}`

-- With REQUIRE: produces blank when userId is missing
`https://example.com/users/{REQUIRE(userId)}`
```

Use `BAIL()` inside a conditional for "give up and render nothing":

```
IF(status = "archived", BAIL(), amount * rate)
```

The difference from `IFERROR`: `IFERROR` catches exceptions; `BAIL` / `REQUIRE`
signal "this formula has no meaningful result, render blank" and cannot be
swallowed by an enclosing `IFERROR`.

#### Require every template variable by default

If most of your templates want the strict `REQUIRE`-everywhere behavior, pass
`requireTemplateVars: true` to `compile()`. Every template interpolation is
then treated as if wrapped in `REQUIRE` — a blank value anywhere in a
template bails the whole formula.

```
-- With requireTemplateVars: true, these two are equivalent:
`users/{userId}/posts/{postId}`
`users/{REQUIRE(userId)}/posts/{REQUIRE(postId)}`
```

To let a single interp render blank-as-empty (the legacy default), wrap it
in `OPTIONAL`:

```
-- Strict mode is on, but middleName is allowed to be missing:
`{firstName} {OPTIONAL(middleName)} {lastName}`
```

Explicit `REQUIRE(x)` or `BAIL()` at the top of an interp are left alone —
the option only affects interps that aren't already bail-aware.

## Type coercion

Values coerce automatically at operator boundaries:

| You write                   | Happens                                           |
|-----------------------------|---------------------------------------------------|
| `"5" + 3`                   | `8` — arithmetic coerces to number               |
| `5 & " items"`              | `"5 items"` — `&` coerces to string               |
| `price > "100"`             | Numeric compare if both look numeric              |
| `"abc" = "ABC"`             | `FALSE` — strings are case-sensitive              |
| `IF(name, ..., ...)`        | Empty string is `FALSE`, non-empty is `TRUE`       |
| `TRUE + 1`                  | `2` — booleans coerce to `1` / `0`                 |
| `ISBLANK(null)`             | `TRUE` — `null`, `undefined`, `""` all count      |

If a value can't be coerced (e.g. `"abc" * 2`), the formula raises a warning
and the cell is left empty (or gets a fallback if the app configured one).

## Editor tips

- **Autocomplete** opens as you type. Arrow keys navigate, Enter/Tab inserts.
  Ctrl+Space (Cmd+Space on Mac) re-opens it manually.
- **Hover a function name** to see its signature and description.
- **Select text and type `(`, `[`, `{`, `"`, `'`, or `` ` ``** to wrap the
  selection with matching delimiters. Handy for `` `Hello world` `` →
  select `world`, press `{`, get `` `Hello {world}` ``.
- **Red squiggles** mark syntax errors; **orange squiggles** mark unknown
  functions or unknown column names.
- **Click into the editor** when it's already focused to re-open the
  autocomplete dropdown at the caret position.
- **Alt+Shift+→ / ←** grows and shrinks the selection along the formula's
  structure — handy for selecting a whole argument, a whole function call,
  or the surrounding template. Any other keypress resets the ladder.

## Common patterns

### Conditional value
```
IF(quantity >= 10, price * 0.9, price)
```

### Nested conditions (tier labels)
```
IF(score >= 90, "A",
  IF(score >= 80, "B",
    IF(score >= 70, "C", "F")))
```

### Safe division
```
IFERROR(revenue / costs, 0)
```

### First non-blank
```
COALESCE(nickname, firstName, "Anonymous")
```

### Format currency
```
`${ROUND(total, 2)}`
```

### Build a URL
```
`https://example.com/search?q={URLENCODE(query)}`
```

### Bail if a key field is missing
```
`https://example.com/users/{REQUIRE(userId)}/profile`
```

### Transform the incoming value
```
-- Column "price", formula: SELF() * 1.1     (10% markup)
-- Column "email", formula: LOWER(SELF())    (normalise case)
```

### Zebra striping / row class
```
IF(MOD(rowIndex, 2) = 0, "row-even", "row-odd")
```

### Combine first and last name, handling missing middle
```
IF(ISBLANK([Middle Name]),
  `{[First Name]} {[Last Name]}`,
  `{[First Name]} {LEFT([Middle Name], 1)}. {[Last Name]}`)
```
