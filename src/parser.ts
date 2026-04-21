import { Token, TokenType, ASTNode, FormulaParseError } from './types.js';
import { tokenize } from './tokenizer.js';

export function parse(formula: string): ASTNode {
  const tokens = tokenize(formula);
  let pos = 0;

  function current(): Token {
    return tokens[pos];
  }

  function eat(type: TokenType): Token {
    const token = current();
    if (token.type !== type) {
      throw new FormulaParseError(
        `Expected ${type} but got ${token.type} ("${token.value}") at position ${token.start}`,
        token.start,
        token.end,
      );
    }
    pos++;
    return token;
  }

  function setRange<T extends ASTNode>(node: T, start: number, end: number): T {
    node.start = start;
    node.end = end;
    return node;
  }

  // expression → comparison
  function parseExpression(): ASTNode {
    return parseComparison();
  }

  // comparison → addition ( comp_op addition )?     (single, non-chaining)
  function parseComparison(): ASTNode {
    const startTok = tokens[pos];
    let node = parseAddition();

    const compOps = [
      TokenType.EQ, TokenType.NEQ,
      TokenType.LT, TokenType.GT,
      TokenType.LTE, TokenType.GTE,
    ];

    if (compOps.includes(current().type)) {
      const op = current().value;
      pos++;
      const right = parseAddition();
      node = setRange(
        { type: 'binary', operator: op, left: node, right },
        startTok.start,
        tokens[pos - 1].end,
      );
    }

    return node;
  }

  // addition → multiplication ( ("+" | "-" | "&") multiplication )*
  function parseAddition(): ASTNode {
    const startTok = tokens[pos];
    let node = parseMultiplication();

    while (
      current().type === TokenType.PLUS ||
      current().type === TokenType.MINUS ||
      current().type === TokenType.AMPERSAND
    ) {
      const op = current().value;
      pos++;
      const right = parseMultiplication();
      node = setRange(
        { type: 'binary', operator: op, left: node, right },
        startTok.start,
        tokens[pos - 1].end,
      );
    }

    return node;
  }

  // multiplication → power ( ("*" | "/" | "%") power )*
  function parseMultiplication(): ASTNode {
    const startTok = tokens[pos];
    let node = parsePower();

    while (
      current().type === TokenType.STAR ||
      current().type === TokenType.SLASH ||
      current().type === TokenType.PERCENT
    ) {
      const op = current().value;
      pos++;
      const right = parsePower();
      node = setRange(
        { type: 'binary', operator: op, left: node, right },
        startTok.start,
        tokens[pos - 1].end,
      );
    }

    return node;
  }

  // power → unary ( "^" power )?     (right-associative)
  function parsePower(): ASTNode {
    const startTok = tokens[pos];
    const node = parseUnary();

    if (current().type === TokenType.CARET) {
      pos++;
      const right = parsePower();
      return setRange(
        { type: 'binary', operator: '^', left: node, right },
        startTok.start,
        tokens[pos - 1].end,
      );
    }

    return node;
  }

  // unary → "-" unary | primary
  function parseUnary(): ASTNode {
    if (current().type === TokenType.MINUS) {
      const startTok = current();
      pos++;
      const operand = parseUnary();
      return setRange(
        { type: 'unary', operator: '-', operand },
        startTok.start,
        tokens[pos - 1].end,
      );
    }
    return parsePrimary();
  }

  // primary → NUMBER | STRING | BOOLEAN | "[" name "]" | IDENT "(" args ")" | IDENT | "(" expr ")"
  function parsePrimary(): ASTNode {
    const token = current();

    switch (token.type) {
      case TokenType.NUMBER:
        pos++;
        return setRange({ type: 'number', value: Number(token.value) }, token.start, token.end);

      case TokenType.STRING:
        pos++;
        return setRange({ type: 'string', value: token.value }, token.start, token.end);

      case TokenType.BOOLEAN:
        pos++;
        return setRange({ type: 'boolean', value: token.value === 'TRUE' }, token.start, token.end);

      case TokenType.BRACKET_IDENTIFIER:
        pos++;
        return setRange({ type: 'column', name: token.value }, token.start, token.end);

      case TokenType.IDENTIFIER: {
        // Lookahead: function call if followed by "("
        if (pos + 1 < tokens.length && tokens[pos + 1].type === TokenType.LPAREN) {
          return parseFunctionCall();
        }
        pos++;
        return setRange({ type: 'column', name: token.value }, token.start, token.end);
      }

      case TokenType.LPAREN: {
        pos++;
        const expr = parseExpression();
        eat(TokenType.RPAREN);
        return expr;
      }

      case TokenType.TEMPLATE_START: {
        const startTok = token;
        pos++;
        const parts: string[] = [];
        const expressions: ASTNode[] = [];
        let textBuffer = '';

        while (current().type !== TokenType.TEMPLATE_END) {
          if (current().type === TokenType.TEMPLATE_TEXT) {
            textBuffer += current().value;
            pos++;
          } else if (current().type === TokenType.TEMPLATE_INTERP_START) {
            parts.push(textBuffer);
            textBuffer = '';
            pos++;
            expressions.push(parseExpression());
            eat(TokenType.TEMPLATE_INTERP_END);
          } else {
            const t = current();
            throw new FormulaParseError(
              `Unexpected token "${t.value}" (${t.type}) in template at position ${t.start}`,
              t.start,
              t.end,
            );
          }
        }
        parts.push(textBuffer);
        pos++; // consume TEMPLATE_END
        const endTok = tokens[pos - 1];

        if (expressions.length === 0) {
          return setRange({ type: 'string', value: parts[0] }, startTok.start, endTok.end);
        }
        return setRange({ type: 'template', parts, expressions }, startTok.start, endTok.end);
      }

      default:
        throw new FormulaParseError(
          `Unexpected token "${token.value}" (${token.type}) at position ${token.start}`,
          token.start,
          token.end,
        );
    }
  }

  // functionCall → IDENT "(" ( expression ( "," expression )* )? ")"
  function parseFunctionCall(): ASTNode {
    const startTok = current();
    const name = eat(TokenType.IDENTIFIER).value;
    eat(TokenType.LPAREN);

    const args: ASTNode[] = [];
    if (current().type !== TokenType.RPAREN) {
      args.push(parseExpression());
      while (current().type === TokenType.COMMA) {
        pos++;
        args.push(parseExpression());
      }
    }

    eat(TokenType.RPAREN);
    return setRange(
      { type: 'function', name: name.toUpperCase(), args },
      startTok.start,
      tokens[pos - 1].end,
    );
  }

  const result = parseExpression();
  if (current().type !== TokenType.EOF) {
    const token = current();
    throw new FormulaParseError(
      `Unexpected token "${token.value}" at position ${token.start}`,
      token.start,
      token.end,
    );
  }
  return result;
}
