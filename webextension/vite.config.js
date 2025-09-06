import process from 'node:process';
import {defineConfig} from 'vite';
import webExtension, {readJsonFile} from 'vite-plugin-web-extension';

const target = process.env.TARGET || 'chrome';

/**
 * @returns {import('vite').UserConfig} The Vite configuration
 */
function generateManifest() {
    const manifest = readJsonFile('manifest.json');
    const pkg = readJsonFile('package.json');
    return {
        name: pkg.name,
        description: pkg.description,
        version: pkg.version,
        ...manifest,
    };
}

export default defineConfig({
    plugins: [
        webExtension({
            manifest: generateManifest,
            watchFilePaths: ['package.json', 'manifest.json'],
            browser: process.env.TARGET || 'chrome',
        }),
    ],
    build: {
        sourcemap: true,
        outDir: target ? `dist-${process.env.TARGET}` : 'dist',
    },
});
