import { describe, it, expect } from 'vitest';
import { createBuiltinFunctions } from '../src/functions.js';
import { BUILTIN_FUNCTIONS } from '../src/editor/constants.js';

describe('builtin runtime <-> autocomplete metadata sync', () => {
  it('every runtime builtin has a matching BUILTIN_FUNCTIONS entry', () => {
    // Runtime registry = the actual implementations available at eval time.
    // BUILTIN_FUNCTIONS = the metadata the editor uses for autocomplete and
    // validation. They MUST stay in sync — a function the runtime knows but
    // the editor doesn't will be flagged as "unknown" in red and won't appear
    // in autocomplete (the bug that prompted this test).
    const runtime = new Set(createBuiltinFunctions().keys());
    const metadata = new Set(BUILTIN_FUNCTIONS.map(f => f.name.toUpperCase()));

    const missing = [...runtime].filter(name => !metadata.has(name));
    expect(
      missing,
      `Runtime functions missing from BUILTIN_FUNCTIONS (editor will mark them unknown): ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
