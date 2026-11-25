import {mkdir, copyFile} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await mkdir(dist, {recursive: true});
// Explicit asset allowlist prevents secrets, source history and tests being uploaded.
for (const name of ['index.html', 'styles.css', 'game.js', 'classic.js', 'service-config.js']) {
    await copyFile(new URL(name, root), new URL(name, dist));
}
console.log('Shared site assets prepared. No credentials are included.');
