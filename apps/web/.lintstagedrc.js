module.exports = {
  '*.{ts,tsx}': [
    'biome lint --write',
    'vitest run --related --passWithNoTests',
  ],
  '*.{js,jsx}': [
    'biome lint --write',
  ],
  '*.{json,md}': [
    'biome format --write',
  ],
};

