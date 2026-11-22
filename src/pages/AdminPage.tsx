import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AppWindow,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  Globe,
  Link2,
  LoaderCircle,
  Lock,
  Monitor,
  PauseCircle,
  PlayCircle,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button, buttonClasses } from '../components/Button';
import { useToast } from '../components/Toast';
import {
  formatChartDay,
  formatCountryName,
  formatRelativeTime,
} from '../lib/qr';
import {
  apiFetch,
  getSessionToken,
  type AuthUser,
  type LinkSummaryItem,
} from '../lib/storage';

interface AdminOverviewResponse {
  ok: boolean;
  error?: string;
  stats: {
    totalUsers: number;
    activeUsers: number;
    deactivatedUsers: number;
    totalLinks: number;
    activeLinks: number;
    pausedLinks: number;
    totalScans: number;
    uniqueScanVisitors: number;
    qrScans: number;
    linkClicks: number;
    totalSiteVisits: number;
    uniqueSiteVisitors: number;
    totalQrDownloads: number;
    qrDownloadsPng: number;
    qrDownloadsSvg: number;
    totalAppInstalls: number;
    todayVisits: number;
    todayScans: number;
    todayLinks: number;
    todaySignups: number;
  };
  daily: Array<{
    day: string;
    visits: number;
    scans: number;
    linksCreated: number;
    downloads: number;
    signups: number;
  }>;
  devices: Array<{ name: string; value: number }>;
  countries: Array<{ name: string; value: number }>;
  os: Array<{ name: string; value: number }>;
  browsers: Array<{ name: string; value: number }>;
  topLinks: Array<LinkSummaryItem & { owner_email: string }>;
  recentEvents: Array<{
    id: number;
    event_type: string;
    visitor_id: string;
    user_id: string | null;
    user_email: string;
    path: string;
    code: string;
    device: string;
    os: string;
    browser: string;
    country: string;
    city: string;
    created_at: string;
  }>;
}

interface AdminUserItem {
  id: string;
  email: string;
  vanity_domain: string;
  is_active: boolean;
  is_admin: boolean;
  last_active_at: string;
  created_at: string;
  link_count: number;
  active_link_count: number;
  total_scans: number;
  total_downloads: number;
}

interface AdminUserDetailResponse {
  ok: boolean;
  user: AdminUserItem;
  links: LinkSummaryItem[];
  recentEvents: AdminOverviewResponse['recentEvents'];
}

interface AdminLinkItem extends LinkSummaryItem {
  owner_user_id: string | null;
  owner_email: string;
  updated_at: string;
}

interface AdminPageProps {
  user: AuthUser | null;
  authReady: boolean;
}

type AdminTab = 'overview' | 'users' | 'links';
type RangeWindow = 30 | 14 | 7;
type ChartMode = 'traffic' | 'growth';
type UserFilter = 'all' | 'active' | 'deactivated';
type LinkFilter = 'all' | 'active' | 'paused';

