interface GameStatusProps {
  status?: string | null;
  userId?: string;
  className?: string;
}

// Gaming presence is intentionally hidden from the social UI.
// Keep the old prop surface temporarily so existing callers compile while
// the dormant gaming code is removed in smaller, safer steps.
export function GameStatus(_props: GameStatusProps) {
  return null;
}
