// Lifecycle owner for one voice / round-video recording.
//
// Design rules (each one maps to a real leak path in the previous inline code):
//  * Every MediaStream acquired is stopped on EVERY exit: success, cancel,
//    start failure (including MediaRecorder constructor / start() throwing),
//    recorder error, dispose (unmount) and dispose-while-permission-pending.
//  * "stopped" means track.stop() (readyState === 'ended'). track.enabled=false
//    is NOT used: a disabled track still holds the capture device.
//  * stop() resolves exactly once; repeated stop/cancel calls are no-ops.
//  * Cancel can never produce a result, so it can never be uploaded.
//  * Paused is a distinct state: devices stay held, duration excludes pause.
//  * The Blob is assembled only after the recorder's final `stop` event, which
//    fires after the last `dataavailable`.

export type RecKind = 'audio' | 'video';
export type RecState =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'paused'
  | 'finalizing'
  | 'failed';

export interface RecResult {
  blob: Blob;
  durationMs: number;
  kind: RecKind;
}

export interface RecorderDeps {
  getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
  createRecorder: (stream: MediaStream, mimeType?: string) => MediaRecorder;
  pickMime: (kind: RecKind) => string | undefined;
  now?: () => number;
}

export const MIN_RECORDING_MS = 600;

export class RecorderSession {
  state: RecState = 'idle';
  stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private kind: RecKind = 'audio';
  private mime: string | undefined;
  private startedAt = 0;
  private pausedAt = 0;
  private pausedTotal = 0;
  private stopAt = 0;
  private generation = 0; // invalidates an in-flight getUserMedia after cancel/dispose
  private disposed = false;
  private finish: ((r: RecResult | null) => void) | null = null;
  private discard = false;
  private failure: Error | null = null;

  private deps: RecorderDeps;
  private onChange: (state: RecState, stream: MediaStream | null) => void;

  constructor(
    deps: RecorderDeps,
    onChange: (state: RecState, stream: MediaStream | null) => void = () => {},
  ) {
    this.deps = deps;
    this.onChange = onChange;
  }

  private now() {
    return (this.deps.now ?? Date.now)();
  }

  private set(state: RecState) {
    this.state = state;
    this.onChange(state, this.stream);
  }

  /** Elapsed recording time in ms, excluding time spent paused. */
  elapsedMs(): number {
    if (this.state === 'idle' || this.state === 'requesting') return 0;
    const end = this.state === 'paused' ? this.pausedAt : this.now();
    return Math.max(0, end - this.startedAt - this.pausedTotal);
  }

