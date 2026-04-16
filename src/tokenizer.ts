import { Token, TokenType, FormulaParseError } from './types.js';

const SINGLE_CHAR_TOKENS: Record<string, TokenType> = {
  '(': TokenType.LPAREN,
  ')': TokenType.RPAREN,
  ',': TokenType.COMMA,
  '+': TokenType.PLUS,
  '-': TokenType.MINUS,
  '*': TokenType.STAR,
  '/': TokenType.SLASH,
  '%': TokenType.PERCENT,
  '^': TokenType.CARET,
  '&': TokenType.AMPERSAND,
  '=': TokenType.EQ,
  '<': TokenType.LT,
  '>': TokenType.GT,
};

type Mode = 'expression' | 'template';

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  const modeStack: Mode[] = ['expression'];

  while (pos < input.length) {
    const mode = modeStack[modeStack.length - 1];

    if (mode === 'template') {
      pos = scanTemplateText(input, pos, tokens, /* safe */ false, null);
      const last = tokens[tokens.length - 1];
      if (last.type === TokenType.TEMPLATE_END) {
        modeStack.pop();
      } else if (last.type === TokenType.TEMPLATE_INTERP_START) {
        modeStack.push('expression');
      }
      continue;
    }

    // Expression mode
    if (/\s/.test(input[pos])) {
      pos++;
      continue;
    }

    const start = pos;
    const ch = input[pos];

    // Backtick — enter template mode
    if (ch === '`') {
      tokens.push({ type: TokenType.TEMPLATE_START, value: '`', start, end: start + 1 });
      pos++;
      modeStack.push('template');
      continue;
    }

    // `}` closes an interpolation when the expression mode is nested inside a template
    if (ch === '}' && modeStack.length >= 2 && modeStack[modeStack.length - 2] === 'template') {
      tokens.push({ type: TokenType.TEMPLATE_INTERP_END, value: '}', start, end: start + 1 });
      pos++;
      modeStack.pop();
      continue;
    }

    // Numbers
    if (/\d/.test(ch)) {
      let num = '';
      while (pos < input.length && /\d/.test(input[pos])) num += input[pos++];
      if (pos < input.length && input[pos] === '.') {
        num += input[pos++];
        while (pos < input.length && /\d/.test(input[pos])) num += input[pos++];
      }
      tokens.push({ type: TokenType.NUMBER, value: num, start, end: pos });
      continue;
    }

    // Strings (double or single quoted)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      pos++;
      let str = '';
      while (pos < input.length) {
        if (input[pos] === '\\' && pos + 1 < input.length) {
          pos++;
          switch (input[pos]) {
            case 'n':  str += '\n'; break;
            case 't':  str += '\t'; break;
            case '\\': str += '\\'; break;
            case "'":  str += "'";  break;
            case '"':  str += '"';  break;
            default:   str += '\\' + input[pos]; break;
          }
          pos++;
        } else if (input[pos] === quote) {
          // Excel-style doubled quote escape
          if (pos + 1 < input.length && input[pos + 1] === quote) {
            str += quote;
            pos += 2;
          } else {
            pos++;
            break;
          }
        } else {
          str += input[pos++];
        }
      }
      tokens.push({ type: TokenType.STRING, value: str, start, end: pos });
      continue;
    }

    // Bracket identifiers: [Column Name]
    if (ch === '[') {
      pos++;
      let name = '';
      while (pos < input.length && input[pos] !== ']') name += input[pos++];
      if (pos < input.length) pos++; // skip ]
      tokens.push({ type: TokenType.BRACKET_IDENTIFIER, value: name, start, end: pos });
      continue;
    }

    // Identifiers and keywords (TRUE / FALSE)
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (pos < input.length && /[a-zA-Z0-9_]/.test(input[pos])) id += input[pos++];
      const upper = id.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: TokenType.BOOLEAN, value: upper, start, end: pos });
      } else {
        tokens.push({ type: TokenType.IDENTIFIER, value: id, start, end: pos });
      }
      continue;
    }

    // Two-character operators
    if (pos + 1 < input.length) {
      const two = ch + input[pos + 1];
      if (two === '!=' || two === '<>') {
        tokens.push({ type: TokenType.NEQ, value: two, start, end: start + 2 });
        pos += 2;
        continue;
      }
      if (two === '<=') {
        tokens.push({ type: TokenType.LTE, value: two, start, end: start + 2 });
        pos += 2;
        continue;
      }
      if (two === '>=') {
        tokens.push({ type: TokenType.GTE, value: two, start, end: start + 2 });
        pos += 2;
        continue;
      }
    }

    // Single-character tokens
    if (ch in SINGLE_CHAR_TOKENS) {
      tokens.push({ type: SINGLE_CHAR_TOKENS[ch], value: ch, start, end: start + 1 });
      pos++;
      continue;
    }

    throw new FormulaParseError(`Unexpected character '${ch}' at position ${pos}`, pos, pos + 1);
  }

  if (modeStack.length > 1) {
    throw new FormulaParseError('Unterminated template literal', input.length, input.length);
  }

  tokens.push({ type: TokenType.EOF, value: '', start: pos, end: pos });
  return tokens;
}

