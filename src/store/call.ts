import { create } from 'zustand';
import { getSocket } from '../lib/socket';
import { useDevices } from './devices';
import { useAuth } from './auth';
import { startRingtone, stopRingtone } from '../lib/ringtone';
import { mediaErrorDetails, requestUserMedia } from '../lib/mediaAccess';
import type { MediaAccessKind } from '../lib/desktop';

export type CallType = 'audio' | 'video';
type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

export interface CallPeer {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  verified?: boolean;
}

interface CallState {
  status: CallStatus;
  peer: CallPeer | null;
  callType: CallType;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micEnabled: boolean;
  camEnabled: boolean;
  screenSharing: boolean;
  error: string | null;
  mediaSettingsKind: MediaAccessKind | null;
  initialized: boolean;

  init: () => void;
  startCall: (peer: CallPeer, callType: CallType) => Promise<void>;
  accept: () => Promise<void>;
  reject: () => void;
  hangup: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  shareScreen: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  switchMic: (deviceId: string) => Promise<void>;
}

// Public STUN keeps things working across most home networks. A production
// deployment behind symmetric NATs would also configure a TURN relay here.
function rtcConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  const turnUrls = import.meta.env.VITE_TURN_URL?.split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  if (turnUrls?.length) {
    iceServers.push({
      urls: turnUrls,
      username: import.meta.env.VITE_TURN_USERNAME || undefined,
      credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined,
    });
  }
  return { iceServers, iceCandidatePoolSize: 6 };
}

// ── Module-scoped, non-reactive call internals ──
let pc: RTCPeerConnection | null = null;
let peerId: string | null = null; // the other user's id, for signalling
let pendingCandidates: RTCIceCandidateInit[] = [];
let boundSocket: ReturnType<typeof getSocket> = null;
let callTimeout: ReturnType<typeof setTimeout> | null = null;
// Grace timer for transient ICE "disconnected" blips before we give up.
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
// While screen-sharing, the camera track is parked here so it can be restored.
let cameraTrack: MediaStreamTrack | null = null;
// "Perfect negotiation" state: avoids glare when both sides (or one side
// repeatedly) renegotiate — e.g. enabling the camera or sharing the screen
// mid-call. Without this, a colliding offer throws and the video track is
// silently never negotiated, so the camera "sometimes" doesn't appear.
let makingOffer = false;
let ignoreOffer = false;
let iceRestartAttempted = false;

function socket() {
  return getSocket();
}

function signal(data: unknown) {
  if (peerId) socket()?.emit('call:signal', { toUserId: peerId, data });
}

// Deterministic, symmetric roles: the peer with the smaller user id is "polite"
// and yields on collisions; the other ignores the colliding offer.
function isPolite(): boolean {
  const myId = useAuth.getState().user?.id ?? '';
  return !!peerId && myId < peerId;
}

// Create + send a renegotiation offer, but only from a stable state and never
// while we're already making one.
async function makeOffer() {
  if (!pc || makingOffer || pc.signalingState !== 'stable') return;
  try {
    makingOffer = true;
    const offer = await pc.createOffer();
    if (pc.signalingState !== 'stable') return; // changed while awaiting
    await pc.setLocalDescription(offer);
    signal(pc.localDescription);
  } catch {
    /* ignore — connectionstatechange will surface real failures */
  } finally {
    makingOffer = false;
  }
}

async function getLocalMedia(type: CallType): Promise<MediaStream> {
  const { micId, camId } = useDevices.getState();
  const wantVideo = type === 'video';
  try {
    return await requestUserMedia({
      audio: micId ? { deviceId: { exact: micId } } : true,
      video: wantVideo ? (camId ? { deviceId: { exact: camId } } : true) : false,
    });
  } catch (err) {
    // A previously-saved mic/camera may be unplugged; retry with the default
    // devices so the call still works instead of failing outright.
    if (micId || camId) {
      return requestUserMedia({ audio: true, video: wantVideo });
    }
    throw err;
  }
}

