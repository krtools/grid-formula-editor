# grid-formula-editor

A cell-formula engine for table data. Formulas reference columns **by name** and
evaluate **per row** — there is no cross-row addressing. Think of it as a
post-processing stage: your rows arrive with raw data, and the formula engine
fills in computed columns.

## Install

```bash
npm install grid-formula-editor
```

## Quick start

```ts
import { compile } from 'grid-formula-editor';

const processor = compile({
  columns: [
    { name: 'subtotal', formula: 'price * quantity' },
    { name: 'tax',      formula: 'subtotal * taxRate' },
    { name: 'total',    formula: 'subtotal + tax' },
  ],
  get: (row, col) => row[col],
  set: (row, col, value, referencedColumns) => {
    row[col] = value;
  },
});

const row = { price: 29.99, quantity: 3, taxRate: 0.08 };
processor.process(row);
// row.subtotal → 89.97
// row.tax      → 7.1976
// row.total    → 97.1676
```

`compile()` parses all formulas once, detects circular references, resolves
dependencies, and returns a lightweight processor you can call on every row.

---

## Column references

Columns are referenced **by name**, not by letter like Excel's `A`, `B`, `C`.

| Column name    | How to reference it       |
|----------------|---------------------------|
| `price`        | `price`                   |
| `quantity`     | `quantity`                |
| `First Name`   | `[First Name]`            |
| `Tax Rate (%)`  | `[Tax Rate (%)]`         |

Simple alphanumeric names (letters, digits, underscores) are bare identifiers.
Names containing spaces or special characters are wrapped in square brackets.

### Referencing other formula columns

Formula columns can reference each other. The engine topologically sorts them so
dependencies always evaluate first, regardless of the order you list them:

```ts
const processor = compile({
  columns: [
    // Listed "backwards" — doesn't matter, engine sorts them
    { name: 'total',    formula: 'subtotal + tax' },
    { name: 'tax',      formula: 'subtotal * 0.1' },
    { name: 'subtotal', formula: 'price * quantity' },
  ],
  get: (row, col) => row[col],
  set: (row, col, value) => { row[col] = value; },
});

const row = { price: 50, quantity: 4 };
processor.process(row);
// Evaluates in order: subtotal (200) → tax (20) → total (220)
```

### No cross-row references

There is no `A1` or `ROW(3)` syntax. Every formula only sees columns from the
current row. This makes the engine safe to parallelise across rows with no
shared state.

---

## Formula syntax

### Literals

| Type    | Examples                     |
|---------|------------------------------|
| Number  | `42`, `3.14`, `0.5`         |
| String  | `"hello"`, `'world'`        |
| Boolean | `TRUE`, `FALSE`             |

Strings support backslash escapes (`\n`, `\t`, `\\`, `\"`, `\'`) and
Excel-style doubled quotes (`"She said ""hi"""` → `She said "hi"`).

### Operators

Listed from lowest to highest precedence:

| Precedence | Operators             | Description                     |
|------------|-----------------------|---------------------------------|
| 1          | `=` `!=` `<>` `<` `>` `<=` `>=` | Comparisons (non-chaining) |
| 2          | `+` `-` `&`          | Add, subtract, string concat    |
| 3          | `*` `/` `%`          | Multiply, divide, modulo        |
| 4          | `^`                   | Power (right-associative)       |
| 5          | `-` (unary)           | Negation                        |

Parentheses override precedence: `(a + b) * c`.

### String concatenation

Two equivalent ways:

```
first & " " & last
CONCAT(first, " ", last)
```

Both produce `"John Doe"` when `first` is `"John"` and `last` is `"Doe"`.

### Comparisons

```
status = "active"
price > 100
quantity != 0
score >= passingGrade
```

Comparisons return `true` or `false` and are typically used inside `IF()`.

---

## Built-in functions

### Logical

| Function                             | Description                             |
|--------------------------------------|-----------------------------------------|
| `IF(condition, trueValue, falseValue)` | Returns `trueValue` or `falseValue` based on `condition`. Short-circuits — only the taken branch is evaluated. |
| `AND(a, b, ...)`                     | Returns `true` if all arguments are truthy. Short-circuits on first `false`. |
| `OR(a, b, ...)`                      | Returns `true` if any argument is truthy. Short-circuits on first `true`. |
| `NOT(value)`                         | Returns the boolean inverse. |
| `IFERROR(expression, fallback)`      | Evaluates `expression`; if it throws (division by zero, bad reference, coercion failure), returns `fallback` instead. |

