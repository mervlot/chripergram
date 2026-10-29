// Run: node --experimental-strip-types scripts/test-media-types.mjs
// Tests MIME normalization, byte sniffing and upload resolution (no server needed).
import assert from 'node:assert/strict';
import {
  normalizeMime, isAcceptableDeclaredMime, typeForDeclaredMime, sniffMediaType, resolveUpload, FIELD_KINDS,
} from '../src/utils/mediaTypes.ts';

const bytes = (...b) => Uint8Array.from(b);
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const pad = (arr, n = 32) => Uint8Array.from([...arr, ...new Array(Math.max(0, n - arr.length)).fill(0)]);

const WEBM = pad([0x1a, 0x45, 0xdf, 0xa3]);
const MP4 = pad([0, 0, 0, 0x18, ...ascii('ftyp'), ...ascii('isom')]);
const MOV = pad([0, 0, 0, 0x14, ...ascii('ftyp'), ...ascii('qt  ')]);
const M4A = pad([0, 0, 0, 0x18, ...ascii('ftyp'), ...ascii('M4A ')]);
const GP3 = pad([0, 0, 0, 0x14, ...ascii('ftyp'), ...ascii('3gp4')]);
const OGG = pad(ascii('OggS'));
const JPG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = pad(ascii('GIF89a'));
const WEBP = pad([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')]);
const WAV = pad([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')]);
const HTML = pad(ascii('<!doctype html><script>alert(1)</script>'));
const SVG = pad(ascii('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'));

// --- normalization: the actual production failure ---
assert.equal(normalizeMime('video/webm;codecs=vp9,opus'), 'video/webm');
assert.equal(normalizeMime('video/webm; codecs=vp8, opus'), 'video/webm');
assert.equal(normalizeMime('Audio/WebM;codecs=opus'), 'audio/webm');
assert.equal(normalizeMime(undefined), '');
assert.equal(normalizeMime(42), '');
assert.equal(typeForDeclaredMime('video/webm;codecs=vp9,opus')?.ext, '.webm');
assert.equal(typeForDeclaredMime('audio/webm;codecs=opus')?.ext, '.weba');

// --- declared types: aliases and rejects ---
assert.equal(typeForDeclaredMime('video/x-m4v')?.mime, 'video/mp4');
assert.equal(typeForDeclaredMime('video/3gpp')?.ext, '.3gp');
assert.equal(typeForDeclaredMime('audio/x-wav')?.mime, 'audio/wav');
assert.equal(isAcceptableDeclaredMime('application/octet-stream'), true); // bytes decide
assert.equal(isAcceptableDeclaredMime(''), true);
assert.equal(isAcceptableDeclaredMime('text/plain'), true); // unparseable part header fallback; bytes decide
for (const bad of ['text/html', 'image/svg+xml', 'application/javascript', 'application/pdf', 'video/x-msvideo']) {
  assert.equal(isAcceptableDeclaredMime(bad), false, bad);
}

// --- sniffing ---
assert.equal(sniffMediaType(JPG)?.mime, 'image/jpeg');
assert.equal(sniffMediaType(PNG)?.mime, 'image/png');
assert.equal(sniffMediaType(GIF)?.mime, 'image/gif');
assert.equal(sniffMediaType(WEBP)?.mime, 'image/webp');
assert.equal(sniffMediaType(WAV)?.mime, 'audio/wav');
assert.equal(sniffMediaType(OGG)?.mime, 'audio/ogg');
assert.equal(sniffMediaType(MP4)?.mime, 'video/mp4');
assert.equal(sniffMediaType(MOV)?.mime, 'video/quicktime');
assert.equal(sniffMediaType(GP3)?.mime, 'video/3gpp');
assert.equal(sniffMediaType(M4A)?.mime, 'audio/mp4');
assert.equal(sniffMediaType(HTML), undefined);
assert.equal(sniffMediaType(SVG), undefined);
// webm: audio vs video share the EBML header, so the declared kind decides.
assert.equal(sniffMediaType(WEBM, 'video/webm;codecs=vp9,opus')?.ext, '.webm');
assert.equal(sniffMediaType(WEBM, 'audio/webm;codecs=opus')?.ext, '.weba');
// Safari audio recordings are isom/mp4 containers declared audio/mp4.
assert.equal(sniffMediaType(MP4, 'audio/mp4')?.ext, '.m4a');

// --- resolveUpload: full decision ---
let r = resolveUpload(WEBM, 5000, 'video/webm;codecs=vp9,opus');
assert.ok(r.ok && r.type.mime === 'video/webm' && r.type.ext === '.webm' && !r.inferred);
r = resolveUpload(WEBM, 5000, 'audio/webm;codecs=opus');
assert.ok(r.ok && r.type.mime === 'audio/webm' && r.type.ext === '.weba');
// Android gallery pickers sometimes send octet-stream for a real MP4.
r = resolveUpload(MP4, 5000, 'application/octet-stream');
assert.ok(r.ok && r.type.ext === '.mp4' && r.inferred);
r = resolveUpload(MOV, 5000, 'video/quicktime');
assert.ok(r.ok && r.type.mime === 'video/quicktime');
// busboy reports text/plain when it cannot parse "video/webm;codecs=vp9,opus".
r = resolveUpload(WEBM, 5000, 'text/plain');
assert.ok(r.ok && r.type.ext === '.webm' && r.inferred);
r = resolveUpload(HTML, HTML.length, 'text/plain');
assert.ok(!r.ok && r.code === 'unsupported');
// Empty and truncated files.
r = resolveUpload(new Uint8Array(0), 0, 'video/webm');
assert.ok(!r.ok && r.code === 'empty');
r = resolveUpload(bytes(1, 2), 2, 'video/webm');
assert.ok(!r.ok && r.code === 'unsupported');
// HTML/SVG renamed to look like media never get through, whatever they declare.
for (const [body, declared] of [[HTML, 'video/mp4'], [HTML, 'image/png'], [SVG, 'image/png'], [SVG, 'application/octet-stream']]) {
  r = resolveUpload(body, body.length, declared);
  assert.ok(!r.ok && r.code === 'unsupported', `${declared}`);
}
// Declared kind must agree with the bytes (PNG sent as video/mp4).
r = resolveUpload(PNG, 100, 'video/mp4');
assert.ok(!r.ok && r.code === 'mismatch');

// --- field policy ---
assert.deepEqual(FIELD_KINDS.image, ['image']);
assert.deepEqual(FIELD_KINDS.video, ['video']);
assert.deepEqual(FIELD_KINDS.videoNote, ['video']);
assert.deepEqual(FIELD_KINDS.audio, ['audio']);

console.log('media-types tests passed');
