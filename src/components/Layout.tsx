import { Suspense, useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Hash,
  Bell,
  Mail,
  Bookmark,
  User,
  Settings,
  Feather,
  LogOut,
  MoreHorizontal,
  Search,
  Aperture,
  Plus,
} from 'lucide-react';
import { useAuth } from '../store/auth';
import { useRealtime } from '../store/realtime';
import { useT } from '../lib/i18n';
import { toast } from '../store/toast';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { Dismiss } from './Dismiss';
import { PostComposer } from './PostComposer';
import { RightSidebar } from './RightSidebar';
import { ScrollToTop } from './ScrollToTop';
import { Spinner } from './Spinner';
import { RealtimeBridge } from './RealtimeBridge';
import { QuickSearch } from './QuickSearch';
import { UserName } from './UserName';
import { GlassNavigation, GlassPopover, IconButton, MenuItem } from './ui';
import { ICON_SIZE, buttonClass, cn } from '../lib/ui';
import { useScrollRestoration } from '../hooks/useScrollRestoration';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  badge?: number;
}

export function Layout() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  useScrollRestoration();
  const { notifUnread, dmUnread } = useRealtime();
  const [compose, setCompose] = useState(false);
  const [menu, setMenu] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [quickSearch, setQuickSearch] = useState(false);
  const closeCompose = useCallback(() => setCompose(false), []);
  const closeMobileMenu = useCallback(() => setMobileMenu(false), []);

  const isMessagesRoute = location.pathname.startsWith('/messages');
  const isPostRoute = /^\/post\/[^/]+$/.test(location.pathname);
  const isChatRoute = /^\/messages\/[^/]+/.test(location.pathname) || isPostRoute;

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuickSearch(true);
      } else if (!typing && event.key === '/') {
        event.preventDefault();
        setQuickSearch(true);
      }
    };

    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, []);

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (typeof path === 'string') navigate(path);
    };

    const onMenu = () => setMobileMenu(true);
    window.addEventListener('murmur:navigate', onNavigate);
    window.addEventListener('murmur:menu', onMenu);
    return () => {
      window.removeEventListener('murmur:navigate', onNavigate);
      window.removeEventListener('murmur:menu', onMenu);
    };
  }, [navigate]);

  if (!user) return null;

  const items: NavItem[] = [
    { to: '/home', label: t('navHome'), icon: Home },
    { to: '/explore', label: t('navExplore'), icon: Hash },
    { to: '/black', label: 'Black', icon: Aperture },
    { to: '/notifications', label: t('navNotifications'), icon: Bell, badge: notifUnread },
    { to: '/messages', label: t('navMessages'), icon: Mail, badge: dmUnread },
    { to: '/bookmarks', label: t('navBookmarks'), icon: Bookmark },
    { to: `/${user.username}`, label: t('navProfile'), icon: User },
    { to: '/settings', label: t('navSettings'), icon: Settings },
  ];

  const navItemCls = (active: boolean) =>
    `group relative flex min-h-12 items-center gap-4 rounded-full px-3 py-2.5 text-[17px] transition-colors xl:pr-5 ${
      active ? 'font-bold text-white' : 'font-medium text-stone-400 hover:bg-white/[0.06] hover:text-white'
    }`;

  return (
    <div className="mx-auto flex min-h-dvh w-full min-w-0 max-w-[1440px] justify-center">
      <RealtimeBridge />

      {/* Desktop / large-tablet rail */}
      <header className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col justify-between overflow-y-auto px-2 py-3 md:flex xl:w-[260px] xl:px-3">
        <div>
          <NavLink
            to="/home"
            className="mb-2 flex h-12 w-12 items-center justify-center gap-3 rounded-full text-white transition-colors hover:bg-white/[0.06] xl:w-auto xl:justify-start xl:px-3"
            aria-label="Chirpergram home"
          >
            <Feather size={26} strokeWidth={2.4} className="shrink-0 text-brand" />
            <span className="hidden text-[22px] font-bold tracking-tight xl:inline">Chirpergram</span>
          </NavLink>

          <nav className="flex flex-col items-center gap-0.5 xl:items-stretch">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => navItemCls(isActive)}>
                {({ isActive }) => (
                  <>
                    <span className="relative shrink-0">
                      <item.icon size={25} strokeWidth={isActive ? 2.5 : 2} />
                      {!!item.badge && item.badge > 0 && (
                        <span className="absolute -right-2 -top-1.5 min-w-[18px] rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </span>
                    <span className="hidden truncate xl:inline">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}

            <button type="button" onClick={() => setQuickSearch(true)} className={navItemCls(false)}>
              <Search size={25} strokeWidth={2} className="shrink-0" />
              <span className="hidden xl:inline">{t('navSearch')}</span>
            </button>
          </nav>

          <button
            type="button"
            onClick={() => setCompose(true)}
            className={cn(buttonClass({ variant: 'primary', size: 'lg', pill: true }), 'mx-auto mt-4 h-12 w-12 !min-h-0 !px-0 xl:w-full')}
            aria-label="Create post"
          >
            <Feather size={ICON_SIZE.md} className="xl:hidden" />
            <span className="hidden text-base xl:inline">{t('post')}</span>
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((open) => !open)}
            className="mx-auto flex min-h-14 w-14 items-center gap-3 rounded-full p-2 text-left transition-colors hover:bg-white/[0.06] xl:mx-0 xl:w-full"
          >
            <Avatar user={user} linkable={false} />
            <div className="hidden min-w-0 flex-1 xl:block">
              <UserName user={user} className="max-w-full" compact />
              <p className="truncate text-sm text-stone-500">@{user.username}</p>
            </div>
            <MoreHorizontal className="hidden shrink-0 xl:block" size={18} />
          </button>

          {menu && <Dismiss onDismiss={() => setMenu(false)} />}
          {menu && (
            <GlassPopover className="absolute bottom-16 left-0 z-10 w-64">
              <MenuItem
                icon={<LogOut size={ICON_SIZE.md} />}
                onClick={async () => {
                  await logout();
                  toast('Signed out', 'info');
                  navigate('/login');
                }}
              >
                {t('logOut')} @{user.username}
              </MenuItem>
            </GlassPopover>
          )}
        </div>
      </header>

      <main
        className={`min-h-dvh w-full min-w-0 flex-1 md:border-x md:border-white/[0.07] ${
          isMessagesRoute ? 'max-w-[920px]' : 'max-w-[640px] xl:max-w-[680px]'
        }`}
      >
        <div
          key={location.pathname}
          className={`min-w-0 animate-page-enter ${isChatRoute ? '' : 'mobile-content-pad md:pb-0'}`}
        >
          <Suspense fallback={<Spinner className="mt-24" />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <RightSidebar />

      {/* Mobile tab bar: flush with the bottom edge, home-indicator safe */}
      {!isChatRoute && (
        <GlassNavigation aria-label="Primary" className="md:hidden">
          <div className="mx-auto grid h-14 max-w-xl grid-cols-5 items-center">
            <MobileTab to="/home" label={t('navHome')} icon={Home} />
            <MobileTab to="/explore" label={t('navSearch')} icon={Search} />
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => setCompose(true)}
                aria-label="Create post"
                className="flex h-14 w-full min-w-0 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-stone-500 transition-colors active:text-white"
              >
                <Plus size={23} strokeWidth={1.9} />
                <span className="max-w-full truncate px-1">{t('post')}</span>
              </button>
            </div>
            <MobileTab to="/black" label="Black" icon={Aperture} />
            <MobileTab to={`/${user.username}`} label={t('navProfile')} icon={User} />
          </div>
        </GlassNavigation>
      )}

      {!isChatRoute && location.pathname !== '/black' && <ScrollToTop />}

      <Modal open={compose} onClose={closeCompose} title="New post">
        <PostComposer autoFocus onPosted={closeCompose} />
      </Modal>

      <Modal open={mobileMenu} onClose={closeMobileMenu} title={t('yourMurmur')}>
        <div className="-mx-4 -mb-4">
          {[
            { to: `/${user.username}`, label: 'Profile', icon: User },
            { to: '/notifications', label: 'Notifications', icon: Bell },
            { to: '/messages', label: 'Messages', icon: Mail },
            { to: '/bookmarks', label: 'Bookmarks', icon: Bookmark },
            { to: '/settings', label: 'Settings', icon: Settings },
          ].map((item) => (
            <MenuItem
              key={item.to}
              role={undefined}
              icon={<item.icon size={ICON_SIZE.md} />}
              onClick={() => {
                setMobileMenu(false);
                navigate(item.to);
              }}
              className="min-h-14 gap-3 border-t border-white/10 px-4 font-semibold"
            >
              {item.label}
            </MenuItem>
          ))}
        </div>
      </Modal>

      <QuickSearch open={quickSearch} onClose={() => setQuickSearch(false)} />
    </div>
  );
}

function MobileTab({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      className={({ isActive }) =>
        `flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
          isActive ? 'text-white' : 'text-stone-500'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={23} strokeWidth={isActive ? 2.5 : 1.9} className={isActive ? 'text-brand' : ''} />
          <span className="max-w-full truncate px-1">{label}</span>
        </>
      )}
    </NavLink>
  );
}
