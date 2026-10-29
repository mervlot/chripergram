// Run: node --experimental-strip-types scripts/test-attachments.mjs
import assert from 'node:assert/strict';
import { classifyAttachment, attachmentProblem, baseMime, MAX_ATTACHMENT_BYTES } from '../src/lib/attachments.ts';
assert.equal(baseMime('video/webm;codecs=vp9,opus'), 'video/webm');
assert.equal(classifyAttachment({ type: 'video/mp4', name: 'a.mp4' }), 'video');
assert.equal(classifyAttachment({ type: 'video/3gpp', name: 'a.3gp' }), 'video');
assert.equal(classifyAttachment({ type: '', name: 'VID_2026.MP4' }), 'video');          // Android: empty type
assert.equal(classifyAttachment({ type: 'application/octet-stream', name: 'clip.mov' }), 'video');
assert.equal(classifyAttachment({ type: 'image/jpeg', name: 'x.jpg' }), 'image');
assert.equal(classifyAttachment({ type: 'image/svg+xml', name: 'x.svg' }), null);
assert.equal(classifyAttachment({ type: 'text/html', name: 'x.mp4' }), null);            // type wins over name
assert.match(attachmentProblem({ type: 'video/mp4', name: 'a.mp4', size: 0 }), /empty/);
assert.match(attachmentProblem({ type: 'application/pdf', name: 'a.pdf', size: 5 }), /Unsupported/);
assert.match(attachmentProblem({ type: 'video/mp4', name: 'a.mp4', size: MAX_ATTACHMENT_BYTES + 1 }), /too large/);
assert.equal(attachmentProblem({ type: 'video/mp4', name: 'a.mp4', size: 1000 }), null);
console.log('attachment tests passed');
