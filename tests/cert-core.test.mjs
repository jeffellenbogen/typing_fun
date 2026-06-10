// Tests for the certificate PNG-chunk core embedded in index.html.
// The code under test is DOM-free and lives between CERT-CORE-START/END
// markers so it can run in Node exactly as shipped.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const m = html.match(/\/\/ CERT-CORE-START([\s\S]*?)\/\/ CERT-CORE-END/);
if (!m) {
  console.error('FAIL: CERT-CORE-START/END block not found in index.html');
  process.exit(1);
}
const core = new Function(m[1] + '\nreturn {crc32, pngInsertText, pngExtractText, b64EncodeUtf8, b64DecodeUtf8};')();
const {crc32, pngInsertText, pngExtractText, b64EncodeUtf8, b64DecodeUtf8} = core;

// 1x1 transparent PNG
const PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'));

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log('ok   ' + name);
  else { console.error('FAIL ' + name + (detail ? ' — ' + detail : '')); failures++; }
}

// CRC-32 known vector: crc32("123456789") === 0xCBF43926
const vec = new TextEncoder().encode('123456789');
check('crc32 known vector', (crc32(vec) >>> 0) === 0xCBF43926,
  'got 0x' + (crc32(vec) >>> 0).toString(16));

// UTF-8 base64 roundtrip
const name = 'Zoë ⭐ Typist';
check('utf8 base64 roundtrip', b64DecodeUtf8(b64EncodeUtf8(name)) === name);

// Insert + extract roundtrip
const payload = b64EncodeUtf8(JSON.stringify({kind: 'typingAdventureSave', v: 1, name}));
const out = pngInsertText(PNG, 'typingAdventureSave', payload);
check('roundtrip extract', pngExtractText(out, 'typingAdventureSave') === payload);

// PNG structure preserved
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
check('signature preserved', SIG.every((b, i) => out[i] === b));
const tail = String.fromCharCode(...out.slice(out.length - 8, out.length - 4));
check('IEND still last chunk', tail === 'IEND');
check('output grew by chunk size', out.length === PNG.length + 12 + 'typingAdventureSave'.length + 1 + payload.length);

// Missing chunk and non-PNG input
check('no chunk -> null', pngExtractText(PNG, 'typingAdventureSave') === null);
check('non-png -> null', pngExtractText(new TextEncoder().encode('not a png at all'), 'typingAdventureSave') === null);

// Other keyword does not match
check('wrong keyword -> null', pngExtractText(out, 'somethingElse') === null);

process.exit(failures ? 1 : 0);
