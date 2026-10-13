import base from '@ghegar/eslint-config';
import react from '@ghegar/eslint-config/react';
import ts from '@ghegar/eslint-config/ts';

export default [
    { ignores: ['demo-dist/', 'test-results/', 'playwright-report/'] },
    ...base,
    ...react,
    ...ts,
];