#### Examples

```
IF(quantity > 0, price * quantity, 0)
IF(AND(age >= 18, hasConsent = TRUE), "eligible", "ineligible")
IF(OR(status = "active", status = "trial"), "show", "hide")
IFERROR(revenue / costs, 0)
NOT(isArchived)
```

Nested conditionals:

```
IF(score >= 90, "A",
  IF(score >= 80, "B",
    IF(score >= 70, "C", "F")))
```

### Math

| Function                 | Description                                      |
|--------------------------|--------------------------------------------------|
| `ROUND(number, decimals)` | Round to N decimal places.                      |
| `FLOOR(number)`          | Round down to nearest integer.                   |
| `CEIL(number)`           | Round up to nearest integer.                     |
| `ABS(number)`            | Absolute value.                                  |
| `MIN(a, b, ...)`         | Smallest of the arguments.                       |
| `MAX(a, b, ...)`         | Largest of the arguments.                        |
| `MOD(number, divisor)`   | Remainder after division.                        |
| `POWER(base, exponent)`  | `base` raised to `exponent` (same as `^`).       |
| `SQRT(number)`           | Square root.                                     |

#### Examples

```
ROUND(price * taxRate, 2)          → 7.20
FLOOR(rating)                       → 4
CEIL(shipping / weight)             → 3
ABS(balance)                        → 150.00
MIN(price, competitorPrice)         → 9.99
MAX(score1, score2, score3)         → 95
MOD(rowIndex, 2)                    → 0 or 1 (for zebra striping)
POWER(2, bits)                      → 256
SQRT(area)                          → 12
```

### String

| Function                          | Description                                       |
|-----------------------------------|---------------------------------------------------|
| `CONCAT(a, b, ...)`              | Join all arguments into one string.               |
| `LEFT(text, count)`              | First `count` characters.                         |
| `RIGHT(text, count)`             | Last `count` characters.                          |
| `MID(text, start, count)`        | Substring starting at `start` (1-based, like Excel). |
| `LEN(text)`                      | Character count.                                  |
| `TRIM(text)`                     | Strip leading/trailing whitespace.                |
| `UPPER(text)`                    | Convert to uppercase.                             |
| `LOWER(text)`                    | Convert to lowercase.                             |
| `SUBSTITUTE(text, old, new)`     | Replace all occurrences of `old` with `new`.      |

#### Examples

```
CONCAT(firstName, " ", lastName)                  → "Jane Doe"
LEFT(zipCode, 3)                                   → "902"
RIGHT(phone, 4)                                    → "5678"
MID(ssn, 5, 2)                                     → "56"
LEN(description)                                    → 42
TRIM(userInput)                                     → "hello"
UPPER(country)                                      → "US"
LOWER(email)                                        → "jane@example.com"
SUBSTITUTE(slug, " ", "-")                          → "my-blog-post"
```

### URL

| Function             | Description                                       |
|----------------------|---------------------------------------------------|
| `URLENCODE(text)`    | Percent-encodes a value for use in URLs.          |
| `URLDECODE(text)`    | Decodes a percent-encoded string.                 |

#### Examples

```
CONCAT("https://example.com/search?q=", URLENCODE(query))
→ "https://example.com/search?q=hello%20world"

URLDECODE(rawParam)
→ "price>=100"
```

### Type / utility

| Function             | Description                                       |
|----------------------|---------------------------------------------------|
| `ISNUMBER(value)`    | `true` if value is a number or numeric string.    |
| `ISBLANK(value)`     | `true` if value is `null`, `undefined`, or `""`.  |
| `VALUE(text)`        | Parse a number from a string. Throws if not numeric. |
| `TEXT(value)`         | Convert any value to its string representation.   |
| `COALESCE(a, b, ...)` | First argument that is not `null`/`undefined`.   |

#### Examples

