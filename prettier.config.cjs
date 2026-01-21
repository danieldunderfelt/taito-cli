module.exports = {
  importOrderParserPlugins: ['importAssertions', 'typescript', 'jsx'],
  plugins: ['@ianvs/prettier-plugin-sort-imports'],
  singleQuote: true,
  semi: false,
  bracketSpacing: true,
  arrowParens: 'always',
  bracketSameLine: true,
  trailingComma: 'es5',
  overrides: [
    {
      files: '*.jsonc',
      options: {
        semi: false,
        trailingComma: 'none',
      },
    },
  ],
}
