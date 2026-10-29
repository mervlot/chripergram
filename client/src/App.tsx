import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicOnly } from './components/PublicOnly';
import { Layout } from './components/Layout';
import { Spinner } from './components/Spinner';

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Register').then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail').then((m) => ({ default: m.VerifyEmail })));
const Terms = lazy(() => import('./pages/legal/Terms').then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import('./pages/legal/Privacy').then((m) => ({ default: m.Privacy })));
const Cookies = lazy(() => import('./pages/legal/Cookies').then((m) => ({ default: m.Cookies })));
const AcceptableUse = lazy(() => import('./pages/legal/AcceptableUse').then((m) => ({ default: m.AcceptableUse })));
const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })));
const Explore = lazy(() => import('./pages/Explore').then((m) => ({ default: m.Explore })));
const PostDetail = lazy(() => import('./pages/PostDetail').then((m) => ({ default: m.PostDetail })));
const PostQuotes = lazy(() => import('./pages/PostQuotes').then((m) => ({ default: m.PostQuotes })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const FollowList = lazy(() => import('./pages/FollowList').then((m) => ({ default: m.FollowList })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Notifications = lazy(() => import('./pages/Notifications').then((m) => ({ default: m.Notifications })));
const Messages = lazy(() => import('./pages/Messages').then((m) => ({ default: m.Messages })));
const Black = lazy(() => import('./pages/Black').then((m) => ({ default: m.Black })));
const Bookmarks = lazy(() => import('./pages/Bookmarks').then((m) => ({ default: m.Bookmarks })));
const Search = lazy(() => import('./pages/Search').then((m) => ({ default: m.Search })));
const Hashtag = lazy(() => import('./pages/Hashtag').then((m) => ({ default: m.Hashtag })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<Spinner className="mt-24" />}>
      <Routes>
        <Route element={<PublicOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Route>

        {/* Legal pages are readable by everyone, signed in or not. */}
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/acceptable-use" element={<AcceptableUse />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/black" element={<Black />} />
            <Route path="/bookmarks" element={<Bookmarks />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/:id" element={<Messages />} />
            <Route path="/search" element={<Search />} />
            <Route path="/hashtag/:tag" element={<Hashtag />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/post/:id" element={<PostDetail />} />
            <Route path="/post/:id/quotes" element={<PostQuotes />} />
            <Route path="/:username/followers" element={<FollowList type="followers" />} />
            <Route path="/:username/following" element={<FollowList type="following" />} />
            <Route path="/:username" element={<Profile />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