```
IF(ISBLANK(middleName), CONCAT(first, " ", last), CONCAT(first, " ", middleName, " ", last))
IF(ISNUMBER(input), input * 2, 0)
VALUE("123.45") + 1                                 → 124.45
TEXT(total) & " USD"                                 → "220 USD"
COALESCE(nickname, firstName, "Anonymous")           → uses first non-null
```

---

## Type coercion

The engine uses **loose coercion** with `Number()` (not `parseInt`/`parseFloat`):

| From        | To number | To boolean      | To string  |
|-------------|-----------|-----------------|------------|
| `number`    | as-is     | `0` → `false`   | `String()` |
| `string`    | `Number()`| non-empty → `true`, `"TRUE"`/`"FALSE"` honoured | as-is |
| `boolean`   | `true` → `1`, `false` → `0` | as-is | `"TRUE"` / `"FALSE"` |
| `null`/`undefined` | `0` | `false` | `""` |

Arithmetic operators (`+`, `-`, `*`, `/`, `%`, `^`) coerce both sides to
numbers. The `&` operator coerces both sides to strings. Comparisons use smart
matching — if both sides are numeric, compare numerically; if both are strings,
compare lexicographically; mixed types attempt numeric then fall back to string.

If coercion fails (e.g. `Number("abc")` is `NaN`), the engine raises a
`TYPE_ERROR` with `warning` severity.

---

## API reference

### `compile<T>(options): CompiledProcessor<T>`

| Option      | Type | Description |
|-------------|------|-------------|
| `columns`   | `FormulaColumn[]` | Array of `{ name, formula }` objects. |
| `get`       | `(row: T, columnName: string) => unknown` | Retrieve a column value from a row. |
| `set`       | `(row: T, columnName: string, value: unknown, referencedColumns: string[]) => void` | Called once per formula column after successful evaluation. `referencedColumns` lists every column the formula reads. |
| `onError`   | `(error: FormulaError, row?: T) => unknown` | *(Optional)* Error handler. Return a value to use it as the cell result; return `undefined` to skip the column. `row` is `undefined` for compile-time errors. |
| `functions` | `Record<string, Function>` | *(Optional)* Custom functions to register (case-insensitive). |

### `CompiledProcessor<T>`

| Method         | Description |
|----------------|-------------|
| `process(row)` | Evaluate all formula columns for the given row. |

### `FormulaError`

Every error routed through `onError` carries full context:

```ts
interface FormulaError {
  code: FormulaErrorCode;       // What went wrong
  severity: FormulaErrorSeverity; // How bad is it
  column: string;               // Which formula column
  formula: string;              // The formula text
  referencedColumns: string[];  // Columns the formula depends on
  message: string;              // Human-readable description
  cause?: unknown;              // Original thrown error, if any
}
```

#### Error codes and severities

| Code                | Severity  | When                                              |
|---------------------|-----------|---------------------------------------------------|
| `CIRCULAR_REFERENCE`| `fatal`   | Compile-time: formula columns form a cycle.       |
| `PARSE_ERROR`       | `fatal`   | Compile-time: formula syntax is invalid.          |
| `REFERENCE_ERROR`   | `error`   | Runtime: `get()` threw when reading a column.     |
| `TYPE_ERROR`        | `warning` | Runtime: value could not be coerced (e.g. `Number("abc")`). |
| `EVAL_ERROR`        | `error`   | Runtime: evaluation failure (e.g. division by zero). |
| `FUNCTION_ERROR`    | `error`   | Runtime: function not found or threw.             |

---

## Error handling

### Without `onError`

- **Compile-time** errors (`PARSE_ERROR`, `CIRCULAR_REFERENCE`) throw from
  `compile()`.
- **Runtime** errors silently skip the column — `set()` is not called.

### With `onError`

All errors are routed through the handler. The handler's return value controls
what happens to the cell:

```ts
const processor = compile({
  columns: [
    { name: 'ratio', formula: 'revenue / costs' },
    { name: 'label', formula: 'IF(ratio > 1, "profit", "loss")' },
  ],
  get: (row, col) => row[col],
  set: (row, col, value) => { row[col] = value; },
  onError: (error, row) => {
    console.warn(`[${error.severity}] ${error.column}: ${error.message}`);
    console.warn(`  formula: ${error.formula}`);
    console.warn(`  refs: ${error.referencedColumns.join(', ')}`);

    // Return a fallback value based on severity
    if (error.code === 'EVAL_ERROR') return 0;     // e.g. division by zero → 0
    if (error.code === 'TYPE_ERROR') return null;   // coercion failure → null
    return undefined; // skip this column entirely
  },
});
```

