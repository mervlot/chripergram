import { create } from 'zustand';
import { mediaErrorDetails, requestUserMedia } from '../lib/mediaAccess';
import type { MediaAccessKind } from '../lib/desktop';

// Persisted selection of the input devices used for calls. Device ids are
// stable per browser/profile, so remembering them keeps the user's chosen
// microphone/camera across sessions.
const MIC_KEY = 'callMicId';
const CAM_KEY = 'callCamId';

interface DeviceState {
  micId: string | null;
  camId: string | null;
  mics: MediaDeviceInfo[];
  cams: MediaDeviceInfo[];
  permission: 'unknown' | 'granted' | 'denied';
  error: string | null;
  settingsKind: MediaAccessKind | null;
  setMic: (id: string | null) => void;
  setCam: (id: string | null) => void;
  /** Enumerates the PC's audio/video inputs. Requests permission first so the
   *  OS reveals device labels (they're hidden until access is granted). */
  refresh: () => Promise<void>;
}

export const useDevices = create<DeviceState>((set) => ({
  micId: localStorage.getItem(MIC_KEY) || null,
  camId: localStorage.getItem(CAM_KEY) || null,
  mics: [],
  cams: [],
  permission: 'unknown',
  error: null,
  settingsKind: null,

  setMic: (id) => {
    if (id) localStorage.setItem(MIC_KEY, id);
    else localStorage.removeItem(MIC_KEY);
    set({ micId: id });
  },
  setCam: (id) => {
    if (id) localStorage.setItem(CAM_KEY, id);
    else localStorage.removeItem(CAM_KEY);
    set({ camId: id });
  },

  refresh: async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    // Briefly open a stream so the browser exposes device labels, then release it.
    try {
      const probe = await requestUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
      set({ permission: 'granted', error: null, settingsKind: null });
    } catch (error) {
      const details = mediaErrorDetails(error);
      set({ permission: 'denied', error: details.message, settingsKind: details.settingsKind });
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      set({
        mics: all.filter((d) => d.kind === 'audioinput'),
        cams: all.filter((d) => d.kind === 'videoinput'),
      });
    } catch {
      /* enumeration unavailable */
    }
  },
}));
