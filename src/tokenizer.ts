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

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    if (/\s/.test(input[pos])) {
      pos++;
      continue;
    }

    const start = pos;
    const ch = input[pos];

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

  while (pos < input.length) {
    if (/\s/.test(input[pos])) {
      pos++;
      continue;
    }

    const start = pos;
    const ch = input[pos];

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
      if (!terminated && !error) {
        error = new FormulaParseError(`Unterminated string starting at position ${start}`, start, pos);
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
      if (!terminated && !error) {
        error = new FormulaParseError(`Unterminated bracket identifier starting at position ${start}`, start, pos);
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
    if (!error) {
      error = new FormulaParseError(`Unexpected character '${ch}' at position ${pos}`, pos, pos + 1);
    }
    tokens.push({ type: TokenType.ERROR, value: ch, start: pos, end: pos + 1 });
    pos++;
  }

  tokens.push({ type: TokenType.EOF, value: '', start: pos, end: pos });
  return { tokens, error };
}
