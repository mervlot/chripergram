import { create } from 'zustand';

type Theme = 'light' | 'dark';

// The app uses a single black / deep-gray theme. Kept as a store so existing
// callers (toggle, settings) keep working, but it always resolves to dark.
function applyTheme() {
  document.documentElement.classList.add('dark');
  try {
    localStorage.setItem('theme', 'dark');
  } catch {
    /* ignore */
  }
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

export const useTheme = create<ThemeState>(() => {
  applyTheme();
  return { theme: 'dark', toggle: applyTheme, set: applyTheme };
});
