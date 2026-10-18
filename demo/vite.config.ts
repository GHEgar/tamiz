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
            { find: /^@npmegar\/tamiz\/react$/, replacement: src('react/index.ts') },
            { find: /^@npmegar\/tamiz\/ol$/, replacement: src('ol/index.ts') },
            { find: /^@npmegar\/tamiz$/, replacement: src('core/index.ts') },
        ],
    },
    build: {
        outDir: fileURLToPath(new URL('../demo-dist', import.meta.url)),
        emptyOutDir: true,
        rolldownOptions: {
            output: {
                codeSplitting: {
                    groups: [
                        { name: 'ol', test: /node_modules[\\/](ol|rbush|quickselect|earcut|color-|pbf)/, priority: 20 },
                        { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 10 },
                    ],
                },
            },
        },
    },
});
