import { Link } from 'react-router-dom';
import { buttonClass } from '../lib/ui';

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-gray-500">The page you're looking for doesn't exist.</p>
      <Link to="/home" className={buttonClass({ variant: 'primary' })}>
        Back home
      </Link>
    </div>
  );
}