  /** Stops every track and detaches the recorder. Safe to call repeatedly. */
  private release() {
    const recorder = this.recorder;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
    }
    this.recorder = null;
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* a track that fails to stop must not block the others */
      }
    });
  }

  async start(kind: RecKind): Promise<void> {
    if (this.disposed || this.state !== 'idle') return;
    const gen = ++this.generation;
    this.kind = kind;
    this.chunks = [];
    this.discard = false;
    this.failure = null;
    this.pausedTotal = 0;
    this.set('requesting');

    let stream: MediaStream;
    try {
      stream = await this.deps.getUserMedia(
        kind === 'audio'
          ? { audio: true }
          : { audio: true, video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } } },
      );
    } catch (err) {
      if (gen === this.generation && !this.disposed) {
        this.set('failed');
        this.set('idle');
      }
      this.state = 'idle';
      throw err;
    }

    // Cancelled / disposed while the permission prompt was open: the stream
    // arrived late, so release it immediately instead of leaking the device.
    if (gen !== this.generation || this.disposed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    this.stream = stream;
    try {
      this.mime = this.deps.pickMime(kind);
      const recorder = this.deps.createRecorder(stream, this.mime);
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size) this.chunks.push(e.data);
      };
      recorder.onerror = (e: Event) => {
        const maybe = (e as Event & { error?: Error }).error;
        this.failure = maybe ?? new Error('Recording failed');
        if (recorder.state !== 'inactive') {
          try {
            recorder.stop();
          } catch {
            this.settle(null);
          }
        } else {
          this.settle(null);
        }
      };
      recorder.onstop = () => this.onRecorderStop();
      this.recorder = recorder;
      recorder.start();
    } catch (err) {
      // MediaRecorder constructor / start() threw: devices are already open.
      this.release();
      this.set('idle');
      throw err;
    }
    this.startedAt = this.now();
    this.set('recording');
  }

  pause(): boolean {
    if (this.state !== 'recording' || !this.recorder) return false;
    try {
      this.recorder.pause();
    } catch {
      return false;
    }
    this.pausedAt = this.now();
    this.set('paused');
    return true;
  }

  resume(): boolean {
    if (this.state !== 'paused' || !this.recorder) return false;
    try {
      this.recorder.resume();
    } catch {
      return false;
    }
    this.pausedTotal += this.now() - this.pausedAt;
    this.set('recording');
    return true;
  }

  /** Finish and return the recording (null if too short/empty/failed). */
  stop(): Promise<RecResult | null> {
    return this.end(false);
  }

  /** Abandon the recording. Never yields a result. */
  cancel(): Promise<RecResult | null> {
    return this.end(true);
  }

  /** Unmount path: abandon everything, including a pending permission request. */
  dispose() {
    this.disposed = true;
    this.generation++;
    this.discard = true;
    if (this.state === 'recording' || this.state === 'paused' || this.state === 'finalizing') {
      this.settle(null);
    } else {
      this.release();
    }
    this.state = 'idle';
  }

  private end(discard: boolean): Promise<RecResult | null> {
    if (this.state === 'requesting') {
      this.generation++; // late getUserMedia result will be released on arrival
      this.state = 'idle';
      this.onChange('idle', null);
      return Promise.resolve(null);
    }
    if (this.state === 'finalizing') {
      // Duplicate stop while finalizing: cancelling still wins, otherwise no-op.
      if (discard) this.discard = true;
      return new Promise((resolve) => {
        const prev = this.finish;
        this.finish = (r) => {
          prev?.(r);
          resolve(r);
        };
      });
    }
    if ((this.state !== 'recording' && this.state !== 'paused') || !this.recorder) {
      return Promise.resolve(null);
    }
    this.discard = discard;
    this.stopAt = this.state === 'paused' ? this.pausedAt : this.now();
    this.set('finalizing');
    return new Promise((resolve) => {
      this.finish = resolve;
      const recorder = this.recorder!;
      try {
        if (recorder.state !== 'inactive') recorder.stop();
        else this.onRecorderStop();
      } catch {
        this.settle(null);
      }
    });
  }

  private onRecorderStop() {
    // `stop` fires after the final `dataavailable`, so chunks are complete here.
    const duration = this.elapsedMsAtStop();
    const kind = this.kind;
    const chunks = this.chunks;
    this.chunks = [];
    const discard = this.discard || this.failure !== null;
    if (discard || chunks.length === 0 || duration < MIN_RECORDING_MS) {
      this.settle(null);
      return;
    }
    const type = this.normalizeBlobType(chunks[0]?.type);
    this.settle({ blob: new Blob(chunks, { type }), durationMs: duration, kind });
  }

  private elapsedMsAtStop(): number {
    const end = this.stopAt || this.now();
    this.stopAt = 0;
    return Math.max(0, end - this.startedAt - this.pausedTotal);
  }

  private normalizeBlobType(chunkType: string | undefined): string {
    return (
      chunkType || this.mime || (this.kind === 'audio' ? 'audio/webm' : 'video/webm')
    );
  }

  /** Single exit: release devices first, then resolve the stop() promise once. */
  private settle(result: RecResult | null) {
    this.release();
    const finish = this.finish;
    this.finish = null;
    if (!this.disposed) this.set('idle');
    else this.state = 'idle';
    finish?.(result);
  }
}