/**
 * Fault-tolerant tokenizer for the editor. Never throws — produces ERROR tokens
 * for unexpected characters and handles unterminated strings/brackets gracefully.
 */
export function tokenizeSafe(input: string): { tokens: Token[]; error: FormulaParseError | null } {
  const tokens: Token[] = [];
  let pos = 0;
  let error: FormulaParseError | null = null;
  const modeStack: Mode[] = ['expression'];
  const templateStartStack: number[] = [];

  const setError = (e: FormulaParseError) => { if (!error) error = e; };

  while (pos < input.length) {
    const mode = modeStack[modeStack.length - 1];

    if (mode === 'template') {
      pos = scanTemplateText(input, pos, tokens, /* safe */ true, setError);
      // scanTemplateText in safe mode either consumed TEMPLATE_END/TEMPLATE_INTERP_START
      // (and adjusted modeStack via callback below) or hit EOF.
      // We need to detect mode transitions: the last emitted token tells us.
      const last = tokens[tokens.length - 1];
      if (last && last.type === TokenType.TEMPLATE_END) {
        modeStack.pop();
        templateStartStack.pop();
      } else if (last && last.type === TokenType.TEMPLATE_INTERP_START) {
        modeStack.push('expression');
      } else if (pos >= input.length) {
        // Unterminated template — record error at the opening backtick
        const openAt = templateStartStack[templateStartStack.length - 1] ?? pos;
        setError(new FormulaParseError('Unterminated template literal', openAt, pos));
        break;
      }
      continue;
    }

    // Expression mode
    if (/\s/.test(input[pos])) {
      pos++;
      continue;
    }

    const start = pos;
    const ch = input[pos];

    // Backtick — enter template mode
    if (ch === '`') {
      tokens.push({ type: TokenType.TEMPLATE_START, value: '`', start, end: start + 1 });
      pos++;
      modeStack.push('template');
      templateStartStack.push(start);
      continue;
    }

    // `}` closes an interpolation when the expression mode is nested inside a template
    if (ch === '}' && modeStack.length >= 2 && modeStack[modeStack.length - 2] === 'template') {
      tokens.push({ type: TokenType.TEMPLATE_INTERP_END, value: '}', start, end: start + 1 });
      pos++;
      modeStack.pop();
      continue;
    }

    // Numbers
    if (/\d/.test(ch)) {
      let num = '';
      while (pos < input.length && /\d/.test(input[pos])) num += input[pos++];
      if (pos < input.length && input[pos] === '.') {
        num += input[pos++];
        while (pos < input.length && /\d/.test(input[pos])) num += input[pos++];
      }
      tokens.push({ type: TokenType.NUMBER, value: num, start, end: pos });
      continue;
    }

    // Strings (double or single quoted)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      pos++;
      let str = '';
      let terminated = false;
      while (pos < input.length) {
        if (input[pos] === '\\' && pos + 1 < input.length) {
          pos++;
          switch (input[pos]) {
            case 'n':  str += '\n'; break;
            case 't':  str += '\t'; break;
            case '\\': str += '\\'; break;
            case "'":  str += "'";  break;
            case '"':  str += '"';  break;
            default:   str += '\\' + input[pos]; break;
          }
          pos++;
        } else if (input[pos] === quote) {
          if (pos + 1 < input.length && input[pos + 1] === quote) {
            str += quote;
            pos += 2;
          } else {
            pos++;
            terminated = true;
            break;
          }
        } else {
          str += input[pos++];
        }
      }
      if (!terminated) {
        setError(new FormulaParseError(`Unterminated string starting at position ${start}`, start, pos));
      }
      tokens.push({ type: terminated ? TokenType.STRING : TokenType.ERROR, value: str, start, end: pos });
      continue;
    }

    // Bracket identifiers: [Column Name]
    if (ch === '[') {
      pos++;
      let name = '';
      while (pos < input.length && input[pos] !== ']') name += input[pos++];
      const terminated = pos < input.length;
      if (terminated) pos++; // skip ]
      if (!terminated) {
        setError(new FormulaParseError(`Unterminated bracket identifier starting at position ${start}`, start, pos));
      }
      tokens.push({ type: terminated ? TokenType.BRACKET_IDENTIFIER : TokenType.ERROR, value: name, start, end: pos });
      continue;
    }

    // Identifiers and keywords (TRUE / FALSE)
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (pos < input.length && /[a-zA-Z0-9_]/.test(input[pos])) id += input[pos++];
      const upper = id.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: TokenType.BOOLEAN, value: upper, start, end: pos });
      } else {
        tokens.push({ type: TokenType.IDENTIFIER, value: id, start, end: pos });
      }
      continue;
    }

    // Two-character operators
    if (pos + 1 < input.length) {
      const two = ch + input[pos + 1];
      if (two === '!=' || two === '<>') {
        tokens.push({ type: TokenType.NEQ, value: two, start, end: start + 2 });
        pos += 2;
        continue;
      }
      if (two === '<=') {
        tokens.push({ type: TokenType.LTE, value: two, start, end: start + 2 });
        pos += 2;
        continue;
      }
      if (two === '>=') {
        tokens.push({ type: TokenType.GTE, value: two, start, end: start + 2 });
        pos += 2;
        continue;
      }
    }

    // Single-character tokens
    if (ch in SINGLE_CHAR_TOKENS) {
      tokens.push({ type: SINGLE_CHAR_TOKENS[ch], value: ch, start, end: start + 1 });
      pos++;
      continue;
    }

    // Unknown character — produce ERROR token and continue
    setError(new FormulaParseError(`Unexpected character '${ch}' at position ${pos}`, pos, pos + 1));
    tokens.push({ type: TokenType.ERROR, value: ch, start: pos, end: pos + 1 });
    pos++;
  }

  // Unterminated template at end of input (reached while still in expression mode inside interp)
  if (modeStack.length > 1 && !error) {
    const openAt = templateStartStack[templateStartStack.length - 1] ?? pos;
    setError(new FormulaParseError('Unterminated template literal', openAt, pos));
  }

  tokens.push({ type: TokenType.EOF, value: '', start: pos, end: pos });
  return { tokens, error };
}