When `onError` returns a value, that value is:
1. **Passed to `set()`** for the current column.
2. **Cached** so downstream formula columns can reference it.

When `onError` returns `undefined`, `set()` is not called and the column is
skipped.

### `IFERROR` — formula-level error handling

`IFERROR` catches errors *inside* a formula without reaching `onError`:

```
IFERROR(revenue / costs, 0)
```

If `costs` is zero, the division throws, `IFERROR` catches it, and the formula
returns `0`. The `onError` handler is never called. This is useful for expected
edge cases you want to handle inline.

---

## Custom functions

Register functions at compile time. Names are case-insensitive.

```ts
const processor = compile({
  columns: [
    { name: 'slug',    formula: 'SLUGIFY(title)' },
    { name: 'initials', formula: 'INITIALS(firstName, lastName)' },
    { name: 'age',     formula: 'YEARS_SINCE(birthDate)' },
  ],
  get: (row, col) => row[col],
  set: (row, col, value) => { row[col] = value; },
  functions: {
    SLUGIFY: (text: unknown) =>
      String(text).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),

    INITIALS: (first: unknown, last: unknown) =>
      `${String(first)[0]}${String(last)[0]}`.toUpperCase(),

    YEARS_SINCE: (dateStr: unknown) => {
      const d = new Date(String(dateStr));
      return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    },
  },
});
```

Custom functions can override built-ins:

```ts
functions: {
  // Override ROUND to always use banker's rounding
  ROUND: (n: unknown, d: unknown) => {
    const factor = 10 ** Number(d);
    const shifted = Number(n) * factor;
    const rounded = Math.round(shifted + (shifted % 1 === 0.5 ? -1 : 0));
    return rounded / factor;
  },
}
```

> **Reserved names:** `IF`, `IFERROR`, `AND`, `OR` are handled as special forms
> with short-circuit evaluation and cannot be overridden by custom functions.

---

## Circular reference detection

The engine builds a dependency graph across formula columns and topologically
sorts them. If a cycle exists, every column in the cycle is excluded from
processing and reported via `onError` (or thrown if no handler).

```ts
// This will report a CIRCULAR_REFERENCE error
const processor = compile({
  columns: [
    { name: 'a', formula: 'b + 1' },
    { name: 'b', formula: 'a + 1' },
    { name: 'c', formula: 'val * 2' },  // not in the cycle
  ],
  get: (row, col) => row[col],
  set: (row, col, value) => { row[col] = value; },
  onError: (error) => {
    if (error.code === 'CIRCULAR_REFERENCE') {
      console.error(error.message); // "Circular reference detected: a → b → a"
    }
    return undefined;
  },
});

const row = { val: 5 };
processor.process(row);
// row.c → 10  (unaffected columns still process)
// row.a → undefined  (circular, skipped)
// row.b → undefined  (circular, skipped)
```

Self-references are also caught: `{ name: 'x', formula: 'x + 1' }`.

---

## Realistic examples

### E-commerce line items

```ts
const processor = compile({
  columns: [
    { name: 'subtotal',   formula: 'price * quantity' },
    { name: 'discount',   formula: 'IF(quantity >= 10, subtotal * 0.1, 0)' },
    { name: 'taxable',    formula: 'subtotal - discount' },
    { name: 'tax',        formula: 'ROUND(taxable * taxRate, 2)' },
    { name: 'total',      formula: 'taxable + tax' },
    { name: 'perUnit',    formula: 'ROUND(total / quantity, 2)' },
  ],
  get: (row, col) => row[col],
  set: (row, col, value) => { row[col] = value; },
});

processor.process({ price: 29.99, quantity: 12, taxRate: 0.08 });
// subtotal → 359.88
// discount → 35.988
// taxable  → 323.892
// tax      → 25.91
// total    → 349.802
// perUnit  → 29.15
```

### User display names

