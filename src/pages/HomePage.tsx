import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckSquare,
  ExternalLink,
  LoaderCircle,
  QrCode,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Button, buttonClasses } from '../components/Button';
import { CopyLinkButton, QrColorPicker, QrPreview } from '../components/QrPreview';
import { useToast } from '../components/Toast';
import {
  buildShortUrl,
  isValidAlias,
  normalizeWebUrl,
  QR_COLOR_PRESETS,
} from '../lib/qr';
import {
  apiFetch,
  saveColorPref,
  type AuthUser,
  type LinkSummaryItem,
  type SavedDeviceLink,
} from '../lib/storage';

interface HomePageProps {
  user: AuthUser | null;
  authReady: boolean;
  savedLinks: SavedDeviceLink[];
  onLinkCreated: (entry: SavedDeviceLink | null) => void;
  onLinksRemoved: (codes: string[]) => void;
}

export function HomePage({
  user,
  authReady,
  savedLinks,
  onLinkCreated,
  onLinksRemoved,
}: HomePageProps) {
  const toast = useToast();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const [destination, setDestination] = useState('');
  const [title, setTitle] = useState('');
  const [alias, setAlias] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ code: string; title: string } | null>(null);
  const [colorIdx, setColorIdx] = useState(0);

  const [summaries, setSummaries] = useState<LinkSummaryItem[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(() => new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);

  const savedKey = savedLinks.map((item) => item.code).join(',');

  const fetchSummaries = useCallback(
    async (showSpinner: boolean) => {
      if (!authReady) return;
      if (user) {
        if (showSpinner) setLoadingSummaries(true);
        try {
          const res = await apiFetch<{ ok: boolean; links?: LinkSummaryItem[] }>(
            '/api/my-links',
          );
          if (res.ok && Array.isArray(res.links)) {
            setSummaries(res.links);
          }
        } catch {
          // ignore poll errors
        } finally {
          if (showSpinner) setLoadingSummaries(false);
        }
        return;
      }

      if (savedLinks.length === 0) {
        setSummaries([]);
        return;
      }

      if (showSpinner) setLoadingSummaries(true);
      try {
        const res = await apiFetch<{ ok: boolean; links?: LinkSummaryItem[] }>(
          '/api/links/summary',
          {
            method: 'POST',
            body: JSON.stringify({
              items: savedLinks.map((item) => ({
                code: item.code,
                token: item.token,
              })),
            }),
          },
        );
        if (res.ok && Array.isArray(res.links)) {
          setSummaries(res.links);
        }
      } catch {
        // ignore poll errors
      } finally {
        if (showSpinner) setLoadingSummaries(false);
      }
    },
    [authReady, user?.id, savedKey],
  );

  useEffect(() => {
    fetchSummaries(true);
    const timer = window.setInterval(() => fetchSummaries(false), 10000);
    return () => window.clearInterval(timer);
  }, [fetchSummaries]);

  // Keep selectedCodes pruned to currently existing summaries
  useEffect(() => {
    const valid = new Set(summaries.map((item) => item.code));
    setSelectedCodes((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const code of prev) {
        if (valid.has(code)) next.add(code);
        else changed = true;
      }
      return changed ? next : prev;
    });
    if (summaries.length === 0) {
      setSelectMode(false);
      setConfirmBulkDelete(false);
    }
  }, [summaries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!normalizeWebUrl(destination)) {
      setFormError('Enter a valid web address, like example.com/menu');
      return;
    }
    if (alias && !isValidAlias(alias)) {
      setFormError('Custom link: 3–32 letters, numbers, - or _');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        code?: string;
        token?: string | null;
        saved?: boolean;
        link?: LinkSummaryItem | null;
        error?: string;
      }>('/api/links', {
        method: 'POST',
        body: JSON.stringify({ destination, title, alias }),
      });

      if (!res.ok || !res.code) {
        setFormError(res.error || 'Something went wrong. Please try again.');
        return;
      }

      if (res.link) {
        const createdSummary = res.link;
        setSummaries((prev) => [
          createdSummary,
          ...prev.filter((item) => item.code !== createdSummary.code),
        ]);
      }

      if (res.token) {
        onLinkCreated({
          code: res.code,
          token: res.token,
          createdAt: new Date().toISOString(),
        });
      } else {
        onLinkCreated(null);
        await fetchSummaries(false);
      }

      saveColorPref(res.code, colorIdx);
      setCreated({ code: res.code, title: title.trim() });
      toast.success(
        res.saved ? 'Ready — saved to your account' : 'QR code and short link ready',
      );
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleColorChange = (nextIdx: number) => {
    setColorIdx(nextIdx);
    if (created?.code) {
      saveColorPref(created.code, nextIdx);
    }
  };

  const toggleCodeSelection = (code: string) => {
    setConfirmBulkDelete(false);
    setSelectMode(true);
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setConfirmBulkDelete(false);
    if (selectedCodes.size === summaries.length) {
      setSelectedCodes(new Set());
    } else {
      setSelectedCodes(new Set(summaries.map((item) => item.code)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedCodes(new Set());
    setConfirmBulkDelete(false);
  };

  const handleBulkDelete = async () => {
    if (selectedCodes.size === 0) return;
    setDeletingBulk(true);
    try {
      const tokenByCode = new Map(savedLinks.map((item) => [item.code, item.token]));
      const items = Array.from(selectedCodes).map((code) => ({
        code,
        ...(user ? {} : { token: tokenByCode.get(code) }),
      }));

      const res = await apiFetch<{
        ok: boolean;
        deletedCodes?: string[];
        error?: string;
      }>('/api/links/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ items }),
      });

      if (!res.ok || !res.deletedCodes) {
        toast.error(res.error || 'Could not delete selected links');
        return;
      }

      const deletedSet = new Set(res.deletedCodes);
      setSummaries((prev) => prev.filter((item) => !deletedSet.has(item.code)));
      if (!user) {
        onLinksRemoved(res.deletedCodes);
      }
      exitSelectMode();
      toast.success(
        `Deleted ${res.deletedCodes.length} ${
          res.deletedCodes.length === 1 ? 'link' : 'links'
        }`,
      );
    } catch {
      toast.error('Could not delete selected links');
    } finally {
      setDeletingBulk(false);
    }
  };

  const activePreset = QR_COLOR_PRESETS[colorIdx] ?? QR_COLOR_PRESETS[0];
  const allSelected = summaries.length > 0 && selectedCodes.size === summaries.length;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20">
      <section className="grid items-start gap-10 pt-10 md:grid-cols-[1.05fr_1fr] md:pt-16">
        <div className="animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-card px-3 py-1 text-xs font-bold uppercase tracking-wider">
            <span className="size-2 rounded-full bg-pitch animate-pulse-dot" />
            Live scan tracking
          </span>

          <h1 className="mt-5 font-display text-4xl font-black uppercase leading-[0.95] sm:text-6xl">
            One QR.
            <br />
            <span className="relative inline-block">
              <span className="absolute inset-x-0 bottom-1 -z-10 h-4 bg-volt sm:h-6" />
              Change it anytime.
            </span>
            <br />
            Count every scan.
          </h1>

          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            Create a dynamic QR code and short link, print it once, and see exactly how many
            people scanned it — by day, device and country.
          </p>

          <ul className="mt-8 grid gap-3 text-sm font-semibold sm:grid-cols-3">
            <li className="panel flex items-start gap-3 p-3 shadow-hard-sm [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-primary">
              <RefreshCw />
              <div>
                <div>Dynamic</div>
                <div className="font-normal text-muted-foreground">
                  Edit the destination later
                </div>
              </div>
            </li>
            <li className="panel flex items-start gap-3 p-3 shadow-hard-sm [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-primary">
              <Users />
              <div>
                <div>Unique people</div>
                <div className="font-normal text-muted-foreground">
                  Not just raw clicks
                </div>
              </div>
            </li>
            <li className="panel flex items-start gap-3 p-3 shadow-hard-sm [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-primary">
              <BarChart3 />
              <div>
                <div>QR vs link</div>
                <div className="font-normal text-muted-foreground">
                  See which one works
                </div>
              </div>
            </li>
          </ul>
        </div>

        <div id="create" className="panel scroll-mt-24 p-5 shadow-hard-lg animate-rise sm:p-6">
          {created ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-black uppercase">Ready to share</h2>
                <button
                  type="button"
                  className="text-sm font-semibold text-primary underline-offset-4 hover:underline cursor-pointer"
                  onClick={() => {
                    setCreated(null);
                    setDestination('');
                    setTitle('');
                    setAlias('');
                    setFormError(null);
                  }}
                >
                  + New
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                <QrPreview
                  value={buildShortUrl(origin, created.code, 'qr')}
                  fileName={`playersqr-${created.code}`}
                  code={created.code}
                  dark={activePreset.dark}
                  light={activePreset.light}
                />

                <div className="flex min-w-0 flex-col gap-3">
                  {created.title && <div className="font-bold">{created.title}</div>}

                  <div>
                    <div className="text-xs font-bold uppercase text-muted-foreground">
                      Short link (live now)
                    </div>
                    <a
                      href={buildShortUrl(origin, created.code, 'link')}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block break-all rounded-md border-2 border-ink bg-background px-3 py-2 font-mono text-sm hover:bg-accent"
                    >
                      {buildShortUrl(origin, created.code, 'link')}
                    </a>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <CopyLinkButton value={buildShortUrl(origin, created.code, 'link')} />
                      <a
                        href={buildShortUrl(origin, created.code, 'link')}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonClasses('chunky', 'sm')}
                      >
                        Open link
                        <ExternalLink />
                      </a>
                    </div>
                  </div>

                  {user?.vanityDomain && (
                    <div className="rounded-md border border-ink/40 bg-background/60 px-2.5 py-2">
                      <div className="text-[11px] font-bold uppercase text-muted-foreground">
                        Custom domain URL (needs DNS CNAME)
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs text-primary">
                          {buildShortUrl(origin, created.code, 'link', user.vanityDomain)}
                        </span>
                        <CopyLinkButton
                          value={buildShortUrl(origin, created.code, 'link', user.vanityDomain)}
                          label="Copy"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="mb-1.5 text-xs font-bold uppercase text-muted-foreground">
                      QR colors
                    </div>
                    <QrColorPicker value={colorIdx} onChange={handleColorChange} />
                  </div>
                </div>
              </div>

              <Link
                to={`/links/${created.code}`}
                className={buttonClasses('hero', 'xl', 'w-full')}
              >
                <BarChart3 />
                See who&apos;s scanning
                <ArrowRight />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-black uppercase">Create</h2>
                <span className="font-mono text-xs text-muted-foreground">
                  {user ? 'saved to your account' : 'free · no signup'}
                </span>
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="destination" className="text-sm font-semibold">
                  Where should it go?
                </label>
                <input
                  id="destination"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="example.com/match-tickets"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="h-12 w-full rounded-md border-2 border-ink bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="title" className="text-sm font-semibold">
                  Name (optional)
                </label>
                <input
                  id="title"
                  type="text"
                  placeholder="Stadium poster — gate 4"
                  value={title}
                  maxLength={80}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-11 w-full rounded-md border-2 border-ink bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="alias" className="text-sm font-semibold">
                  Custom short link (optional)
                </label>
                <div className="flex h-11 items-center overflow-hidden rounded-md border-2 border-ink bg-background font-mono text-sm focus-within:ring-2 focus-within:ring-ring">
                  <span className="whitespace-nowrap border-r-2 border-ink bg-muted px-3 py-2.5 text-muted-foreground">
                    /playerqr/
                  </span>
                  <input
                    id="alias"
                    type="text"
                    placeholder="summer-cup"
                    value={alias}
                    maxLength={32}
                    onChange={(e) => setAlias(e.target.value.replace(/\s/g, '-'))}
                    className="h-full min-w-0 flex-1 bg-transparent px-3 outline-none"
                  />
                </div>
              </div>

              {formError && (
                <p className="rounded-md border-2 border-destructive bg-card px-3 py-2 text-sm font-semibold text-destructive">
                  {formError}
                </p>
              )}

              <Button type="submit" variant="hero" size="xl" disabled={submitting}>
                {submitting ? <LoaderCircle className="animate-spin" /> : <QrCode />}
                Generate QR + short link
              </Button>
            </form>
          )}
        </div>
      </section>

      <section id="my-links" className="mt-20 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-3">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-2xl font-black uppercase sm:text-3xl">My links</h2>
            <span className="font-mono text-xs text-muted-foreground">
              {user ? 'your account only' : 'saved on this device'}
            </span>
          </div>

          {summaries.length > 0 && (
            <Button
              variant={selectMode ? 'ink' : 'chunky'}
              size="sm"
              onClick={() => {
                if (selectMode) exitSelectMode();
                else setSelectMode(true);
              }}
            >
              {selectMode ? <X /> : <CheckSquare />}
              {selectMode ? 'Cancel' : 'Select'}
            </Button>
          )}
        </div>

        <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-lg border-2 border-ink stripe-volt p-4 sm:flex-row sm:items-center">
          <p className="text-sm font-semibold">
            {user
              ? `Logged in as ${user.email} — only your own links are visible and editable here.`
              : 'Sign up free to keep your links and scan stats private to your account on any device.'}
          </p>
          {user ? (
            <Link to="/account" className={buttonClasses('ink', 'sm')}>
              Open my account
              <ArrowRight />
            </Link>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/auth?mode=login" className={buttonClasses('chunky', 'sm')}>
                Login
              </Link>
              <Link to="/auth?mode=signup" className={buttonClasses('ink', 'sm')}>
                Sign up
                <ArrowRight />
              </Link>
            </div>
          )}
        </div>

        {selectMode && summaries.length > 0 && (
          <div className="mt-4 panel flex flex-wrap items-center justify-between gap-3 p-3 shadow-hard-sm animate-rise">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="chunky" size="sm" onClick={toggleSelectAll}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </Button>
              <span className="font-mono text-xs font-semibold text-muted-foreground">
                {selectedCodes.size} of {summaries.length} selected
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!confirmBulkDelete ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={selectedCodes.size === 0}
                  onClick={() => setConfirmBulkDelete(true)}
                >
                  <Trash2 />
                  Delete selected ({selectedCodes.size})
                </Button>
              ) : (
                <>
                  <span className="text-xs font-semibold text-destructive">
                    Delete {selectedCodes.size}{' '}
                    {selectedCodes.size === 1 ? 'QR code' : 'QR codes'}?
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deletingBulk}
                    onClick={handleBulkDelete}
                  >
                    {deletingBulk ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                    Confirm delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletingBulk}
                    onClick={() => setConfirmBulkDelete(false)}
                  >
                    Keep
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {loadingSummaries ? (
          <div className="mt-6 flex items-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading scans…
          </div>
        ) : summaries.length === 0 ? (
          <div className="mt-6 panel border-dashed p-8 text-center text-muted-foreground shadow-none">
            Nothing here yet — create your first QR code above.
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {summaries.map((item) => {
              const isSelected = selectedCodes.has(item.code);
              return (
                <li key={item.code}>
                  <div
                    className={`panel group flex items-center gap-3 p-4 transition-all ${
                      isSelected
                        ? 'bg-volt/25 shadow-hard-lg'
                        : 'hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard-lg'
                    }`}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`Select ${item.title || `/playerqr/${item.code}`}`}
                      onClick={() => toggleCodeSelection(item.code)}
                      className={`grid size-10 shrink-0 place-items-center rounded-md border-2 border-ink cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-volt text-volt-foreground shadow-hard-sm'
                          : 'bg-background text-transparent hover:bg-accent/50'
                      }`}
                    >
                      <Check className="size-4 stroke-[3]" />
                    </button>

                    {selectMode ? (
                      <button
                        type="button"
                        onClick={() => toggleCodeSelection(item.code)}
                        className="flex min-w-0 flex-1 items-center gap-4 text-left cursor-pointer"
                      >
                        <LinkCardContent
                          item={item}
                          origin={origin}
                          vanityDomain={user?.vanityDomain}
                        />
                      </button>
                    ) : (
                      <Link
                        to={`/links/${item.code}`}
                        className="flex min-w-0 flex-1 items-center gap-4"
                      >
                        <LinkCardContent
                          item={item}
                          origin={origin}
                          vanityDomain={user?.vanityDomain}
                        />
                        <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-1" />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="mt-20 border-t-2 border-ink pt-8 pb-4">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <div className="font-display text-lg font-black uppercase tracking-tight">
              PlayersQR
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              Dynamic QR codes, branded <span className="font-mono">/playerqr/</span> short links,
              custom QR styling, and live 30-day scan analytics.
            </p>
          </div>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap items-center gap-4 text-xs font-semibold"
          >
            <a href="#create" className="hover:underline">
              Create QR
            </a>
            <a href="#my-links" className="hover:underline">
              My Links
            </a>
            <Link to="/auth?mode=signup" className="hover:underline">
              Sign up
            </Link>
            <Link to="/auth?mode=login" className="hover:underline">
              Login
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function LinkCardContent({
  item,
  origin,
  vanityDomain,
}: {
  item: LinkSummaryItem;
  origin: string;
  vanityDomain?: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="truncate font-bold">{item.title || `/playerqr/${item.code}`}</span>
        {item.is_active === false && (
          <span className="text-xs font-semibold text-destructive">· Paused</span>
        )}
      </div>
      <div className="truncate font-mono text-xs text-primary">
        /playerqr/{item.code}
        {vanityDomain ? ` · ${vanityDomain}` : ''}
      </div>
      <div className="truncate font-mono text-xs text-muted-foreground">
        {item.destination_url}
      </div>
      <div className="mt-3 flex gap-4 text-xs">
        <MiniStat label="Scans + clicks" value={Number(item.total)} />
        <MiniStat label="People" value={Number(item.uniq)} />
        <MiniStat label="QR" value={Number(item.qr)} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-mono text-lg font-semibold leading-none">
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-muted-foreground">{label}</div>
    </div>
  );
}