/**
 * Scan template text starting at `pos`. Accumulates text until hitting a backtick
 * (closing template) or `{` (opening interpolation). Emits TEMPLATE_TEXT (if any
 * text was collected), followed by TEMPLATE_END or TEMPLATE_INTERP_START.
 *
 * Returns the new `pos`. Caller is responsible for updating the mode stack
 * based on the last emitted token.
 *
 * In safe mode, hitting EOF inside template text emits any accumulated text as
 * TEMPLATE_TEXT and returns pos at EOF. In strict mode, throws.
 */
function scanTemplateText(
  input: string,
  pos: number,
  tokens: Token[],
  safe: boolean,
  setError: ((e: FormulaParseError) => void) | null,
): number {
  const start = pos;
  let text = '';

  while (pos < input.length && input[pos] !== '`' && input[pos] !== '{') {
    if (input[pos] === '\\' && pos + 1 < input.length) {
      pos++;
      switch (input[pos]) {
        case 'n':  text += '\n'; break;
        case 't':  text += '\t'; break;
        case '\\': text += '\\'; break;
        case '`':  text += '`';  break;
        case '{':  text += '{';  break;
        case '}':  text += '}';  break;
        default:   text += '\\' + input[pos]; break;
      }
      pos++;
    } else {
      text += input[pos++];
    }
  }

  if (text.length > 0) {
    tokens.push({ type: TokenType.TEMPLATE_TEXT, value: text, start, end: pos });
  }

  if (pos >= input.length) {
    if (safe) {
      return pos;
    }
    throw new FormulaParseError('Unterminated template literal', start, pos);
  }

  if (input[pos] === '`') {
    tokens.push({ type: TokenType.TEMPLATE_END, value: '`', start: pos, end: pos + 1 });
    pos++;
  } else {
    // input[pos] === '{'
    tokens.push({ type: TokenType.TEMPLATE_INTERP_START, value: '{', start: pos, end: pos + 1 });
    pos++;
  }

  // Suppress unused-param warnings for the strict path
  void setError;

  return pos;
}
