import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { Spinner } from './Spinner';

// Routes available only when signed OUT (login, register, password reset).
// Authenticated users are bounced to the home timeline.
export function PublicOnly() {
  const status = useAuth((s) => s.status);
  if (status === 'loading') return <Spinner className="mt-20" />;
  if (status === 'authenticated') return <Navigate to="/home" replace />;
  return <Outlet />;
}
