import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../store/theme';
import { useT } from '../lib/i18n';

export function ThemeToggle({ withLabel }: { withLabel?: boolean }) {
  const { theme, toggle } = useTheme();
  const t = useT();

  return (
    <button
      onClick={toggle}
      className="flex min-h-11 w-full items-center gap-3 border-l-2 border-transparent px-3 py-2 text-stone-600 transition-colors hover:border-stone-400 hover:text-stone-950 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:text-white"
      title="Toggle theme"
    >
      {theme === 'dark' ? <Sun size={21} /> : <Moon size={21} />}
      {withLabel && (
        <span className="hidden text-[15px] font-semibold xl:inline">
          {theme === 'dark' ? t('themeLight') : t('themeDark')}
        </span>
      )}
    </button>
  );
}
