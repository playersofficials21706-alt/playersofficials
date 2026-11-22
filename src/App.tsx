import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { SeoHead } from './components/SeoHead';
import { ToastProvider } from './components/Toast';
import {
  apiFetch,
  clearDeviceLinks,
  readSavedLinks,
  removeDeviceLink,
  removeDeviceLinks,
  saveDeviceLink,
  setOnSessionExpired,
  setSessionToken,
  trackTelemetryEvent,
  type AuthUser,
  type SavedDeviceLink,
} from './lib/storage';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { LinkDetailPage } from './pages/LinkDetailPage';
import { NotFoundPage } from './pages/NotFoundPage';

function ScrollToHash() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0 });
      return;
    }
    const id = hash.slice(1);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [pathname, hash]);

  return null;
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [savedLinks, setSavedLinks] = useState<SavedDeviceLink[]>(() => readSavedLinks());

  useEffect(() => {
    setOnSessionExpired(() => {
      setSessionToken(null);
      setUser(null);
    });
    return () => setOnSessionExpired(null);
  }, []);

  useEffect(() => {
    try {
      const flag = 'playersqr:visit_logged';
      if (!sessionStorage.getItem(flag)) {
        sessionStorage.setItem(flag, '1');
        trackTelemetryEvent('site_visit', { path: window.location.pathname });
      }
    } catch {
      trackTelemetryEvent('site_visit');
    }

    const handleInstalled = () => {
      trackTelemetryEvent('app_install', { path: window.location.pathname });
    };
    window.addEventListener('appinstalled', handleInstalled);
    return () => window.removeEventListener('appinstalled', handleInstalled);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{
      user: AuthUser | null;
      sessionToken?: string | null;
      accountDeactivated?: boolean;
    }>('/api/auth/me')
      .then((res) => {
        if (!cancelled) {
          setSessionToken(res.sessionToken ?? null);
          setUser(res.user ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessionToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLinkCreated = (entry: SavedDeviceLink | null) => {
    if (entry) {
      setSavedLinks(saveDeviceLink(entry));
    }
  };

  const handleLinkRemoved = (code: string) => {
    setSavedLinks(removeDeviceLink(code));
  };

  const handleLinksRemoved = (codes: string[]) => {
    setSavedLinks(removeDeviceLinks(codes));
  };

  const handleAuthenticated = (nextUser: AuthUser, sessionToken?: string | null) => {
    if (sessionToken) {
      setSessionToken(sessionToken);
    }
    clearDeviceLinks();
    setSavedLinks([]);
    setUser(nextUser);
  };

  const handleSignedOut = () => {
    setSessionToken(null);
    clearDeviceLinks();
    setSavedLinks([]);
    setUser(null);
  };

  return (
    <ToastProvider>
      <BrowserRouter>
        <SeoHead />
        <ScrollToHash />
        <div className="min-h-screen">
          <Navbar user={user} authReady={authReady} />
          <Routes>
            <Route
              path="/"
              element={
                <HomePage
                  user={user}
                  authReady={authReady}
                  savedLinks={savedLinks}
                  onLinkCreated={handleLinkCreated}
                  onLinksRemoved={handleLinksRemoved}
                />
              }
            />
            <Route
              path="/links/:code"
              element={
                <LinkDetailPage
                  user={user}
                  savedLinks={savedLinks}
                  onLinkRemoved={handleLinkRemoved}
                />
              }
            />
            <Route
              path="/playerqr/:code"
              element={
                <LinkDetailPage
                  user={user}
                  savedLinks={savedLinks}
                  onLinkRemoved={handleLinkRemoved}
                />
              }
            />
            <Route
              path="/r/:code"
              element={
                <LinkDetailPage
                  user={user}
                  savedLinks={savedLinks}
                  onLinkRemoved={handleLinkRemoved}
                />
              }
            />
            <Route
              path="/auth"
              element={<AuthPage onAuthenticated={handleAuthenticated} />}
            />
            <Route
              path="/account"
              element={
                <AccountPage
                  user={user}
                  authReady={authReady}
                  onUserUpdated={(nextUser) => setUser(nextUser)}
                  onSignedOut={handleSignedOut}
                />
              }
            />
            <Route
              path="/admin"
              element={<AdminPage user={user} authReady={authReady} />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
}
