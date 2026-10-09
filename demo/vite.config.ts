import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const src = (path: string): string => fileURLToPath(new URL(`../src/${path}`, import.meta.url));

export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    base: './',
    plugins: [react()],
    resolve: {
        alias: [
            { find: /^@ghegar\/tamiz\/react$/, replacement: src('react/index.ts') },
            { find: /^@ghegar\/tamiz\/ol$/, replacement: src('ol/index.ts') },
            { find: /^@ghegar\/tamiz$/, replacement: src('core/index.ts') },
        ],
    },
    build: {
        outDir: fileURLToPath(new URL('../demo-dist', import.meta.url)),
        emptyOutDir: true,
    },
});
