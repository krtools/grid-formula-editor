import * as React from 'react';
import { compile, parse, tokenizeSafe, FormulaParseError } from '../src/index';
import { FormulaEditor } from '../src/editor/components/FormulaEditor';
import {
  FormulaChangeInfo,
  ColumnDef,
  FormulaColorConfig,
} from '../src/editor/types';
import { DARK_COLORS } from '../src/editor/constants';
import { ASTNode } from '../src/types';

// ── Sample data ─────────────────────────────────────────────────────

const SAMPLE_ROWS = [
  { price: 29.99, quantity: 3, taxRate: 0.08, name: 'Widget', category: 'Hardware' },
  { price: 9.99,  quantity: 12, taxRate: 0.08, name: 'Gadget', category: 'Electronics' },
  { price: 149.0, quantity: 1, taxRate: 0.1, name: 'Gizmo', category: 'Electronics' },
  { price: 4.5,   quantity: 50, taxRate: 0.05, name: 'Bolt Pack', category: 'Hardware' },
  { price: 74.99, quantity: 2, taxRate: 0.08, name: 'Sensor Kit', category: 'Electronics' },
];

const COLUMNS: ColumnDef[] = [
  { name: 'price', description: 'Unit price' },
  { name: 'quantity', description: 'Item count' },
  { name: 'taxRate', description: 'Tax rate (decimal)' },
  { name: 'name', description: 'Product name' },
  { name: 'category', description: 'Product category' },
];

const PRESET_FORMULAS = [
  { label: 'Subtotal', formula: 'price * quantity' },
  { label: 'With tax', formula: 'ROUND(price * quantity * (1 + taxRate), 2)' },
  { label: 'Discount (10+ items)', formula: 'IF(quantity >= 10, ROUND(price * quantity * 0.1, 2), 0)' },
  { label: 'Label', formula: 'CONCAT(name, " (", category, ")")' },
  { label: 'Per-unit after tax', formula: 'ROUND(price * (1 + taxRate), 2)' },
];

// ── Styles (all inline) ─────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  maxWidth: 960,
  margin: '0 auto',
  padding: '32px 24px',
};

const headerStyle: React.CSSProperties = {
  marginBottom: 8,
  fontSize: 24,
  fontWeight: 700,
};

const subheaderStyle: React.CSSProperties = {
  color: '#656d76',
  marginBottom: 32,
  fontSize: 14,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 32,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#656d76',
  marginBottom: 6,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

const presetBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  marginBottom: 12,
};

const presetBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px',
  fontSize: 12,
  border: '1px solid',
  borderColor: active ? '#0969da' : '#d0d7de',
  borderRadius: 6,
  background: active ? '#ddf4ff' : '#fff',
  color: active ? '#0969da' : '#1f2328',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: active ? 600 : 400,
});

const tableContainerStyle: React.CSSProperties = {
  border: '1px solid #d0d7de',
  borderRadius: 8,
  overflow: 'auto',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
  fontFamily: "'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
};

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 600,
  borderBottom: '2px solid #d0d7de',
  background: '#f6f8fa',
  whiteSpace: 'nowrap',
  fontSize: 12,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  color: '#656d76',
};

const tdStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderBottom: '1px solid #eef0f2',
  whiteSpace: 'nowrap',
};

const resultThStyle: React.CSSProperties = {
  ...thStyle,
  background: '#ddf4ff',
  color: '#0969da',
};

const resultTdStyle: React.CSSProperties = {
  ...tdStyle,
  background: '#f0f9ff',
  fontWeight: 600,
};

const panelRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 24,
  marginTop: 16,
};

const panelStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 8,
  border: '1px solid #d0d7de',
  background: '#f6f8fa',
  fontSize: 12,
  fontFamily: "'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 240,
  overflow: 'auto',
  lineHeight: 1.5,
};

const errorPanelStyle: React.CSSProperties = {
  ...panelStyle,
  background: '#fff5f5',
  borderColor: '#fca5a5',
  color: '#b91c1c',
};

const toggleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 12,
};

const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '5px 14px',
  fontSize: 13,
  border: '1px solid',
  borderColor: active ? '#0969da' : '#d0d7de',
  borderRadius: 6,
  background: active ? '#0969da' : '#fff',
  color: active ? '#fff' : '#1f2328',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 500,
});

// ── App ─────────────────────────────────────────────────────────────

