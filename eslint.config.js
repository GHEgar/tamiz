import base from '@npmegar/eslint-config';
import react from '@npmegar/eslint-config/react';
import ts from '@npmegar/eslint-config/ts';

export default [
    { ignores: ['demo-dist/'] },
    ...base,
    ...react,
    ...ts,
];