```ts
const processor = compile({
  columns: [
    {
      name: 'displayName',
      formula: `
        IF(ISBLANK(nickname),
          IF(ISBLANK([Middle Name]),
            CONCAT([First Name], " ", [Last Name]),
            CONCAT([First Name], " ", LEFT([Middle Name], 1), ". ", [Last Name])),
          nickname)
      `,
    },
    {
      name: 'initials',
      formula: 'UPPER(CONCAT(LEFT([First Name], 1), LEFT([Last Name], 1)))',
    },
    {
      name: 'email',
      formula: 'LOWER(CONCAT([First Name], ".", [Last Name], "@example.com"))',
    },
  ],
  get: (row, col) => row[col],
  set: (row, col, value) => { row[col] = value; },
});

processor.process({
  'First Name': 'Jane',
  'Middle Name': 'Elizabeth',
  'Last Name': 'Doe',
  nickname: null,
});
// displayName → "Jane E. Doe"
// initials    → "JD"
// email       → "jane.doe@example.com"
```

### Building URLs from row data

```ts
const processor = compile({
  columns: [
    {
      name: 'profileUrl',
      formula: 'CONCAT("https://app.example.com/users/", URLENCODE(userId))',
    },
    {
      name: 'searchUrl',
      formula: `CONCAT(
        "https://api.example.com/search?name=", URLENCODE(name),
        "&city=", URLENCODE(city))`,
    },
  ],
  get: (row, col) => row[col],
  set: (row, col, value) => { row[col] = value; },
});

processor.process({ userId: 'usr 123', name: 'Jane Doe', city: 'San Francisco' });
// profileUrl → "https://app.example.com/users/usr%20123"
// searchUrl  → "https://api.example.com/search?name=Jane%20Doe&city=San%20Francisco"
```

### Data quality scoring

```ts
const processor = compile({
  columns: [
    {
      name: 'completeness',
      formula: `
        (IF(ISBLANK(email), 0, 1)
         + IF(ISBLANK(phone), 0, 1)
         + IF(ISBLANK(address), 0, 1)) / 3
      `,
    },
    {
      name: 'qualityLabel',
      formula: `
        IF(completeness >= 1, "complete",
          IF(completeness >= 0.66, "good",
            IF(completeness >= 0.33, "partial", "poor")))
      `,
    },
  ],
  get: (row, col) => row[col],
  set: (row, col, value) => { row[col] = value; },
});

processor.process({ email: 'jane@example.com', phone: null, address: '123 Main St' });
// completeness → 0.666...
// qualityLabel → "good"
```

### Conditional formatting flags

```ts
const processor = compile({
  columns: [
    { name: 'isOverdue',    formula: 'AND(status != "paid", daysOpen > 30)' },
    { name: 'isHighValue',  formula: 'amount > 10000' },
    { name: 'needsReview',  formula: 'OR(isOverdue, isHighValue)' },
    { name: 'rowClass',     formula: `
        IF(isOverdue, "row-danger",
          IF(isHighValue, "row-warning", "row-normal"))
    ` },
  ],
  get: (row, col) => row[col],
  set: (row, col, value) => { row[col] = value; },
});

processor.process({ status: 'pending', daysOpen: 45, amount: 500 });
// isOverdue   → true
// isHighValue → false
// needsReview → true
// rowClass    → "row-danger"
```

### Graceful error recovery

```ts
const processor = compile({
  columns: [
    { name: 'margin',    formula: 'IFERROR((revenue - cost) / revenue, 0)' },
    { name: 'marginPct', formula: 'CONCAT(ROUND(margin * 100, 1), "%")' },
    { name: 'safe',      formula: 'COALESCE(region, country, "Unknown")' },
  ],
  get: (row, col) => row[col],
  set: (row, col, value) => { row[col] = value; },
  onError: (error, row) => {
    // Log all errors for monitoring
    console.warn(
      `[${error.severity}/${error.code}] Column "${error.column}" ` +
      `(formula: ${error.formula}): ${error.message}`
    );
    // Fallback based on error type
    if (error.severity === 'warning') return null;
    return undefined;
  },
});

processor.process({ revenue: 0, cost: 100, region: null, country: null });
// margin    → 0     (IFERROR catches div-by-zero)
// marginPct → "0%"
// safe      → "Unknown"
```

---

## FormulaEditor (React component)