export const useCall = create<CallState>((set, get) => {
  function clearCallTimeout() {
    if (callTimeout) {
      clearTimeout(callTimeout);
      callTimeout = null;
    }
  }

  function clearDisconnectTimer() {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
  }

  // Tears down the peer connection + media and resets to idle.
  function cleanup(message: string | null = null, mediaSettingsKind: MediaAccessKind | null = null) {
    clearCallTimeout();
    clearDisconnectTimer();
    stopRingtone();
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try {
        pc.close();
      } catch {
        /* already closed */
      }
      pc = null;
    }
    get().localStream?.getTracks().forEach((t) => t.stop());
    get().remoteStream?.getTracks().forEach((t) => t.stop());
    cameraTrack?.stop();
    cameraTrack = null;
    makingOffer = false;
    ignoreOffer = false;
    iceRestartAttempted = false;
    peerId = null;
    pendingCandidates = [];

    const peer = get().peer;
    if (message && peer) {
      set({
        status: 'ended',
        peer,
        localStream: null,
        remoteStream: null,
        micEnabled: true,
        camEnabled: true,
        screenSharing: false,
        error: message,
        mediaSettingsKind,
      });
      setTimeout(() => {
        if (get().status === 'ended') {
          set({ status: 'idle', peer: null, error: null, mediaSettingsKind: null });
        }
      }, mediaSettingsKind ? 10_000 : 3000);
      return;
    }

    set({
      status: 'idle',
      peer: null,
      localStream: null,
      remoteStream: null,
      micEnabled: true,
      camEnabled: true,
      screenSharing: false,
      error: null,
      mediaSettingsKind: null,
    });
  }

  // Builds the RTCPeerConnection, wiring ICE relay + remote track handling.
  function createPeer(localStream: MediaStream) {
    const conn = new RTCPeerConnection(rtcConfig());
    localStream.getTracks().forEach((track) => conn.addTrack(track, localStream));

    conn.onicecandidate = (e) => {
      if (e.candidate) signal({ candidate: e.candidate.toJSON() });
    };
    conn.ontrack = (e) => {
      const [stream] = e.streams;
      if (!stream) return;
      const patch: Partial<CallState> = { remoteStream: stream, status: 'active' };
      // If the other side turns their camera on mid-call, switch to video UI.
      if (e.track.kind === 'video') patch.callType = 'video';
      set(patch);
    };
    conn.onconnectionstatechange = () => {
      if (!pc) return;
      const state = pc.connectionState;
      if (state === 'connected') {
        clearDisconnectTimer();
        iceRestartAttempted = false;
        set({ status: 'active' });
      } else if (state === 'failed') {
        if (!iceRestartAttempted) {
          iceRestartAttempted = true;
          try {
            pc.restartIce();
            void makeOffer();
          } catch {
            cleanup('Connection lost');
          }
        } else {
          cleanup('Connection lost');
        }
      } else if (state === 'disconnected') {
        // A brief "disconnected" is usually a transient network blip that ICE
        // recovers from on its own. Only end the call if it doesn't come back.
        if (!disconnectTimer) {
          disconnectTimer = setTimeout(() => {
            disconnectTimer = null;
            if (pc && (pc.connectionState === 'disconnected' || pc.connectionState === 'failed')) {
              cleanup('Connection lost');
            }
          }, 8000);
        }
      }
    };
    return conn;
  }

  async function drainCandidates() {
    if (!pc || !pc.remoteDescription) return;
    for (const c of pendingCandidates) {
      await pc.addIceCandidate(c).catch(() => {});
    }
    pendingCandidates = [];
  }

  return {
    status: 'idle',
    peer: null,
    callType: 'audio',
    localStream: null,
    remoteStream: null,
    micEnabled: true,
    camEnabled: true,
    screenSharing: false,
    error: null,
    mediaSettingsKind: null,
    initialized: false,

    init: () => {
      const s = socket();
      if (!s) return; // socket connects after auth; CallOverlay retries on mount
      if (s === boundSocket) return;
      boundSocket = s;
      set({ initialized: true });

      s.on('call:incoming', ({ fromUserId, caller, callType }: any) => {
        // Busy: already in a call → tell the caller.
        if (get().status !== 'idle') {
          s.emit('call:busy', { toUserId: fromUserId });
          return;
        }
        peerId = fromUserId;
        set({
          status: 'incoming',
          peer: caller ?? { id: fromUserId, username: '', displayName: 'Caller', avatarUrl: null },
          callType: callType === 'video' ? 'video' : 'audio',
          camEnabled: callType === 'video',
        });
        startRingtone('incoming');
        clearCallTimeout();
        callTimeout = setTimeout(() => {
          s.emit('call:reject', { toUserId: fromUserId, reason: 'timeout' });
          cleanup();
        }, 45_000);
      });

      // Callee accepted → caller creates and sends the initial offer.
      s.on('call:accepted', async ({ fromUserId }: { fromUserId: string }) => {
        if (fromUserId !== peerId || !pc || get().status !== 'outgoing') return;
        clearCallTimeout();
        stopRingtone();
        set({ status: 'connecting' });
        try {
          makingOffer = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          signal(pc.localDescription);
        } catch {
          cleanup();
        } finally {
          makingOffer = false;
        }
      });

      s.on('call:signal', async ({ fromUserId, data }: any) => {
        if (fromUserId !== peerId || !pc || !data) return;
        try {
          if (data.type === 'offer') {
            // Glare handling: if an offer arrives while we have our own pending
            // offer, the impolite peer ignores it and the polite peer rolls back.
            const collision = makingOffer || pc.signalingState !== 'stable';
            ignoreOffer = !isPolite() && collision;
            if (ignoreOffer) return;
            if (collision && pc.signalingState === 'have-local-offer') {
              await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
            }
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            await drainCandidates();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            signal(pc.localDescription);
          } else if (data.type === 'answer') {
            // Ignore a stray/duplicate answer that doesn't match our state.
            if (pc.signalingState !== 'have-local-offer') return;
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            await drainCandidates();
          } else if (data.candidate) {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(data.candidate).catch(() => {});
            } else {
              pendingCandidates.push(data.candidate);
            }
          }
        } catch {
          /* ignore malformed / out-of-order signalling */
        }
      });

      const endHandlers = ['call:ended', 'call:canceled'];
      endHandlers.forEach((evt) =>
        s.on(evt, ({ fromUserId }: { fromUserId: string }) => {
          if (fromUserId === peerId) cleanup();
        }),
      );
      s.on('call:rejected', ({ fromUserId, reason }: { fromUserId: string; reason?: string }) => {
        if (fromUserId !== peerId) return;
        cleanup(reason === 'unavailable' ? 'Call unavailable' : 'Call declined');
      });
      s.on('call:busy', ({ fromUserId }: { fromUserId: string }) => {
        if (fromUserId !== peerId) return;
        cleanup('User is busy');
      });
      s.on('call:answered-elsewhere', ({ fromUserId }: { fromUserId: string }) => {
        if (fromUserId === peerId && get().status === 'incoming') cleanup();
      });
    },

    startCall: async (peer, callType) => {
      if (get().status !== 'idle') return;
      set({ status: 'connecting', peer, callType, error: null });
      try {
        const localStream = await getLocalMedia(callType);
        peerId = peer.id;
        pc = createPeer(localStream);
        set({
          status: 'outgoing',
          peer,
          callType,
          localStream,
          micEnabled: true,
          camEnabled: callType === 'video',
        });
        socket()?.emit('call:invite', { toUserId: peer.id, callType });
        startRingtone('outgoing');
        clearCallTimeout();
        callTimeout = setTimeout(() => {
          socket()?.emit('call:cancel', { toUserId: peer.id });
          cleanup('No answer');
        }, 45_000);
      } catch (error) {
        const details = mediaErrorDetails(error);
        cleanup(details.message, details.settingsKind);
      }
    },

    accept: async () => {
      const { status, callType } = get();
      if (status !== 'incoming') return;
      // Cancel the 45s auto-reject armed while ringing — otherwise it fires
      // mid-conversation and drops the answered call after ~45 seconds.
      clearCallTimeout();
      stopRingtone();
      try {
        const localStream = await getLocalMedia(callType);
        pc = createPeer(localStream);
        set({ status: 'connecting', localStream, micEnabled: true, camEnabled: callType === 'video' });
        socket()?.emit('call:accept', { toUserId: peerId });
      } catch (error) {
        socket()?.emit('call:reject', { toUserId: peerId });
        const details = mediaErrorDetails(error);
        cleanup(details.message, details.settingsKind);
      }
    },

    reject: () => {
      socket()?.emit('call:reject', { toUserId: peerId });
      cleanup();
    },

    hangup: () => {
      const { status } = get();
      // An un-answered outgoing call is a cancel; otherwise it's an end.
      socket()?.emit(status === 'outgoing' ? 'call:cancel' : 'call:end', { toUserId: peerId });
      cleanup();
    },

    toggleMic: () => {
      const stream = get().localStream;
      if (!stream) return;
      const next = !get().micEnabled;
      stream.getAudioTracks().forEach((t) => (t.enabled = next));
      set({ micEnabled: next });
    },

    toggleCam: async () => {
      const stream = get().localStream;
      if (!stream) return;

      // If we already have a camera track (video call), just flip it on/off.
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        const next = !get().camEnabled;
        videoTracks.forEach((t) => (t.enabled = next));
        set({ camEnabled: next });
        return;
      }

      // Otherwise this is a voice call: acquire the camera, add it to the
      // connection and renegotiate so the other side starts receiving video.
      if (!pc || get().status !== 'active') return;
      try {
        const { camId } = useDevices.getState();
        let cam: MediaStream;
        try {
          cam = await requestUserMedia({
            video: camId ? { deviceId: { exact: camId } } : true,
          });
        } catch {
          // Saved camera unavailable → fall back to the default camera.
          cam = await requestUserMedia({ video: true });
        }
        const track = cam.getVideoTracks()[0];
        if (!track) return;
        stream.addTrack(track);
        pc.addTrack(track, stream);
        set({ localStream: stream, callType: 'video', camEnabled: true });

        await makeOffer();
      } catch (error) {
        const details = mediaErrorDetails(error);
        set({ error: details.message, mediaSettingsKind: details.settingsKind });
        setTimeout(() => {
          if (get().error === details.message) set({ error: null, mediaSettingsKind: null });
        }, details.settingsKind ? 10_000 : 3000);
      }
    },

    // Share this screen with the other side. Replaces the outgoing camera video
    // (or adds a video track on a voice call and renegotiates).
    shareScreen: async () => {
      if (!pc || get().status !== 'active' || get().screenSharing) return;
      let display: MediaStream;
      try {
        display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      } catch {
        return; // user cancelled the picker
      }
      const screenTrack = display.getVideoTracks()[0];
      if (!screenTrack) return;

      const stream = get().localStream;
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender && stream) {
        // Park the camera track so it can be restored when sharing stops.
        cameraTrack = sender.track;
        await sender.replaceTrack(screenTrack);
        stream.getVideoTracks().forEach((t) => stream.removeTrack(t));
        stream.addTrack(screenTrack);
        set({ localStream: stream, screenSharing: true, callType: 'video', camEnabled: true });
      } else if (stream) {
        cameraTrack = null;
        stream.addTrack(screenTrack);
        pc.addTrack(screenTrack, stream);
        set({ localStream: stream, screenSharing: true, callType: 'video', camEnabled: true });
        await makeOffer();
      }

      // The browser's own "Stop sharing" control ends the track.
      screenTrack.onended = () => {
        void get().stopScreenShare();
      };
    },

    stopScreenShare: async () => {
      if (!pc || !get().screenSharing) return;
      const stream = get().localStream;
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      const screenTrack = sender?.track ?? null;

      if (cameraTrack && cameraTrack.readyState === 'live' && sender && stream) {
        // Restore the camera in place — no renegotiation needed.
        await sender.replaceTrack(cameraTrack);
        if (screenTrack) stream.removeTrack(screenTrack);
        stream.addTrack(cameraTrack);
        screenTrack?.stop();
        set({ localStream: stream, screenSharing: false, callType: 'video', camEnabled: true });
      } else if (sender && stream) {
        // Voice call: drop the shared video track entirely and renegotiate.
        screenTrack?.stop();
        if (screenTrack) stream.removeTrack(screenTrack);
        try {
          pc.removeTrack(sender);
        } catch {
          /* sender already gone */
        }
        set({ localStream: stream, screenSharing: false, callType: 'audio', camEnabled: false });
        await makeOffer();
      } else {
        set({ screenSharing: false });
      }
      cameraTrack = null;
    },

    // Live-switch the microphone mid-call (and remember the choice).
    switchMic: async (deviceId) => {
      useDevices.getState().setMic(deviceId);
      const { localStream, status } = get();
      if (!pc || !localStream || status === 'idle') return;
      try {
        const fresh = await requestUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });
        const newTrack = fresh.getAudioTracks()[0];
        if (!newTrack) return;
        newTrack.enabled = get().micEnabled;
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        await sender?.replaceTrack(newTrack);
        // Swap the track inside the local stream too.
        localStream.getAudioTracks().forEach((t) => {
          localStream.removeTrack(t);
          t.stop();
        });
        localStream.addTrack(newTrack);
        set({ localStream });
      } catch {
        /* keep the existing track on failure */
      }
    },
  };
});
