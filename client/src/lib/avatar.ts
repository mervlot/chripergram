const themes = [
  {
    avatar: 'from-rose-500 to-orange-400',
    banner:
      'from-violet-100 via-orange-50 to-sky-100 dark:from-rose-500/20 dark:via-orange-400/10 dark:to-sky-500/15',
  },
  {
    avatar: 'from-blue-600 to-cyan-400',
    banner:
      'from-blue-100 via-cyan-50 to-emerald-100 dark:from-blue-500/20 dark:via-cyan-400/10 dark:to-emerald-500/15',
  },
  {
    avatar: 'from-emerald-600 to-lime-400',
    banner:
      'from-emerald-100 via-lime-50 to-amber-100 dark:from-emerald-500/20 dark:via-lime-400/10 dark:to-amber-500/15',
  },
  {
    avatar: 'from-violet-600 to-fuchsia-400',
    banner:
      'from-violet-100 via-fuchsia-50 to-violet-100 dark:from-violet-500/20 dark:via-fuchsia-400/10 dark:to-rose-500/15',
  },
  {
    avatar: 'from-amber-500 to-red-500',
    banner:
      'from-amber-100 via-red-50 to-indigo-100 dark:from-amber-500/20 dark:via-red-400/10 dark:to-indigo-500/15',
  },
  {
    avatar: 'from-cyan-600 to-indigo-500',
    banner:
      'from-cyan-100 via-indigo-50 to-pink-100 dark:from-cyan-500/20 dark:via-indigo-400/10 dark:to-pink-500/15',
  },
] as const;

function usernameHash(username: string) {
  let hash = 0;
  for (const char of username.toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function getAvatarTheme(username: string) {
  return themes[usernameHash(username) % themes.length];
}

export function getUsernameInitial(username: string) {
  return Array.from(username.trim())[0]?.toUpperCase() || '?';
}
