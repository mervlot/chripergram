import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { Spinner } from './Spinner';

// Guards authenticated routes; redirects to /login while preserving the
// originally requested location.
export function ProtectedRoute() {
  const status = useAuth((s) => s.status);
  const location = useLocation();

  if (status === 'loading') return <Spinner className="mt-20" />;
  if (status === 'unauthenticated') return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}
