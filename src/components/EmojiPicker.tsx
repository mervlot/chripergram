import { useEffect, useRef } from 'react';
import { GlassPopover } from './ui';

// A tiny, dependency-free emoji picker. Curated set of common emojis grouped
// loosely; clicking one calls onPick and closes.
const EMOJIS =
  '😀 😂 🤣 😊 😍 🥰 😎 🤩 🥳 😉 😋 😴 🤔 🙃 😅 😭 😡 🥺 😬 🤯 😱 🤗 🤝 🙏 👍 👎 👏 🙌 💪 🔥 ✨ ⭐ 🎉 🎊 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💯 ✅ ❌ ⚡ 🌈 ☀️ 🌙 ⚽ 🎮 🎵 📷 💻 🚀 🍕 🍔 🍷 ☕ 🐶 🐱 🌹'.split(
    ' ',
  );

interface Props {
  onPick: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <GlassPopover
      ref={ref}
      role="dialog"
      aria-label="Emoji picker"
      className="absolute bottom-full z-30 mb-2 grid w-72 grid-cols-8 gap-1 p-3"
    >
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          aria-label={`Insert ${e}`}
          className="min-h-9 rounded-xl p-1 text-xl transition duration-150 hover:bg-white/10 active:bg-white/15 motion-reduce:transition-none"
        >
          {e}
        </button>
      ))}
    </GlassPopover>
  );
}
