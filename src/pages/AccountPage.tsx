import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Globe,
  LoaderCircle,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Button, buttonClasses } from '../components/Button';
import { useToast } from '../components/Toast';
import { buildShortUrl, normalizeVanityDomain } from '../lib/qr';
import { apiFetch, type AuthUser, type LinkSummaryItem } from '../lib/storage';

interface AccountPageProps {
  user: AuthUser | null;
  authReady: boolean;
  onUserUpdated: (user: AuthUser) => void;
  onSignedOut: () => void;
}

export function AccountPage({
  user,
  authReady,
  onUserUpdated,
  onSignedOut,
}: AccountPageProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [links, setLinks] = useState<LinkSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [domainInput, setDomainInput] = useState(user?.vanityDomain ?? '');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [savingDomain, setSavingDomain] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const hostLabel = typeof window !== 'undefined' ? window.location.host : 'playersqr.app';

  useEffect(() => {
    setDomainInput(user?.vanityDomain ?? '');
  }, [user?.vanityDomain]);

  useEffect(() => {
    if (authReady && !user) {
      navigate('/auth?redirect=/account', { replace: true });
    }
  }, [authReady, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadLinks = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      apiFetch<{ ok: boolean; links?: LinkSummaryItem[] }>('/api/my-links')
        .then((res) => {
          if (!cancelled && res.ok && Array.isArray(res.links)) {
            setLinks(res.links);
          }
        })
        .catch(() => {
          // ignore poll errors
        })
        .finally(() => {
          if (!cancelled && showSpinner) setLoading(false);
        });
    };

    loadLinks(true);
    const timer = window.setInterval(() => loadLinks(false), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user?.id]);

  const handleSignOut = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    onSignedOut();
    toast.success('Logged out');
    navigate('/');
  };

  const handleSaveDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setDomainError(null);

    const normalized = normalizeVanityDomain(domainInput);
    if (normalized === null) {
      setDomainError(
        'Enter a valid domain name, like playersofficial.com or go.playersofficial.com',
      );
      return;
    }

    setSavingDomain(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        vanityDomain?: string;
        error?: string;
      }>('/api/account/vanity-domain', {
        method: 'PATCH',
        body: JSON.stringify({ domain: normalized }),
      });

      if (!res.ok) {
        setDomainError(res.error || 'Could not save custom domain');
        return;
      }

      const nextDomain = res.vanityDomain ?? '';
      setDomainInput(nextDomain);
      onUserUpdated({ ...user, vanityDomain: nextDomain });
      toast.success(
        nextDomain
          ? `Vanity domain linked: ${nextDomain}`
          : 'Custom vanity domain removed',
      );
    } catch {
      setDomainError('Could not save custom domain');
    } finally {
      setSavingDomain(false);
    }
  };

  const handleRemoveDomain = async () => {
    if (!user) return;
    setDomainError(null);
    setSavingDomain(true);
    try {
      const res = await apiFetch<{ ok: boolean; vanityDomain?: string; error?: string }>(
        '/api/account/vanity-domain',
        {
          method: 'PATCH',
          body: JSON.stringify({ domain: '' }),
        },
      );
      if (!res.ok) {
        setDomainError(res.error || 'Could not remove custom domain');
        return;
      }
      setDomainInput('');
      onUserUpdated({ ...user, vanityDomain: '' });
      toast.success('Custom vanity domain removed');
    } catch {
      setDomainError('Could not remove custom domain');
    } finally {
      setSavingDomain(false);
    }
  };

  if (!authReady || !user) {
    return (
      <main className="mx-auto max-w-6xl px-4 pb-20">
        <div className="flex items-center gap-2 py-20 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading…
        </div>
      </main>
    );
  }

  const totalScans = links.reduce((sum, item) => sum + Number(item.total), 0);
  const totalUnique = links.reduce((sum, item) => sum + Number(item.uniq), 0);
  const previewDomain = normalizeVanityDomain(domainInput) || '';

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20">
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-primary">
            My account
          </div>
          <h1 className="mt-1 font-display text-3xl font-black uppercase leading-none sm:text-5xl">
            Your links
          </h1>
          <p className="mt-2 truncate font-mono text-sm text-muted-foreground">
            {user.email}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {user.isAdmin && (
            <Link to="/admin" className={buttonClasses('ink', 'sm')}>
              <ShieldCheck />
              Admin dashboard
            </Link>
          )}
          <Link to="/#create" className={buttonClasses('hero', 'sm')}>
            <Plus />
            New QR
          </Link>
          <Button variant="chunky" size="sm" onClick={handleSignOut}>
            <LogOut />
            Log out
          </Button>
        </div>
      </div>

      {user.isAdmin && (
        <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-lg border-2 border-ink stripe-volt p-4 sm:flex-row sm:items-center">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider">Administrator Access</div>
            <p className="text-sm font-semibold">
              View all users, monitor website opens &amp; downloads, and activate or deactivate any account.
            </p>
          </div>
          <Link to="/admin" className={buttonClasses('ink', 'sm')}>
            <ShieldCheck />
            Open Admin Dashboard
            <ArrowRight />
          </Link>
        </div>
      )}

      <div className="mt-8 grid grid-cols-3 gap-3">
        <AccountStat label="Links" value={links.length} />
        <AccountStat label="Scans + clicks" value={totalScans} />
        <AccountStat label="People reached" value={totalUnique} highlight />
      </div>

      {/* Custom Vanity Domain Configuration */}
      <section className="mt-8 panel p-5 sm:p-6">
        <div className="flex flex-col gap-2 border-b-2 border-muted pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl font-black uppercase">
              <Globe className="size-5 text-primary" />
              Custom vanity domain
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Link your own branded domain so all your shortened links share your identity.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
            <span
              className={`size-2 rounded-full ${
                user.vanityDomain ? 'bg-pitch' : 'bg-muted-foreground'
              }`}
            />
            {user.vanityDomain ? `Linked · ${user.vanityDomain}` : 'Using default host'}
          </div>
        </div>

        <form onSubmit={handleSaveDomain} className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="vanity-domain" className="text-sm font-semibold">
                Branded domain
              </label>
              <div className="flex h-11 items-center overflow-hidden rounded-md border-2 border-ink bg-background font-mono text-sm focus-within:ring-2 focus-within:ring-ring">
                <span className="whitespace-nowrap border-r-2 border-ink bg-muted px-3 py-2.5 text-muted-foreground">
                  https://
                </span>
                <input
                  id="vanity-domain"
                  type="text"
                  placeholder="playersofficial.com"
                  value={domainInput}
                  onChange={(e) => {
                    setDomainInput(e.target.value);
                    setDomainError(null);
                  }}
                  className="h-full min-w-0 flex-1 bg-transparent px-3 outline-none"
                />
              </div>
            </div>

            {domainError && (
              <p className="rounded-md border-2 border-destructive bg-card px-3 py-2 text-sm font-semibold text-destructive">
                {domainError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="hero" size="default" disabled={savingDomain}>
                {savingDomain ? <LoaderCircle className="animate-spin" /> : <Check />}
                Save domain
              </Button>
              {user.vanityDomain && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={savingDomain}
                  onClick={handleRemoveDomain}
                >
                  <Trash2 />
                  Remove
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-lg border-2 border-ink bg-background p-4">
            <div>
              <div className="text-xs font-bold uppercase text-muted-foreground">
                Short link preview
              </div>
              <div className="mt-1.5 break-all font-mono text-sm font-semibold text-foreground">
                {previewDomain
                  ? `https://${previewDomain}/playerqr/summer-cup`
                  : `${origin}/playerqr/summer-cup`}
              </div>
            </div>

            <div className="border-t-2 border-muted pt-3 text-xs text-muted-foreground">
              <span className="font-bold text-foreground">DNS setup:</span> Point a{' '}
              <span className="font-mono font-semibold text-foreground">CNAME</span> record for
              your domain or subdomain to{' '}
              <span className="font-mono font-semibold text-foreground">{hostLabel}</span>.
            </div>
          </div>
        </form>
      </section>

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading your links…
        </div>
      ) : links.length === 0 ? (
        <div className="mt-8 panel border-dashed p-10 text-center shadow-none">
          <p className="text-muted-foreground">You haven&apos;t created any links yet.</p>
          <Link to="/#create" className={buttonClasses('hero', 'default', 'mt-4')}>
            Create your first QR
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {links.map((item) => (
            <li key={item.code}>
              <Link
                to={`/links/${item.code}`}
                className="panel group flex items-center gap-4 p-4 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard-lg"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold">
                      {item.title || `/playerqr/${item.code}`}
                    </span>
                    {item.is_active === false && (
                      <span className="text-xs font-semibold text-destructive">
                        · Paused
                      </span>
                    )}
                  </div>
                  <div className="truncate font-mono text-xs text-primary">
                    {buildShortUrl(origin, item.code, 'link')}
                    {user.vanityDomain ? ` · ${user.vanityDomain}` : ''}
                  </div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    → {item.destination_url}
                  </div>
                  <div className="mt-3 flex gap-5 text-xs">
                    <MiniMetric label="Scans + clicks" value={Number(item.total)} />
                    <MiniMetric label="People" value={Number(item.uniq)} />
                    <MiniMetric label="QR" value={Number(item.qr)} />
                  </div>
                </div>
                <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-1" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function AccountStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className={`panel p-4 shadow-hard-sm ${highlight ? 'bg-volt' : ''}`}>
      <div className="text-xs font-bold uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold leading-none sm:text-4xl">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-mono text-lg font-semibold leading-none">
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-muted-foreground">{label}</div>
    </div>
  );
}
