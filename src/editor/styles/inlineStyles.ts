import { FormulaColorConfig, FormulaStyleConfig } from '../types.js';
import { DEFAULT_COLORS, DEFAULT_STYLES } from '../constants.js';
import { TokenType } from '../../types.js';

export function mergeColors(custom?: FormulaColorConfig): Required<FormulaColorConfig> {
  return { ...DEFAULT_COLORS, ...custom };
}

export function mergeStyles(custom?: FormulaStyleConfig): Required<FormulaStyleConfig> {
  return { ...DEFAULT_STYLES, ...custom };
}

/** Map each token type to a color key from FormulaColorConfig. */
const TOKEN_COLOR_MAP: Record<TokenType, keyof FormulaColorConfig> = {
  [TokenType.NUMBER]: 'number',
  [TokenType.STRING]: 'string',
  [TokenType.BOOLEAN]: 'boolean',
  [TokenType.IDENTIFIER]: 'column',
  [TokenType.BRACKET_IDENTIFIER]: 'bracketColumn',
  [TokenType.LPAREN]: 'paren',
  [TokenType.RPAREN]: 'paren',
  [TokenType.COMMA]: 'paren',
  [TokenType.PLUS]: 'operator',
  [TokenType.MINUS]: 'operator',
  [TokenType.STAR]: 'operator',
  [TokenType.SLASH]: 'operator',
  [TokenType.PERCENT]: 'operator',
  [TokenType.CARET]: 'operator',
  [TokenType.AMPERSAND]: 'operator',
  [TokenType.EQ]: 'operator',
  [TokenType.NEQ]: 'operator',
  [TokenType.LT]: 'operator',
  [TokenType.GT]: 'operator',
  [TokenType.LTE]: 'operator',
  [TokenType.GTE]: 'operator',
  [TokenType.EOF]: 'text',
  [TokenType.ERROR]: 'error',
};

/**
 * Returns the color for a token. Function-call identifiers
 * use the functionName color; this is handled by the isFunctionName flag.
 */
export function getTokenColor(
  tokenType: TokenType,
  colors: Required<FormulaColorConfig>,
  isFunctionName?: boolean,
): string {
  if (isFunctionName && tokenType === TokenType.IDENTIFIER) {
    return colors.functionName;
  }
  const key = TOKEN_COLOR_MAP[tokenType];
  return colors[key] || colors.text;
}

export function getContainerStyle(customStyle?: React.CSSProperties): React.CSSProperties {
  return {
    position: 'relative',
    display: 'inline-block',
    width: '100%',
    ...customStyle,
  };
}

export function getEditorStyle(
  colors: Required<FormulaColorConfig>,
  styles: Required<FormulaStyleConfig>,
): React.CSSProperties {
  return {
    minHeight: styles.editorMinHeight,
    padding: styles.editorPadding,
    borderWidth: styles.editorBorderWidth,
    borderStyle: 'solid',
    borderColor: styles.editorBorderColor,
    borderRadius: styles.editorBorderRadius,
    outline: 'none',
    fontSize: styles.fontSize,
    fontFamily: styles.fontFamily,
    lineHeight: styles.lineHeight,
    backgroundColor: colors.background,
    color: colors.text,
    caretColor: colors.cursor,
    whiteSpace: 'pre',
    overflowX: 'auto',
    overflowY: 'hidden',
    cursor: 'text',
  };
}

export function getEditorFocusStyle(styles: Required<FormulaStyleConfig>): React.CSSProperties {
  return {
    borderColor: styles.editorFocusBorderColor,
    boxShadow: styles.editorFocusShadow,
  };
}

export function getPlaceholderStyle(
  colors: Required<FormulaColorConfig>,
  styles: Required<FormulaStyleConfig>,
): React.CSSProperties {
  const parts = styles.editorPadding.split(/\s+/);
  const topPad = parts[0] || '6px';
  const leftPad = parts.length >= 4 ? parts[3] : parts.length >= 2 ? parts[1] : topPad;

  return {
    position: 'absolute',
    top: topPad,
    left: leftPad,
    color: colors.placeholder,
    pointerEvents: 'none',
    fontSize: styles.fontSize,
    fontFamily: styles.fontFamily,
    lineHeight: styles.lineHeight,
    userSelect: 'none',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}

export function getDropdownStyle(
  colors: Required<FormulaColorConfig>,
  styles: Required<FormulaStyleConfig>,
): React.CSSProperties {
  return {
    position: 'absolute',
    zIndex: styles.dropdownZIndex,
    backgroundColor: colors.background,
    border: `1px solid ${styles.dropdownBorderColor}`,
    borderRadius: styles.dropdownBorderRadius,
    boxShadow: styles.dropdownShadow,
    maxHeight: styles.dropdownMaxHeight,
    overflowY: 'auto',
    width: 'max-content',
    minWidth: styles.dropdownMinWidth,
    maxWidth: styles.dropdownMaxWidth,
    padding: '4px 0',
  };
}

export function getDropdownItemStyle(
  isSelected: boolean,
  colors: Required<FormulaColorConfig>,
  styles: Required<FormulaStyleConfig>,
): React.CSSProperties {
  return {
    padding: styles.dropdownItemPadding,
    cursor: 'pointer',
    fontSize: styles.dropdownItemFontSize,
    fontFamily: styles.fontFamily,
    backgroundColor: isSelected ? colors.dropdownSelected : 'transparent',
    color: isSelected ? '#ffffff' : colors.text,
    display: 'flex',
    alignItems: 'center',
    gap: styles.dropdownItemContentGap,
    lineHeight: '1.4',
  };
}

export function getDropdownItemLabelStyle(): React.CSSProperties {
  return {
    flex: 1,
    fontWeight: 500,
  };
}

export function getDropdownItemDescStyle(): React.CSSProperties {
  return {
    fontSize: '11px',
    opacity: 0.7,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexShrink: 1,
    minWidth: 0,
  };
}

export function getDropdownItemTypeStyle(
  isSelected: boolean,
  styles: Required<FormulaStyleConfig>,
): React.CSSProperties {
  return {
    fontSize: '10px',
    padding: '1px 5px',
    borderRadius: '3px',
    backgroundColor: isSelected ? styles.typeBadgeSelectedBg : styles.typeBadgeBg,
    color: isSelected ? styles.typeBadgeSelectedColor : styles.typeBadgeColor,
    flexShrink: 0,
  };
}

export function getErrorIndicatorStyle(
  colors: Required<FormulaColorConfig>,
): React.CSSProperties {
  return {
    fontSize: '12px',
    color: colors.error,
    marginTop: '2px',
    fontFamily: 'inherit',
  };
}
