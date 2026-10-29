import { useEffect } from 'react';
import { getSocket } from '../lib/socket';
import {
  desktopBridge,
  isGameTrackingEnabled,
  onGameTrackingPreference,
} from '../lib/desktop';

export function DesktopActivityBridge() {
  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge?.isDesktop || !bridge.onGameActivity) return;

    let enabled = isGameTrackingEnabled();
    let currentGame: string | null = null;

    const publish = (game: string | null) => {
      currentGame = enabled ? game : null;
      getSocket()?.emit('activity:set', { game: currentGame });
    };
    const publishOnConnect = () => publish(currentGame);

    bridge.setGameTrackingEnabled?.(enabled);
    bridge.getGameActivity?.().then(publish).catch(() => {});
    const stopActivity = bridge.onGameActivity(publish);
    const stopPreference = onGameTrackingPreference((next) => {
      enabled = next;
      bridge.setGameTrackingEnabled?.(next);
      if (!next) publish(null);
      else bridge.getGameActivity?.().then(publish).catch(() => {});
    });

    const socket = getSocket();
    socket?.on('connect', publishOnConnect);

    return () => {
      socket?.off('connect', publishOnConnect);
      stopActivity();
      stopPreference();
    };
  }, []);

  return null;
}
