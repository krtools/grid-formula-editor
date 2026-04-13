import { Token, TokenType } from './types.js';

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
      tokens.push({ type: TokenType.NUMBER, value: num, position: start });
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
      tokens.push({ type: TokenType.STRING, value: str, position: start });
      continue;
    }

    // Bracket identifiers: [Column Name]
    if (ch === '[') {
      pos++;
      let name = '';
      while (pos < input.length && input[pos] !== ']') name += input[pos++];
      if (pos < input.length) pos++; // skip ]
      tokens.push({ type: TokenType.BRACKET_IDENTIFIER, value: name, position: start });
      continue;
    }

    // Identifiers and keywords (TRUE / FALSE)
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (pos < input.length && /[a-zA-Z0-9_]/.test(input[pos])) id += input[pos++];
      const upper = id.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: TokenType.BOOLEAN, value: upper, position: start });
      } else {
        tokens.push({ type: TokenType.IDENTIFIER, value: id, position: start });
      }
      continue;
    }

    // Two-character operators
    if (pos + 1 < input.length) {
      const two = ch + input[pos + 1];
      if (two === '!=' || two === '<>') {
        tokens.push({ type: TokenType.NEQ, value: two, position: start });
        pos += 2;
        continue;
      }
      if (two === '<=') {
        tokens.push({ type: TokenType.LTE, value: two, position: start });
        pos += 2;
        continue;
      }
      if (two === '>=') {
        tokens.push({ type: TokenType.GTE, value: two, position: start });
        pos += 2;
        continue;
      }
    }

    // Single-character tokens
    if (ch in SINGLE_CHAR_TOKENS) {
      tokens.push({ type: SINGLE_CHAR_TOKENS[ch], value: ch, position: start });
      pos++;
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${pos}`);
  }

  tokens.push({ type: TokenType.EOF, value: '', position: pos });
  return tokens;
}