A rich editor component for authoring formulas with syntax highlighting,
real-time validation, and autocomplete. Requires React >=16.8.

```ts
import { FormulaEditor } from 'grid-formula-editor';
```

### Basic usage

```tsx
import { FormulaEditor } from 'grid-formula-editor';

function App() {
  return (
    <FormulaEditor
      columns={[
        { name: 'price', description: 'Unit price' },
        { name: 'quantity', description: 'Item count' },
        { name: 'First Name', label: 'First Name' },
      ]}
      placeholder="Enter formula..."
      onChange={(formula, info) => {
        console.log('Formula:', formula);
        console.log('AST:', info.ast);
        console.log('Error:', info.error);
      }}
    />
  );
}
```

### Props

| Prop           | Type | Description |
|----------------|------|-------------|
| `value`        | `string` | Controlled value. |
| `defaultValue` | `string` | Initial value (uncontrolled). |
| `onChange`      | `(formula, info) => void` | Called on every change with formula string, AST, error, and tokens. |
| `columns`      | `ColumnDef[]` | Column definitions for autocomplete. |
| `functions`    | `FunctionDef[]` | Function definitions. Defaults to all built-in functions. |
| `colors`       | `FormulaColorConfig` | Color overrides (merged with `DEFAULT_COLORS`). |
| `styles`       | `FormulaStyleConfig` | Layout style overrides. |
| `placeholder`  | `string` | Placeholder text. |
| `disabled`     | `boolean` | Disable all interaction. |
| `readOnly`     | `boolean` | Allow selection but not editing. |
| `className`    | `string` | CSS class on the outer container. |
| `style`        | `CSSProperties` | Inline styles on the outer container. |
| `onFocus`      | `() => void` | Focus callback. |
| `onBlur`       | `() => void` | Blur callback. |

### Controlled vs uncontrolled

```tsx
// Uncontrolled — editor manages its own state
<FormulaEditor defaultValue="price * quantity" onChange={(f) => save(f)} />

// Controlled — you manage the value
const [formula, setFormula] = useState('price * quantity');
<FormulaEditor value={formula} onChange={(f) => setFormula(f)} />
```

### Imperative handle

```tsx
const ref = useRef<FormulaEditorHandle>(null);

<FormulaEditor ref={ref} columns={columns} />

// Later:
ref.current.getValue();       // read formula
ref.current.setValue('a + b'); // set formula
ref.current.focus();           // focus editor
```

### Theming

The editor uses inline styles only — no CSS files. Override colors and
layout with the `colors` and `styles` props.

```tsx
import { DARK_COLORS } from 'grid-formula-editor';

<FormulaEditor
  columns={columns}
  colors={DARK_COLORS}
  styles={{ editorBorderRadius: '0', editorPadding: '8px 12px' }}
/>
```

Color presets: `DEFAULT_COLORS` (light, VS Code-inspired) and `DARK_COLORS`.
All color keys are optional — omitted keys fall back to the defaults.

### Autocomplete

The dropdown appears automatically when you type a column or function name
prefix. Keyboard navigation:

- **Arrow Up/Down** — navigate suggestions
- **Enter / Tab** — accept selected suggestion
- **Escape** — close dropdown

Column names with spaces are auto-wrapped in brackets. Function names
auto-append `(`.

### Custom functions in autocomplete

Pass `functions` to show your custom functions alongside the built-ins:

```tsx
<FormulaEditor
  columns={columns}
  functions={[
    ...BUILTIN_FUNCTIONS,
    { name: 'SLUGIFY', description: 'URL-safe slug', signature: 'SLUGIFY(text)' },
    { name: 'INITIALS', description: 'First letters', signature: 'INITIALS(first, last)' },
  ]}
/>
```

### `FormulaChangeInfo`

The second argument to `onChange`:

```ts
interface FormulaChangeInfo {
  ast: ASTNode | null;          // Parsed AST, or null on error
  error: FormulaParseError | null; // Parse error with start/end positions
  tokens: Token[];               // Fault-tolerant token array
}
```

### Architecture

Everything is exported from a single package entry point. React is an optional
peer dependency — if you only use the core formula engine functions (`compile`,
`parse`, `tokenize`, etc.), you don't need React installed.

---

## License

MIT
