// Run: node --experimental-strip-types scripts/test-recorder.mjs
// Mocked MediaStream/MediaRecorder tests for RecorderSession cleanup paths.
import assert from 'node:assert/strict';
import { RecorderSession } from '../src/lib/recorderSession.ts';

function makeTrack() { return { readyState: 'live', enabled: true, stop() { this.readyState = 'ended'; } }; }
function makeStream() { const tracks = [makeTrack(), makeTrack()]; return { tracks, getTracks: () => tracks }; }

class FakeRecorder {
  constructor(stream, mime) { this.stream = stream; this.mimeType = mime; this.state = 'inactive'; FakeRecorder.last = this; }
  start() { if (FakeRecorder.failStart) throw new Error('start failed'); this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    // final dataavailable precedes stop, like real browsers
    if (!FakeRecorder.noData) this.ondataavailable?.({ data: new Blob(['x'.repeat(100)], { type: this.mimeType || 'video/webm;codecs=vp9,opus' }) });
    queueMicrotask(() => this.onstop?.());
  }
}

let clock = 1000;
function setup(over = {}) {
  const streams = [];
  const deps = {
    getUserMedia: over.getUserMedia ?? (async () => { const s = makeStream(); streams.push(s); return s; }),
    createRecorder: (s, m) => new FakeRecorder(s, m),
    pickMime: () => 'video/webm;codecs=vp9,opus',
    now: () => clock,
  };
  const states = [];
  return { session: new RecorderSession(deps, (st) => states.push(st)), streams, states };
}
const allEnded = (streams) => streams.every((s) => s.tracks.every((t) => t.readyState === 'ended'));
FakeRecorder.failStart = false; FakeRecorder.noData = false;

// 1. success: tracks ended, codec-qualified blob type preserved, duration correct
{
  const { session, streams } = setup(); clock = 1000;
  await session.start('video'); assert.equal(session.state, 'recording');
  clock = 3500;
  const r = await session.stop();
  assert.ok(r && r.blob.size > 0 && r.durationMs === 2500 && r.kind === 'video');
  assert.equal(r.blob.type, 'video/webm;codecs=vp9,opus');
  assert.ok(allEnded(streams)); assert.equal(session.state, 'idle'); assert.equal(session.stream, null);
}
// 2. cancel never returns a result and releases devices
{
  const { session, streams } = setup(); clock = 0;
  await session.start('audio'); clock = 5000;
  assert.equal(await session.cancel(), null);
  assert.ok(allEnded(streams));
}
// 3. duplicate stop/cancel are safe and resolve once with same outcome
{
  const { session, streams } = setup(); clock = 0;
  await session.start('audio'); clock = 4000;
  const [a, b] = await Promise.all([session.stop(), session.stop()]);
  assert.ok(a && b); assert.equal(await session.stop(), null); assert.ok(allEnded(streams));
}
// 3b. cancel after stop was requested still wins (no accidental upload)
{
  const { session } = setup(); clock = 0;
  await session.start('audio'); clock = 4000;
  const p = session.stop(); const c = session.cancel();
  assert.equal(await p, null); assert.equal(await c, null);
}
// 4. too short / no data -> null, devices released
{
  const { session, streams } = setup(); clock = 0;
  await session.start('audio'); clock = 200;
  assert.equal(await session.stop(), null); assert.ok(allEnded(streams));
  const s2 = setup(); clock = 0; FakeRecorder.noData = true;
  await s2.session.start('audio'); clock = 5000;
  assert.equal(await s2.session.stop(), null); FakeRecorder.noData = false; assert.ok(allEnded(s2.streams));
}
// 5. permission denied: nothing acquired, state back to idle, error surfaced
{
  const { session, states } = setup({ getUserMedia: async () => { throw new DOMException('no', 'NotAllowedError'); } });
  await assert.rejects(() => session.start('video'), /no/);
  assert.equal(session.state, 'idle'); assert.ok(states.includes('failed'));
}
// 6. MediaRecorder.start() throws after stream acquired: stream must be released
{
  FakeRecorder.failStart = true;
  const { session, streams } = setup();
  await assert.rejects(() => session.start('video'), /start failed/);
  assert.ok(allEnded(streams)); assert.equal(session.state, 'idle'); FakeRecorder.failStart = false;
}
// 7. unmount (dispose) while permission pending: late stream released on arrival
{
  let resolve; const late = makeStream();
  const { session, streams } = setup({ getUserMedia: () => new Promise((r) => { resolve = r; }) });
  const p = session.start('video'); session.dispose(); resolve(late); await p;
  assert.ok(late.tracks.every((t) => t.readyState === 'ended')); assert.equal(session.stream, null);
}
// 8. dispose while recording releases and never yields a result
{
  const { session, streams } = setup(); clock = 0;
  await session.start('video'); session.dispose();
  assert.ok(allEnded(streams)); assert.equal(session.state, 'idle');
}
// 9. cancel while permission pending releases the late stream
{
  let resolve; const late = makeStream();
  const { session } = setup({ getUserMedia: () => new Promise((r) => { resolve = r; }) });
  const p = session.start('audio'); await session.cancel(); resolve(late); await p;
  assert.ok(late.tracks.every((t) => t.readyState === 'ended'));
}
// 10. pause/resume: paused != stopped (devices still held); duration excludes pause
{
  const { session, streams } = setup(); clock = 0;
  await session.start('audio'); clock = 2000;
  assert.ok(session.pause()); assert.equal(session.state, 'paused');
  assert.ok(streams[0].tracks.every((t) => t.readyState === 'live'));
  clock = 12000; assert.ok(session.resume()); clock = 13000;
  const r = await session.stop(); assert.equal(r.durationMs, 3000);
  assert.ok(allEnded(streams));
}
// 10b. stop straight from paused excludes the paused tail
{
  const { session } = setup(); clock = 0;
  await session.start('audio'); clock = 3000; session.pause(); clock = 50000;
  const r = await session.stop(); assert.equal(r.durationMs, 3000);
}
// 11. recorder error path releases devices, no result
{
  const { session, streams } = setup(); clock = 0;
  await session.start('audio'); clock = 5000;
  const p = session.stop(); FakeRecorder.last.onerror?.({ error: new Error('boom') });
  assert.equal(await p, null); assert.ok(allEnded(streams));
}
// 12. repeated start/stop cycles never leak
{
  const { session, streams } = setup();
  for (let i = 0; i < 5; i++) { clock = i * 10000; await session.start('video'); clock += 2000; await session.stop(); }
  assert.equal(streams.length, 5); assert.ok(allEnded(streams));
}
console.log('recorder tests passed');
