import { useState } from 'react';
import { api } from '../lib/api';
import { toast } from '../store/toast';
import { Button } from './ui';

interface Props {
  username: string;
  initialFollowing: boolean;
  onChange?: (following: boolean) => void;
  small?: boolean;
}

export function FollowButton({ username, initialFollowing, onChange, small }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      if (next) await api.post(`/users/${username}/follow`);
      else await api.delete(`/users/${username}/follow`);
      toast(next ? `Following @${username}` : `Unfollowed @${username}`, 'success');
      onChange?.(next);
    } catch {
      setFollowing(!next);
      toast('Something went wrong', 'error');
    } finally {
      setBusy(false);
    }
  }

  const size = small ? 'sm' : 'md';

  if (following) {
    return (
      <Button
        onClick={toggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        disabled={busy}
        pill
        size={size}
        variant={hover ? 'destructive' : 'secondary'}
        aria-pressed
      >
        {hover ? 'Unfollow' : 'Following'}
      </Button>
    );
  }

  return (
    <Button onClick={toggle} disabled={busy} pill size={size} variant="primary" aria-pressed={false}>
      Follow
    </Button>
  );
}