export function AdminPage({ user, authReady }: AdminPageProps) {
  const navigate = useNavigate();
  const toast = useToast();

  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [allLinks, setAllLinks] = useState<AdminLinkItem[]>([]);

  const [rangeDays, setRangeDays] = useState<RangeWindow>(30);
  const [chartMode, setChartMode] = useState<ChartMode>('traffic');

  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [inspectedUser, setInspectedUser] = useState<AdminUserDetailResponse | null>(null);
  const [loadingInspect, setLoadingInspect] = useState(false);
  const [pendingStatusUser, setPendingStatusUser] = useState<{
    id: string;
    email: string;
    nextActive: boolean;
  } | null>(null);
  const [pauseUserLinks, setPauseUserLinks] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const [linkSearch, setLinkSearch] = useState('');
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');
  const [togglingCode, setTogglingCode] = useState<string | null>(null);
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  useEffect(() => {
    if (authReady && !user) {
      navigate('/auth?mode=login&redirect=/admin', { replace: true });
    }
  }, [authReady, user, navigate]);

  const fetchAdminData = useCallback(
    async (showSpinner: boolean) => {
      if (!authReady || !user?.isAdmin) return;
      if (showSpinner) setLoading(true);
      else setRefreshing(true);

      try {
        const [ovRes, usersRes, linksRes] = await Promise.all([
          apiFetch<AdminOverviewResponse>('/api/admin/overview'),
          apiFetch<{ ok: boolean; users?: AdminUserItem[] }>('/api/admin/users'),
          apiFetch<{ ok: boolean; links?: AdminLinkItem[] }>('/api/admin/links'),
        ]);

        if (ovRes.ok) setOverview(ovRes);
        if (usersRes.ok && Array.isArray(usersRes.users)) setUsers(usersRes.users);
        if (linksRes.ok && Array.isArray(linksRes.links)) setAllLinks(linksRes.links);
      } catch {
        toast.error('Could not load admin dashboard');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authReady, user?.isAdmin, toast],
  );

  useEffect(() => {
    if (!authReady || !user?.isAdmin) {
      setLoading(false);
      return;
    }
    fetchAdminData(true);
    const timer = window.setInterval(() => fetchAdminData(false), 10000);
    return () => window.clearInterval(timer);
  }, [authReady, user?.isAdmin, fetchAdminData]);

  const handleInspectUser = async (userId: string) => {
    setLoadingInspect(true);
    try {
      const res = await apiFetch<AdminUserDetailResponse>(
        `/api/admin/users/${encodeURIComponent(userId)}`,
      );
      if (res.ok) {
        setInspectedUser(res);
      } else {
        toast.error('Could not load user details');
      }
    } catch {
      toast.error('Could not load user details');
    } finally {
      setLoadingInspect(false);
    }
  };

  const handleConfirmUserStatus = async () => {
    if (!pendingStatusUser) return;
    const { id, email, nextActive } = pendingStatusUser;
    setUpdatingUserId(id);
    try {
      const res = await apiFetch<{ ok: boolean; is_active?: boolean; error?: string }>(
        `/api/admin/users/${encodeURIComponent(id)}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            is_active: nextActive,
            pause_links: pauseUserLinks,
          }),
        },
      );
      if (!res.ok) {
        toast.error(res.error || 'Could not update account status');
        return;
      }

      toast.success(
        nextActive
          ? `Account activated: ${email}`
          : `Account deactivated: ${email}`,
      );
      setPendingStatusUser(null);
      await fetchAdminData(false);
      if (inspectedUser?.user.id === id) {
        await handleInspectUser(id);
      }
    } catch {
      toast.error('Could not update account status');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleLinkStatus = async (code: string, currentActive: boolean) => {
    setTogglingCode(code);
    try {
      const res = await apiFetch<{ ok: boolean; is_active?: boolean; error?: string }>(
        `/api/links/${encodeURIComponent(code)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ is_active: !currentActive }),
        },
      );
      if (!res.ok) {
        toast.error(res.error || 'Could not update link');
        return;
      }
      toast.success(res.is_active ? `/playerqr/${code} activated` : `/playerqr/${code} paused`);
      await fetchAdminData(false);
      if (inspectedUser) {
        await handleInspectUser(inspectedUser.user.id);
      }
    } catch {
      toast.error('Could not update link');
    } finally {
      setTogglingCode(null);
    }
  };

  const handleDeleteLink = async (code: string) => {
    setDeletingCode(code);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(
        `/api/links/${encodeURIComponent(code)}`,
        { method: 'DELETE', body: JSON.stringify({}) },
      );
      if (!res.ok) {
        toast.error(res.error || 'Could not delete link');
        return;
      }
      toast.success(`Deleted /playerqr/${code}`);
      setConfirmDeleteCode(null);
      await fetchAdminData(false);
      if (inspectedUser) {
        await handleInspectUser(inspectedUser.user.id);
      }
    } catch {
      toast.error('Could not delete link');
    } finally {
      setDeletingCode(null);
    }
  };

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const headers = new Headers({ 'X-Requested-With': 'PlayersQR' });
      const token = getSessionToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      const response = await fetch('/api/admin/export-csv', {
        method: 'GET',
        headers,
        credentials: 'include',
      });
      if (!response.ok) {
        toast.error('Could not export CSV report');
        return;
      }
      const csvText = await response.text();
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `playersqr-admin-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Admin activity & link report exported');
    } catch {
      toast.error('Could not export CSV report');
    } finally {
      setExportingCsv(false);
    }
  };

  const chartSeries = useMemo(() => {
    const allDays = overview?.daily ?? [];
    return allDays.slice(-rangeDays).map((d) => ({
      ...d,
      label: formatChartDay(d.day),
    }));
  }, [overview?.daily, rangeDays]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (userFilter === 'active' && !u.is_active) return false;
      if (userFilter === 'deactivated' && u.is_active) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.vanity_domain.toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, userFilter]);

  const filteredLinks = useMemo(() => {
    const q = linkSearch.trim().toLowerCase();
    return allLinks.filter((l) => {
      if (linkFilter === 'active' && l.is_active === false) return false;
      if (linkFilter === 'paused' && l.is_active !== false) return false;
      if (!q) return true;
      return (
        l.code.toLowerCase().includes(q) ||
        l.title.toLowerCase().includes(q) ||
        l.destination_url.toLowerCase().includes(q) ||
        l.owner_email.toLowerCase().includes(q)
      );
    });
  }, [allLinks, linkSearch, linkFilter]);

  if (!authReady || (user?.isAdmin && loading)) {
    return (
      <main className="mx-auto max-w-6xl px-4 pb-20">
        <div className="flex items-center gap-2 py-20 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading admin command center…
        </div>
      </main>
    );
  }

  if (!user) return null;

  if (!user.isAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 pb-20">
        <div className="panel mx-auto mt-16 max-w-md p-8 text-center">
          <Lock className="mx-auto size-10 text-destructive" />
          <h1 className="mt-4 font-display text-2xl font-black uppercase">
            Admin access restricted
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Only the primary administrator email can access the platform command center and
            user management controls.
          </p>
          <Link to="/account" className={buttonClasses('hero', 'default', 'mt-6')}>
            Back to my account
          </Link>
        </div>
      </main>
    );
  }

  const s = overview?.stats;
  const totalDownloadsAndInstalls = (s?.totalQrDownloads ?? 0) + (s?.totalAppInstalls ?? 0);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20">
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-volt px-3 py-0.5 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="size-3.5" />
            Super Admin · {user.email}
          </div>
          <h1 className="mt-2 font-display text-3xl font-black uppercase leading-none sm:text-5xl">
            Platform Command Center
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Full visibility across every account, website visit, QR download, app install, and
            short link.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="hero"
            size="sm"
            onClick={handleExportCsv}
            disabled={exportingCsv}
          >
            {exportingCsv ? <LoaderCircle className="animate-spin" /> : <Download />}
            Export to CSV
          </Button>
          <Button
            variant="chunky"
            size="sm"
            onClick={() => fetchAdminData(false)}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Link to="/account" className={buttonClasses('ink', 'sm')}>
            My account
          </Link>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-b-2 border-ink pb-4">
        <button
          type="button"
          onClick={() => setTab('overview')}
          className={`inline-flex items-center gap-2 rounded-md border-2 border-ink px-4 py-2 text-sm font-bold uppercase whitespace-nowrap shrink-0 cursor-pointer transition-all ${
            tab === 'overview'
              ? 'bg-volt text-volt-foreground shadow-hard-sm'
              : 'bg-card hover:bg-accent'
          }`}
        >
          <BarChart3 className="size-4" />
          Overview
        </button>
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`inline-flex items-center gap-2 rounded-md border-2 border-ink px-4 py-2 text-sm font-bold uppercase whitespace-nowrap shrink-0 cursor-pointer transition-all ${
            tab === 'users'
              ? 'bg-volt text-volt-foreground shadow-hard-sm'
              : 'bg-card hover:bg-accent'
          }`}
        >
          <Users className="size-4" />
          Users &amp; Gmail ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('links')}
          className={`inline-flex items-center gap-2 rounded-md border-2 border-ink px-4 py-2 text-sm font-bold uppercase whitespace-nowrap shrink-0 cursor-pointer transition-all ${
            tab === 'links'
              ? 'bg-volt text-volt-foreground shadow-hard-sm'
              : 'bg-card hover:bg-accent'
          }`}
        >
          <QrCode className="size-4" />
          All QR &amp; Links ({allLinks.length})
        </button>
      </div>

      {tab === 'overview' && (
        <div className="mt-6 flex flex-col gap-6">
          {/* Primary KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <AdminKpi
              highlight
              icon={<Eye />}
              label="Site opens"
              value={s?.totalSiteVisits ?? 0}
              hint={`${s?.uniqueSiteVisitors ?? 0} unique people`}
            />
            <AdminKpi
              icon={<Download />}
              label="Downloads"
              value={totalDownloadsAndInstalls}
              hint={`${s?.totalQrDownloads ?? 0} QR · ${s?.totalAppInstalls ?? 0} app`}
            />
            <AdminKpi
              icon={<Users />}
              label="Accounts"
              value={s?.totalUsers ?? 0}
              hint={`${s?.activeUsers ?? 0} active · ${s?.deactivatedUsers ?? 0} off`}
            />
            <AdminKpi
              icon={<QrCode />}
              label="All links"
              value={s?.totalLinks ?? 0}
              hint={`${s?.activeLinks ?? 0} live · ${s?.pausedLinks ?? 0} paused`}
            />
            <AdminKpi
              icon={<TrendingUp />}
              label="Scans + clicks"
              value={s?.totalScans ?? 0}
              hint={`${s?.uniqueScanVisitors ?? 0} unique people`}
            />
            <AdminKpi
              icon={<Activity />}
              label="Today activity"
              value={(s?.todayVisits ?? 0) + (s?.todayScans ?? 0)}
              hint={`${s?.todaySignups ?? 0} signups · ${s?.todayLinks ?? 0} links`}
            />
          </div>

          {/* 30-Day Recharts Platform Analytics */}
          <section className="panel p-4 sm:p-6">
            <div className="flex flex-col gap-3 border-b-2 border-muted pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-black uppercase">
                  <BarChart3 className="size-4 text-primary" />
                  Platform Traffic &amp; Usage — Last {rangeDays} Days
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tracks website opens, QR scans + link clicks, QR/app downloads, and account growth.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex rounded-md border-2 border-ink bg-muted p-0.5 text-xs font-bold"
                  role="group"
                >
                  <button
                    type="button"
                    onClick={() => setChartMode('traffic')}
                    className={`rounded px-2.5 py-1 whitespace-nowrap shrink-0 cursor-pointer ${
                      chartMode === 'traffic'
                        ? 'bg-ink text-ink-foreground'
                        : 'text-foreground hover:bg-card'
                    }`}
                  >
                    Opens vs scans
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode('growth')}
                    className={`rounded px-2.5 py-1 whitespace-nowrap shrink-0 cursor-pointer ${
                      chartMode === 'growth'
                        ? 'bg-ink text-ink-foreground'
                        : 'text-foreground hover:bg-card'
                    }`}
                  >
                    Downloads &amp; links
                  </button>
                </div>

                <div
                  className="inline-flex rounded-md border-2 border-ink bg-muted p-0.5 font-mono text-xs font-bold"
                  role="group"
                >
                  {([30, 14, 7] as RangeWindow[]).map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setRangeDays(days)}
                      className={`rounded px-2 py-1 whitespace-nowrap shrink-0 cursor-pointer ${
                        rangeDays === days
                          ? 'bg-volt text-volt-foreground'
                          : 'text-foreground hover:bg-card'
                      }`}
                    >
                      {days}D
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-end gap-4 text-xs font-semibold">
              {chartMode === 'traffic' ? (
                <>
                  <LegendChip className="bg-chart-1" label="Website opens" />
                  <LegendChip className="bg-chart-2" label="QR scans & clicks" />
                </>
              ) : (
                <>
                  <LegendChip className="bg-chart-1" label="QR / app downloads" />
                  <LegendChip className="bg-chart-2" label="New QR links" />
                </>
              )}
            </div>

            <div className="mt-3 h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === 'traffic' ? (
                  <AreaChart
                    data={chartSeries}
                    margin={{ left: -16, right: 8, top: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      minTickGap={18}
                    />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        border: '2px solid var(--ink)',
                        borderRadius: 8,
                        background: 'var(--card)',
                        fontSize: 12,
                        boxShadow: '3px 3px 0 0 var(--ink)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="visits"
                      name="Website opens"
                      stroke="var(--chart-1)"
                      strokeWidth={2.5}
                      fill="var(--chart-1)"
                      fillOpacity={0.18}
                    />
                    <Area
                      type="monotone"
                      dataKey="scans"
                      name="QR scans & clicks"
                      stroke="var(--ink)"
                      strokeWidth={2}
                      fill="var(--chart-2)"
                      fillOpacity={0.55}
                    />
                  </AreaChart>
                ) : (
                  <BarChart
                    data={chartSeries}
                    margin={{ left: -16, right: 8, top: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      minTickGap={18}
                    />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        border: '2px solid var(--ink)',
                        borderRadius: 8,
                        background: 'var(--card)',
                        fontSize: 12,
                        boxShadow: '3px 3px 0 0 var(--ink)',
                      }}
                    />
                    <Bar
                      dataKey="downloads"
                      name="QR & app downloads"
                      fill="var(--chart-1)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="linksCreated"
                      name="New QR links"
                      fill="var(--chart-2)"
                      stroke="var(--ink)"
                      strokeWidth={1.5}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </section>

          {/* Downloads, App Installs & Top Links */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="panel p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-black uppercase">
                <AppWindow className="size-4 text-primary" />
                Website Opens &amp; Downloads Breakdown
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <BreakdownStat label="Website opens" value={s?.totalSiteVisits ?? 0} />
                <BreakdownStat label="Unique visitors" value={s?.uniqueSiteVisitors ?? 0} />
                <BreakdownStat label="QR PNG downloads" value={s?.qrDownloadsPng ?? 0} />
                <BreakdownStat label="QR SVG downloads" value={s?.qrDownloadsSvg ?? 0} />
                <BreakdownStat label="Web app installs" value={s?.totalAppInstalls ?? 0} highlight />
                <BreakdownStat label="Today opens" value={s?.todayVisits ?? 0} />
              </div>
            </section>

            <section className="panel p-5">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-lg font-black uppercase">
                  <TrendingUp className="size-4 text-primary" />
                  Top Platform Links
                </h2>
                <button
                  type="button"
                  onClick={() => setTab('links')}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  View all
                </button>
              </div>
              {!overview || overview.topLinks.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No links created yet.</p>
              ) : (
                <ul className="mt-3 divide-y-2 divide-muted">
                  {overview.topLinks.slice(0, 6).map((item) => (
                    <li key={item.code} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/links/${item.code}`}
                            className="truncate text-sm font-bold hover:text-primary"
                          >
                            {item.title || `/playerqr/${item.code}`}
                          </Link>
                          {!item.is_active && (
                            <span className="text-xs font-bold text-destructive">· Paused</span>
                          )}
                        </div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {item.owner_email || 'Guest'} · /playerqr/{item.code}
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-mono text-xs">
                        <div className="font-bold">{Number(item.total).toLocaleString()} scans</div>
                        <div className="text-muted-foreground">{Number(item.uniq)} people</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Audience Breakdowns */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AudienceCard
              title="Countries"
              items={overview?.countries.map((c) => ({
                ...c,
                name: formatCountryName(c.name),
              }))}
              iconFor={() => <Globe />}
            />
            <AudienceCard title="Devices" items={overview?.devices} iconFor={deviceIcon} />
            <AudienceCard title="Operating system" items={overview?.os} />
            <AudienceCard title="Browsers" items={overview?.browsers} />
          </div>

          {/* Live Platform Activity Feed */}
          <section className="panel p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-black uppercase">
              <Activity className="size-4 text-primary" />
              Live Platform Activity
            </h2>
            {!overview || overview.recentEvents.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Activity will appear as visitors open the website, sign up, or download QR codes.
              </p>
            ) : (
              <ul className="mt-3 divide-y-2 divide-muted">
                {overview.recentEvents.map((ev) => (
                  <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <EventBadge type={ev.event_type} />
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">
                          {ev.user_email || `Visitor ${ev.visitor_id.slice(0, 8)}`}
                        </span>
                        {ev.code && (
                          <Link
                            to={`/links/${ev.code}`}
                            className="ml-1.5 font-mono text-xs text-primary hover:underline"
                          >
                            /playerqr/{ev.code}
                          </Link>
                        )}
                        <span className="text-muted-foreground">
                          {' — '}
                          {ev.device} · {ev.os} · {ev.browser}
                          {ev.country && ev.country !== 'Unknown'
                            ? ` · ${formatCountryName(ev.country)}`
                            : ''}
                        </span>
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {formatRelativeTime(ev.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'users' && (
        <div className="mt-6 flex flex-col gap-5">
          {/* Search & Status Filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by Gmail / email or vanity domain..."
                className="h-11 w-full rounded-md border-2 border-ink bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="inline-flex rounded-md border-2 border-ink bg-muted p-0.5 text-xs font-bold">
              {(['all', 'active', 'deactivated'] as UserFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setUserFilter(f)}
                  className={`rounded px-3 py-1.5 uppercase whitespace-nowrap shrink-0 cursor-pointer ${
                    userFilter === f ? 'bg-ink text-ink-foreground' : 'text-foreground hover:bg-card'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Pending Deactivate / Activate Confirmation Box */}
          {pendingStatusUser && (
            <div className="panel border-destructive bg-card p-4 shadow-hard animate-rise">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 font-display text-base font-black uppercase">
                    <ShieldAlert className="size-5 text-destructive" />
                    {pendingStatusUser.nextActive
                      ? 'Activate this account?'
                      : 'Deactivate this account?'}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Account: <span className="font-mono font-semibold text-foreground">{pendingStatusUser.email}</span>
                    {!pendingStatusUser.nextActive
                      ? ' — User will be blocked from logging in or editing links.'
                      : ' — User will regain full access to their account.'}
                  </p>
                  <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pauseUserLinks}
                      onChange={(e) => setPauseUserLinks(e.target.checked)}
                      className="size-4 accent-ink"
                    />
                    {pendingStatusUser.nextActive
                      ? 'Also reactivate all QR codes & links owned by this user'
                      : 'Also pause all QR codes & links owned by this user'}
                  </label>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant={pendingStatusUser.nextActive ? 'hero' : 'destructive'}
                    size="sm"
                    disabled={updatingUserId === pendingStatusUser.id}
                    onClick={handleConfirmUserStatus}
                  >
                    {updatingUserId === pendingStatusUser.id && (
                      <LoaderCircle className="animate-spin" />
                    )}
                    Confirm
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingStatusUser(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* User Inspector Panel */}
          {(loadingInspect || inspectedUser) && (
            <section className="panel bg-background p-5 shadow-hard-lg animate-rise">
              {loadingInspect && !inspectedUser ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  Loading account details…
                </div>
              ) : inspectedUser ? (
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink pb-3">
                    <div>
                      <div className="text-xs font-bold uppercase text-primary">
                        User Account Inspector
                      </div>
                      <h2 className="mt-1 font-mono text-lg font-bold">
                        {inspectedUser.user.email}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          Status:{' '}
                          <strong
                            className={
                              inspectedUser.user.is_active ? 'text-pitch' : 'text-destructive'
                            }
                          >
                            {inspectedUser.user.is_active ? 'Active' : 'Deactivated'}
                          </strong>
                        </span>
                        {inspectedUser.user.vanity_domain && (
                          <span>Domain: {inspectedUser.user.vanity_domain}</span>
                        )}
                        <span>Joined {formatRelativeTime(inspectedUser.user.created_at)}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setInspectedUser(null)}
                    >
                      <X />
                      Close
                    </Button>
                  </div>

                  <h3 className="mt-4 font-display text-sm font-black uppercase">
                    Links created by this user ({inspectedUser.links.length})
                  </h3>
                  {inspectedUser.links.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      This account hasn&apos;t created any QR links yet.
                    </p>
                  ) : (
                    <ul className="mt-3 grid gap-3 md:grid-cols-2">
                      {inspectedUser.links.map((item) => (
                        <li
                          key={item.code}
                          className="panel flex items-center justify-between gap-3 bg-card p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Link
                                to={`/links/${item.code}`}
                                className="truncate text-sm font-bold hover:text-primary"
                              >
                                {item.title || `/playerqr/${item.code}`}
                              </Link>
                              {item.is_active === false && (
                                <span className="text-xs font-bold text-destructive">· Paused</span>
                              )}
                            </div>
                            <div className="truncate font-mono text-xs text-muted-foreground">
                              /playerqr/{item.code} → {item.destination_url}
                            </div>
                            <div className="mt-1 font-mono text-xs">
                              {Number(item.total)} scans · {Number(item.uniq)} people
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              variant="chunky"
                              size="sm"
                              disabled={togglingCode === item.code}
                              onClick={() =>
                                handleToggleLinkStatus(item.code, item.is_active !== false)
                              }
                            >
                              {item.is_active !== false ? 'Pause' : 'Activate'}
                            </Button>
                            <Link
                              to={`/links/${item.code}`}
                              className={buttonClasses('ink', 'sm')}
                            >
                              Stats
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </section>
          )}

          {/* Users List */}
          {filteredUsers.length === 0 ? (
            <div className="panel border-dashed p-8 text-center text-muted-foreground shadow-none">
              No accounts match your search.
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className={`panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between ${
                    !u.is_active ? 'opacity-85 bg-muted/40' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-base font-bold">{u.email}</span>
                      {u.is_admin && (
                        <span className="rounded border-2 border-ink bg-volt px-2 py-0.5 text-[11px] font-black uppercase">
                          Admin
                        </span>
                      )}
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded border border-ink bg-card px-2 py-0.5 text-[11px] font-bold uppercase text-pitch">
                          <CheckCircle2 className="size-3" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-destructive bg-card px-2 py-0.5 text-[11px] font-bold uppercase text-destructive">
                          <UserX className="size-3" />
                          Deactivated
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        <strong className="font-mono text-foreground">{u.link_count}</strong> links (
                        {u.active_link_count} active)
                      </span>
                      <span>
                        <strong className="font-mono text-foreground">{u.total_scans}</strong> scans
                      </span>
                      <span>
                        <strong className="font-mono text-foreground">{u.total_downloads}</strong>{' '}
                        downloads
                      </span>
                      {u.vanity_domain && (
                        <span className="font-mono text-primary">{u.vanity_domain}</span>
                      )}
                      <span>
                        Last active:{' '}
                        {u.last_active_at
                          ? formatRelativeTime(u.last_active_at)
                          : formatRelativeTime(u.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      variant="chunky"
                      size="sm"
                      onClick={() => handleInspectUser(u.id)}
                    >
                      <Eye />
                      Inspect links
                    </Button>
                    {!u.is_admin && (
                      <Button
                        variant={u.is_active ? 'destructive' : 'hero'}
                        size="sm"
                        onClick={() =>
                          setPendingStatusUser({
                            id: u.id,
                            email: u.email,
                            nextActive: !u.is_active,
                          })
                        }
                      >
                        {u.is_active ? <UserX /> : <UserCheck />}
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'links' && (
        <div className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                placeholder="Search by code, title, destination URL, or owner Gmail..."
                className="h-11 w-full rounded-md border-2 border-ink bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="inline-flex rounded-md border-2 border-ink bg-muted p-0.5 text-xs font-bold">
              {(['all', 'active', 'paused'] as LinkFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setLinkFilter(f)}
                  className={`rounded px-3 py-1.5 uppercase whitespace-nowrap shrink-0 cursor-pointer ${
                    linkFilter === f ? 'bg-ink text-ink-foreground' : 'text-foreground hover:bg-card'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {filteredLinks.length === 0 ? (
            <div className="panel border-dashed p-8 text-center text-muted-foreground shadow-none">
              No links match your filter.
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredLinks.map((item) => (
                <div
                  key={item.code}
                  className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/links/${item.code}`}
                        className="truncate text-base font-bold hover:text-primary"
                      >
                        {item.title || `/playerqr/${item.code}`}
                      </Link>
                      <span className="rounded border border-ink bg-muted px-1.5 py-0.5 font-mono text-xs">
                        /playerqr/{item.code}
                      </span>
                      {item.is_active === false ? (
                        <span className="text-xs font-bold uppercase text-destructive">
                          · Paused
                        </span>
                      ) : (
                        <span className="text-xs font-bold uppercase text-pitch">· Live</span>
                      )}
                    </div>

                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      Owner: <span className="text-foreground">{item.owner_email || 'Guest'}</span> →{' '}
                      {item.destination_url}
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-4 font-mono text-xs">
                      <span>
                        <strong>{Number(item.total)}</strong> scans+clicks
                      </span>
                      <span>
                        <strong>{Number(item.uniq)}</strong> people
                      </span>
                      <span>
                        <strong>{Number(item.qr)}</strong> QR
                      </span>
                      <span className="text-muted-foreground">
                        Created {formatRelativeTime(item.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Link
                      to={`/links/${item.code}`}
                      className={buttonClasses('ink', 'sm')}
                    >
                      <BarChart3 />
                      Analytics
                    </Link>
                    <Button
                      variant="chunky"
                      size="sm"
                      disabled={togglingCode === item.code}
                      onClick={() =>
                        handleToggleLinkStatus(item.code, item.is_active !== false)
                      }
                    >
                      {togglingCode === item.code ? (
                        <LoaderCircle className="animate-spin" />
                      ) : item.is_active !== false ? (
                        <PauseCircle />
                      ) : (
                        <PlayCircle />
                      )}
                      {item.is_active !== false ? 'Deactivate' : 'Activate'}
                    </Button>
                    {confirmDeleteCode === item.code ? (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletingCode === item.code}
                          onClick={() => handleDeleteLink(item.code)}
                        >
                          {deletingCode === item.code && <LoaderCircle className="animate-spin" />}
                          Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteCode(null)}
                        >
                          Keep
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setConfirmDeleteCode(item.code)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function AdminKpi({
  icon,
  label,
  value,
  hint,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`panel p-3 shadow-hard-sm sm:p-4 [&_svg]:size-4 ${
        highlight ? 'bg-volt' : ''
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase leading-tight">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold leading-none sm:text-3xl">
        {Number(value).toLocaleString()}
      </div>
      <div className="mt-1.5 truncate text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function BreakdownStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border-2 border-ink p-3 ${
        highlight ? 'bg-volt/40' : 'bg-background'
      }`}
    >
      <div className="text-xs font-bold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold leading-none">
        {Number(value).toLocaleString()}
      </div>
    </div>
  );
}

function LegendChip({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-3 rounded-sm border border-ink ${className}`} />
      {label}
    </span>
  );
}

function deviceIcon(name: string) {
  if (name === 'Mobile') return <Smartphone />;
  if (name === 'Tablet') return <Tablet />;
  return <Monitor />;
}

function AudienceCard({
  title,
  items,
  iconFor,
}: {
  title: string;
  items?: Array<{ name: string; value: number }>;
  iconFor?: (name: string) => React.ReactNode;
}) {
  const maxVal = Math.max(1, ...(items ?? []).map((item) => item.value));
  const total = (items ?? []).reduce((sum, i) => sum + i.value, 0);

  return (
    <div className="panel p-4">
      <h3 className="font-display text-sm font-black uppercase">{title}</h3>
      {!items || items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No data yet</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {items.slice(0, 5).map((item) => (
            <li key={item.name} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0">
                  {iconFor?.(item.name)}
                  {item.name}
                </span>
                <span className="font-mono text-xs">
                  {item.value} · {total ? Math.round((item.value / total) * 100) : 0}%
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full border border-ink bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(item.value / maxVal) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    site_visit: { label: 'OPEN', cls: 'bg-card' },
    qr_download_png: { label: 'PNG DL', cls: 'bg-volt' },
    qr_download_svg: { label: 'SVG DL', cls: 'bg-volt' },
    app_install: { label: 'APP DL', cls: 'bg-pitch text-white' },
    user_signup: { label: 'SIGNUP', cls: 'bg-volt' },
    user_login: { label: 'LOGIN', cls: 'bg-card' },
    link_created: { label: 'NEW QR', cls: 'bg-primary text-white' },
  };
  const info = map[type] ?? { label: type.toUpperCase(), cls: 'bg-muted' };
  return (
    <span
      className={`rounded border-2 border-ink px-1.5 py-0.5 font-mono text-[10px] font-bold whitespace-nowrap shrink-0 ${info.cls}`}
    >
      {info.label}
    </span>
  );
}