export function App() {
  const [formula, setFormula] = React.useState('price * quantity');
  const [info, setInfo] = React.useState<FormulaChangeInfo | null>(null);
  const [results, setResults] = React.useState<unknown[]>([]);
  const [isDark, setIsDark] = React.useState(false);

  // Evaluate formula against sample rows
  React.useEffect(() => {
    if (!info || info.error || !info.ast) {
      setResults(SAMPLE_ROWS.map(() => null));
      return;
    }

    try {
      const processor = compile({
        columns: [{ name: 'result', formula }],
        get: (row: Record<string, unknown>, col: string) => row[col],
        set: (row: Record<string, unknown>, col: string, value: unknown) => {
          row[col] = value;
        },
        onError: () => undefined,
      });

      const computed = SAMPLE_ROWS.map(row => {
        const copy = { ...row } as Record<string, unknown>;
        processor.process(copy);
        return copy.result ?? null;
      });
      setResults(computed);
    } catch {
      setResults(SAMPLE_ROWS.map(() => null));
    }
  }, [formula, info]);

  function handleChange(f: string, changeInfo: FormulaChangeInfo) {
    setFormula(f);
    setInfo(changeInfo);
  }

  const darkPage: React.CSSProperties = isDark
    ? { background: '#0d1117', color: '#c9d1d9' }
    : { color: '#1f2328' };

  const darkTable: React.CSSProperties = isDark
    ? { background: '#161b22', color: '#c9d1d9' }
    : {};

  const darkTh: React.CSSProperties = isDark
    ? { background: '#21262d', color: '#8b949e', borderColor: '#30363d' }
    : {};

  const darkTd: React.CSSProperties = isDark
    ? { borderColor: '#21262d' }
    : {};

  const darkResultTh: React.CSSProperties = isDark
    ? { background: '#0d2240', color: '#58a6ff', borderColor: '#30363d' }
    : {};

  const darkResultTd: React.CSSProperties = isDark
    ? { background: '#0d2240', borderColor: '#21262d' }
    : {};

  const darkPanel: React.CSSProperties = isDark
    ? { background: '#161b22', borderColor: '#30363d', color: '#c9d1d9' }
    : {};

  const colors: FormulaColorConfig | undefined = isDark ? DARK_COLORS : undefined;

  return (
    <div style={{ minHeight: '100vh', ...darkPage }}>
    <div style={pageStyle}>
      <h1 style={headerStyle}>FormulaEditor Demo</h1>
      <p style={{ ...subheaderStyle, ...(isDark ? { color: '#8b949e' } : {}) }}>
        Type a formula below. Columns and functions autocomplete as you type.
        Results evaluate live against sample data.
      </p>

      <div style={toggleRowStyle}>
        <button style={toggleBtnStyle(!isDark)} onClick={() => setIsDark(false)}>Light</button>
        <button style={toggleBtnStyle(isDark)} onClick={() => setIsDark(true)}>Dark</button>
      </div>

      <div style={sectionStyle}>
        <span style={{ ...labelStyle, ...(isDark ? { color: '#8b949e' } : {}) }}>Formula</span>

        <div style={presetBarStyle}>
          {PRESET_FORMULAS.map(p => (
            <button
              key={p.label}
              style={presetBtnStyle(formula === p.formula)}
              onClick={() => {
                setFormula(p.formula);
                const { tokens, error: tokenError } = tokenizeSafe(p.formula);
                let ast: ASTNode | null = null;
                let error = tokenError;
                if (!tokenError) {
                  try { ast = parse(p.formula); } catch (e) {
                    if (e instanceof FormulaParseError) error = e;
                  }
                }
                setInfo({ ast, error, tokens });
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <FormulaEditor
          value={formula}
          onChange={handleChange}
          columns={COLUMNS}
          colors={colors}
          styles={isDark ? { editorBorderColor: '#30363d', editorFocusBorderColor: '#58a6ff' } : undefined}
          placeholder="Enter a formula... e.g. price * quantity"
        />
      </div>

      <div style={sectionStyle}>
        <span style={{ ...labelStyle, ...(isDark ? { color: '#8b949e' } : {}) }}>
          Live results
        </span>
        <div style={{ ...tableContainerStyle, ...(isDark ? { borderColor: '#30363d' } : {}) }}>
          <table style={{ ...tableStyle, ...darkTable }}>
            <thead>
              <tr>
                {Object.keys(SAMPLE_ROWS[0]).map(col => (
                  <th key={col} style={{ ...thStyle, ...darkTh }}>{col}</th>
                ))}
                <th style={{ ...resultThStyle, ...darkResultTh }}>result</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_ROWS.map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((val, j) => (
                    <td key={j} style={{ ...tdStyle, ...darkTd }}>{String(val)}</td>
                  ))}
                  <td style={{ ...resultTdStyle, ...darkResultTd }}>
                    {results[i] === null ? '—' : String(results[i])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={sectionStyle}>
        <span style={{ ...labelStyle, ...(isDark ? { color: '#8b949e' } : {}) }}>
          Parse info
        </span>
        <div style={panelRowStyle}>
          <div>
            <span style={{ ...labelStyle, fontSize: 11, ...(isDark ? { color: '#8b949e' } : {}) }}>AST</span>
            <div style={{ ...panelStyle, ...darkPanel }}>
              {info?.ast ? JSON.stringify(info.ast, null, 2) : '(no valid AST)'}
            </div>
          </div>
          <div>
            <span style={{ ...labelStyle, fontSize: 11, ...(isDark ? { color: '#8b949e' } : {}) }}>
              {info?.error ? 'Error' : 'Tokens'}
            </span>
            <div style={info?.error ? { ...errorPanelStyle, ...(isDark ? { background: '#3b1212', borderColor: '#7f1d1d', color: '#fca5a5' } : {}) } : { ...panelStyle, ...darkPanel }}>
              {info?.error
                ? `${info.error.message}\n\nPosition: ${info.error.start}–${info.error.end}`
                : info?.tokens
                  ? info.tokens
                      .filter(t => t.type !== 'EOF')
                      .map(t => `${t.type}(${JSON.stringify(t.value)}) [${t.start}:${t.end}]`)
                      .join('\n')
                  : '(type to see tokens)'}
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
