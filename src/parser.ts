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

  // expression → comparison
  function parseExpression(): ASTNode {
    return parseComparison();
  }

  // comparison → addition ( comp_op addition )?     (single, non-chaining)
  function parseComparison(): ASTNode {
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
      node = { type: 'binary', operator: op, left: node, right };
    }

    return node;
  }

  // addition → multiplication ( ("+" | "-" | "&") multiplication )*
  function parseAddition(): ASTNode {
    let node = parseMultiplication();

    while (
      current().type === TokenType.PLUS ||
      current().type === TokenType.MINUS ||
      current().type === TokenType.AMPERSAND
    ) {
      const op = current().value;
      pos++;
      const right = parseMultiplication();
      node = { type: 'binary', operator: op, left: node, right };
    }

    return node;
  }

  // multiplication → power ( ("*" | "/" | "%") power )*
  function parseMultiplication(): ASTNode {
    let node = parsePower();

    while (
      current().type === TokenType.STAR ||
      current().type === TokenType.SLASH ||
      current().type === TokenType.PERCENT
    ) {
      const op = current().value;
      pos++;
      const right = parsePower();
      node = { type: 'binary', operator: op, left: node, right };
    }

    return node;
  }

  // power → unary ( "^" power )?     (right-associative)
  function parsePower(): ASTNode {
    const node = parseUnary();

    if (current().type === TokenType.CARET) {
      pos++;
      const right = parsePower();
      return { type: 'binary', operator: '^', left: node, right };
    }

    return node;
  }

  // unary → "-" unary | primary
  function parseUnary(): ASTNode {
    if (current().type === TokenType.MINUS) {
      pos++;
      const operand = parseUnary();
      return { type: 'unary', operator: '-', operand };
    }
    return parsePrimary();
  }

  // primary → NUMBER | STRING | BOOLEAN | "[" name "]" | IDENT "(" args ")" | IDENT | "(" expr ")"
  function parsePrimary(): ASTNode {
    const token = current();

    switch (token.type) {
      case TokenType.NUMBER:
        pos++;
        return { type: 'number', value: Number(token.value) };

      case TokenType.STRING:
        pos++;
        return { type: 'string', value: token.value };

      case TokenType.BOOLEAN:
        pos++;
        return { type: 'boolean', value: token.value === 'TRUE' };

      case TokenType.BRACKET_IDENTIFIER:
        pos++;
        return { type: 'column', name: token.value };

      case TokenType.IDENTIFIER: {
        // Lookahead: function call if followed by "("
        if (pos + 1 < tokens.length && tokens[pos + 1].type === TokenType.LPAREN) {
          return parseFunctionCall();
        }
        pos++;
        return { type: 'column', name: token.value };
      }

      case TokenType.LPAREN: {
        pos++;
        const expr = parseExpression();
        eat(TokenType.RPAREN);
        return expr;
      }

      case TokenType.TEMPLATE_START: {
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

        if (expressions.length === 0) {
          return { type: 'string', value: parts[0] };
        }
        return { type: 'template', parts, expressions };
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
    return { type: 'function', name: name.toUpperCase(), args };
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
