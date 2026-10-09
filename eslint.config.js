import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
    { ignores: ['dist', 'demo-dist', 'node_modules', 'test-results'] },
    js.configs.recommended,
    ...tseslint.configs.strict,
    {
        files: ['**/*.{ts,tsx}'],
        plugins: { 'react-hooks': reactHooks },
        rules: {
            ...reactHooks.configs.recommended.rules,
            indent: ['error', 4, { SwitchCase: 1 }],
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],
            'max-lines': ['error', { max: 300, skipBlankLines: true }],
            'no-warning-comments': 'off',
        },
    },
);
