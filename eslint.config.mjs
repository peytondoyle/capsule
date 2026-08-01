import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const config = [
  // Build output and imported design-source exports, not source — see
  // build:sw and build:detect; docs/design-directions is the Claude Design
  // capture (Capsule.dc.html and its runtime).
  { ignores: ['.next/**', 'next-env.d.ts', 'public/sw.js', 'public/detect-worker.js', 'docs/design-directions/**'] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // `const { id: _id, ...safe } = patch` is how we strip fields a caller
      // must not be able to set. The discards are intentional.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]

export default config
