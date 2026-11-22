import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  ExternalLink,
  Globe,
  Link2,
  LoaderCircle,
  Lock,
  Monitor,
  PauseCircle,
  Pencil,
  PlayCircle,
  QrCode,
  Smartphone,
  Tablet,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button, buttonClasses } from '../components/Button';
import { CopyLinkButton, QrPreview, QrStylingPanel } from '../components/QrPreview';
import { useToast } from '../components/Toast';
import {
  buildShortUrl,
  formatChartDay,
  formatCountryName,
  formatRelativeTime,
  normalizeWebUrl,
  type QrStyleConfig,
} from '../lib/qr';
import {
  apiFetch,
  readQrStyle,
  saveQrStyle,
  type AuthUser,
  type SavedDeviceLink,
} from '../lib/storage';

interface DailyScanPoint {
  day: string;
  total: number;
  unique: number;
  qr: number;
  link: number;
}

interface LinkDetailResponse {
  ok: boolean;
  accessError?: 'auth_required' | 'forbidden';
  error?: string;
  link?: {
    code: string;
    destination_url: string;
    title: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    isOwner: boolean;
    ownerEmail?: string;
  };
  stats?: {
    total: number;
    unique: number;
    qr: number;
    direct: number;
    today: number;
    daily: DailyScanPoint[];
    devices: Array<{ name: string; value: number }>;
    countries: Array<{ name: string; value: number }>;
    os: Array<{ name: string; value: number }>;
    browsers: Array<{ name: string; value: number }>;
    recent: Array<{
      source: 'qr' | 'link';
      device: string;
      os: string;
      browser: string;
      country: string;
      city: string;
      created_at: string;
    }>;
  };
}

interface LinkDetailPageProps {
  user: AuthUser | null;
  savedLinks: SavedDeviceLink[];
  onLinkRemoved: (code: string) => void;
}

type RangeWindow = 30 | 14 | 7;
type ChartMode = 'volume' | 'channel';

export function LinkDetailPage({
  user,
  savedLinks,
  onLinkRemoved,
}: LinkDetailPageProps) {
  const { code = '' } = useParams();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const deviceToken = user
    ? undefined
    : savedLinks.find((item) => item.code.toLowerCase() === code.toLowerCase())?.token;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LinkDetailResponse | null>(null);
  const [qrStyle, setQrStyle] = useState<QrStyleConfig>(() => readQrStyle(code));
  const [rangeDays, setRangeDays] = useState<RangeWindow>(30);
  const [chartMode, setChartMode] = useState<ChartMode>('volume');

  const fetchDetail = useCallback(async () => {
    try {
      const res = await apiFetch<LinkDetailResponse>(
        `/api/links/${encodeURIComponent(code)}`,
        {
          headers: deviceToken ? { 'X-Link-Token': deviceToken } : {},
        },
      );
      setData(res);
    } catch {
      setData({ ok: false });
    } finally {
      setLoading(false);
    }
  }, [code, deviceToken]);

  useEffect(() => {
    setLoading(true);
    setQrStyle(readQrStyle(code));
    fetchDetail();
    const timer = window.setInterval(fetchDetail, 5000);
    return () => window.clearInterval(timer);
  }, [code, user?.id, fetchDetail]);

  const handleStyleChange = (nextStyle: QrStyleConfig) => {
    setQrStyle(nextStyle);
    saveQrStyle(code, nextStyle);
  };

  const chartSeries = useMemo(() => {
    const allDays = data?.stats?.daily ?? [];
    const sliced = allDays.slice(-rangeDays);
    return sliced.map((d) => ({
      ...d,
      label: formatChartDay(d.day),
    }));
  }, [data?.stats?.daily, rangeDays]);

  const windowSummary = useMemo(() => {
    const windowTotal = chartSeries.reduce((sum, d) => sum + d.total, 0);
    const avgPerDay =
      chartSeries.length > 0 ? (windowTotal / chartSeries.length).toFixed(1) : '0.0';
    let peak = chartSeries[0];
    for (const point of chartSeries) {
      if (!peak || point.total > peak.total) peak = point;
    }
    return {
      windowTotal,
      avgPerDay,
      peakLabel: peak && peak.total > 0 ? `${peak.total} on ${peak.label}` : 'No scans yet',
    };
  }, [chartSeries]);

  const deviceChartData = useMemo(() => {
    const devices = data?.stats?.devices ?? [];
    return devices.slice(0, 5);
  }, [data?.stats?.devices]);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 pb-20">
        <div className="flex items-center gap-2 py-20 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading…
        </div>
      </main>
    );
  }

  if (data?.accessError === 'auth_required') {
    return (
      <main className="mx-auto max-w-6xl px-4 pb-20">
        <div className="panel mx-auto mt-16 max-w-md p-8 text-center">
          <Lock className="mx-auto size-9 text-primary" />
          <h1 className="mt-4 font-display text-2xl font-black uppercase">Login required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link belongs to an account. Login with the owner account to view its stats
            or manage it.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              to={`/auth?mode=login&redirect=${encodeURIComponent(`/links/${code}`)}`}
              className={buttonClasses('hero', 'default')}
            >
              Login
            </Link>
            <Link to="/" className={buttonClasses('chunky', 'default')}>
              Back home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (data?.accessError === 'forbidden') {
    return (
      <main className="mx-auto max-w-6xl px-4 pb-20">
        <div className="panel mx-auto mt-16 max-w-md p-8 text-center">
          <Lock className="mx-auto size-9 text-destructive" />
          <h1 className="mt-4 font-display text-2xl font-black uppercase">Private link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You can only view, edit, or deactivate links created in your own account.
          </p>
          <Link to={user ? '/account' : '/'} className={buttonClasses('hero', 'default', 'mt-6')}>
            Go to my links
          </Link>
        </div>
      </main>
    );
  }

  if (!data?.ok || !data.link) {
    return (
      <main className="mx-auto max-w-6xl px-4 pb-20">
        <div className="panel mx-auto mt-16 max-w-md p-8 text-center">
          <h1 className="font-display text-2xl font-black uppercase">Link not found</h1>
          <p className="mt-2 text-muted-foreground">
            /playerqr/{code} doesn&apos;t exist or was deleted.
          </p>
          <Link to="/" className={buttonClasses('hero', 'default', 'mt-6')}>
            Create a new one
          </Link>
        </div>
      </main>
    );
  }

  const { link, stats } = data;
  const qrShare = stats && stats.total > 0 ? Math.round((stats.qr / stats.total) * 100) : 0;

  const triggerTestRefresh = () => {
    window.setTimeout(() => {
      fetchDetail();
    }, 650);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20">
      <Link
        to={user ? '/account' : '/'}
        className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All links
      </Link>

      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <span
              className={`size-2 rounded-full ${
                link.is_active ? 'bg-pitch animate-pulse-dot' : 'bg-destructive'
              }`}
            />
            {link.is_active ? 'Live · updates every 5s' : 'Paused · QR and short link deactivated'}
          </div>
          <h1 className="mt-2 break-words font-display text-3xl font-black uppercase leading-none sm:text-5xl">
            {link.title || `/playerqr/${link.code}`}
          </h1>
          {link.ownerEmail && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md border-2 border-ink bg-volt px-2.5 py-0.5 font-mono text-xs font-bold">
              Owner: {link.ownerEmail}
            </div>
          )}
          <a
            href={link.destination_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex max-w-full items-center gap-1 font-mono text-sm text-muted-foreground hover:text-foreground"
          >
            <span className="truncate">→ {link.destination_url}</span>
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={buildShortUrl(origin, link.code)}
            target="_blank"
            rel="noreferrer"
            onClick={triggerTestRefresh}
            className={buttonClasses('chunky', 'sm')}
          >
            <Link2 />
            Test link click
          </a>
          <a
            href={buildShortUrl(origin, link.code, 'qr')}
            target="_blank"
            rel="noreferrer"
            onClick={triggerTestRefresh}
            className={buttonClasses('chunky', 'sm')}
          >
            <QrCode />
            Test QR scan
          </a>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              highlight
              icon={<Users />}
              label="Unique people"
              value={stats?.unique}
            />
            <KpiCard
              icon={<TrendingUp />}
              label="Total scans + clicks"
              value={stats?.total}
            />
            <KpiCard
              icon={<QrCode />}
              label="QR scans"
              value={stats?.qr}
              hint={stats ? `${qrShare}% of total` : undefined}
            />
            <KpiCard
              icon={<Link2 />}
              label="Link clicks"
              value={stats?.direct}
              hint={stats ? `${stats.today} today` : undefined}
            />
          </div>

          <div className="panel p-4 sm:p-5">
            <div className="flex flex-col gap-3 border-b-2 border-muted pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-black uppercase">
                  <BarChart3 className="size-4 text-primary" />
                  Last {rangeDays} days
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono font-semibold text-foreground">
                    {windowSummary.windowTotal.toLocaleString()} scans
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{windowSummary.avgPerDay}/day avg</span>
                  <span aria-hidden="true">·</span>
                  <span>Peak: {windowSummary.peakLabel}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex rounded-md border-2 border-ink bg-muted p-0.5 text-xs font-bold"
                  role="group"
                  aria-label="Chart metric view"
                >
                  <button
                    type="button"
                    onClick={() => setChartMode('volume')}
                    className={`rounded px-2.5 py-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      chartMode === 'volume'
                        ? 'bg-ink text-ink-foreground'
                        : 'text-foreground hover:bg-card'
                    }`}
                  >
                    Scans vs people
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode('channel')}
                    className={`rounded px-2.5 py-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      chartMode === 'channel'
                        ? 'bg-ink text-ink-foreground'
                        : 'text-foreground hover:bg-card'
                    }`}
                  >
                    QR vs link
                  </button>
                </div>

                <div
                  className="inline-flex rounded-md border-2 border-ink bg-muted p-0.5 font-mono text-xs font-bold"
                  role="group"
                  aria-label="Time window"
                >
                  {([30, 14, 7] as RangeWindow[]).map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setRangeDays(days)}
                      className={`rounded px-2 py-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
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
              {chartMode === 'volume' ? (
                <>
                  <LegendChip className="bg-chart-1" label="Scans + clicks" />
                  <LegendChip className="bg-chart-2" label="Unique people" />
                </>
              ) : (
                <>
                  <LegendChip className="bg-chart-1" label="QR scans" />
                  <LegendChip className="bg-chart-2" label="Link clicks" />
                </>
              )}
            </div>

            <div className="mt-3 h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === 'volume' ? (
                  <AreaChart
                    data={chartSeries}
                    margin={{ left: -20, right: 8, top: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      minTickGap={18}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                    />
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
                      dataKey="total"
                      name="Scans + clicks"
                      stroke="var(--chart-1)"
                      strokeWidth={2.5}
                      fill="var(--chart-1)"
                      fillOpacity={0.16}
                    />
                    <Area
                      type="monotone"
                      dataKey="unique"
                      name="Unique people"
                      stroke="var(--ink)"
                      strokeWidth={2}
                      fill="var(--chart-2)"
                      fillOpacity={0.55}
                    />
                  </AreaChart>
                ) : (
                  <BarChart
                    data={chartSeries}
                    margin={{ left: -20, right: 8, top: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      minTickGap={18}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                    />
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
                      dataKey="qr"
                      name="QR scans"
                      stackId="source"
                      fill="var(--chart-1)"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="link"
                      name="Link clicks"
                      stackId="source"
                      fill="var(--chart-2)"
                      stroke="var(--ink)"
                      strokeWidth={1.5}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="panel p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-black uppercase">Devices (Chart)</h3>
                <span className="font-mono text-xs text-muted-foreground">
                  {stats?.total ?? 0} total
                </span>
              </div>
              {deviceChartData.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No data yet</p>
              ) : (
                <div className="mt-3 h-40 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={deviceChartData}
                      layout="vertical"
                      margin={{ left: 0, right: 16, top: 4, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--muted)"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={68}
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                      />
                      <Tooltip
                        contentStyle={{
                          border: '2px solid var(--ink)',
                          borderRadius: 8,
                          background: 'var(--card)',
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="value" name="Scans" radius={[0, 6, 6, 0]}>
                        {deviceChartData.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={index === 0 ? 'var(--chart-1)' : 'var(--chart-2)'}
                            stroke="var(--ink)"
                            strokeWidth={1.5}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <BreakdownCard
              title="Devices"
              items={stats?.devices}
              total={stats?.total}
              iconFor={deviceIcon}
            />
            <BreakdownCard
              title="Countries"
              items={stats?.countries.map((c) => ({
                ...c,
                name: formatCountryName(c.name),
              }))}
              total={stats?.total}
              iconFor={() => <Globe />}
            />
            <BreakdownCard title="Operating system" items={stats?.os} total={stats?.total} />
            <BreakdownCard title="Browser" items={stats?.browsers} total={stats?.total} />
          </div>

          <div className="panel p-4 sm:p-5">
            <h2 className="font-display text-lg font-black uppercase">Recent activity</h2>
            {!stats || stats.recent.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No scans yet. Scan the QR code with your phone or use the test buttons above.
              </p>
            ) : (
              <ul className="mt-3 divide-y-2 divide-muted">
                {stats.recent.map((ev, idx) => (
                  <li
                    key={`${ev.created_at}-${idx}`}
                    className="flex items-center gap-3 py-2.5 text-sm"
                  >
                    <span
                      className={`rounded border-2 border-ink px-1.5 text-xs font-bold ${
                        ev.source === 'qr' ? 'bg-volt' : 'bg-card'
                      }`}
                    >
                      {ev.source === 'qr' ? 'QR' : 'LINK'}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {ev.device} · {ev.os} · {ev.browser}
                      <span className="text-muted-foreground">
                        {' — '}
                        {ev.city ? `${ev.city}, ` : ''}
                        {formatCountryName(ev.country)}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {formatRelativeTime(ev.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-6">
          <div className="panel p-4">
            <h2 className="mb-3 font-display text-lg font-black uppercase">Your QR code</h2>
            <QrPreview
              value={buildShortUrl(origin, link.code, 'qr')}
              fileName={`playersqr-${link.code}`}
              code={link.code}
              dark={qrStyle.fgColor}
              light={qrStyle.bgColor}
              shape={qrStyle.shape}
              logoType={qrStyle.logoType}
              customLogoUrl={qrStyle.customLogoUrl}
            />
            <QrStylingPanel style={qrStyle} onChange={handleStyleChange} />
            <div className="mt-4 text-xs font-bold uppercase text-muted-foreground">
              Short link (live now)
            </div>
            <a
              href={buildShortUrl(origin, link.code, 'link')}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block break-all rounded-md border-2 border-ink bg-background px-3 py-2 font-mono text-sm hover:bg-accent"
            >
              {buildShortUrl(origin, link.code, 'link')}
            </a>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CopyLinkButton value={buildShortUrl(origin, link.code, 'link')} />
              <a
                href={buildShortUrl(origin, link.code, 'link')}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses('chunky', 'sm')}
              >
                Open link
                <ExternalLink />
              </a>
            </div>
            {user?.vanityDomain && (
              <div className="mt-3 rounded-md border border-ink/40 bg-background/60 px-2.5 py-2">
                <div className="text-[11px] font-bold uppercase text-muted-foreground">
                  Custom domain URL (needs DNS CNAME)
                </div>
                <div className="mt-1 break-all font-mono text-xs text-primary">
                  {buildShortUrl(origin, link.code, 'link', user.vanityDomain)}
                </div>
                <div className="mt-1.5">
                  <CopyLinkButton
                    value={buildShortUrl(origin, link.code, 'link', user.vanityDomain)}
                    label="Copy custom"
                  />
                </div>
              </div>
            )}
          </div>

          <EditDestinationCard
            code={link.code}
            token={deviceToken}
            initialTitle={link.title}
            initialDestination={link.destination_url}
            isActive={link.is_active}
            user={user}
            onSaved={fetchDetail}
            onDeleted={onLinkRemoved}
          />
        </aside>
      </div>
    </main>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`panel p-3 shadow-hard-sm sm:p-4 [&_svg]:size-4 ${
        highlight ? 'bg-volt' : ''
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase leading-tight">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-mono text-3xl font-semibold leading-none sm:text-4xl">
        {value === undefined ? '–' : Number(value).toLocaleString()}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
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

function BreakdownCard({
  title,
  items,
  total,
  iconFor,
}: {
  title: string;
  items?: Array<{ name: string; value: number }>;
  total?: number;
  iconFor?: (name: string) => React.ReactNode;
}) {
  const maxVal = Math.max(1, ...(items ?? []).map((item) => item.value));

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

function EditDestinationCard({
  code,
  token,
  initialTitle,
  initialDestination,
  isActive,
  user,
  onSaved,
  onDeleted,
}: {
  code: string;
  token?: string;
  initialTitle: string;
  initialDestination: string;
  isActive: boolean;
  user: AuthUser | null;
  onSaved: () => Promise<void>;
  onDeleted: (code: string) => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();

  const [destination, setDestination] = useState(initialDestination);
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setDestination(initialDestination);
    setTitle(initialTitle);
  }, [initialDestination, initialTitle]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizeWebUrl(destination)) {
      toast.error('Enter a valid web address');
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(
        `/api/links/${encodeURIComponent(code)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            destination,
            title,
            ...(token ? { token } : {}),
          }),
        },
      );
      if (!res.ok) {
        toast.error(res.error || 'Could not save changes');
        return;
      }
      await onSaved();
      toast.success('Saved — your QR code now points to the new link');
    } catch {
      toast.error('Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    setToggling(true);
    try {
      const res = await apiFetch<{ ok: boolean; is_active?: boolean; error?: string }>(
        `/api/links/${encodeURIComponent(code)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            is_active: !isActive,
            ...(token ? { token } : {}),
          }),
        },
      );
      if (!res.ok) {
        toast.error(res.error || 'Could not update link status');
        return;
      }
      await onSaved();
      toast.success(
        res.is_active ? 'Link reactivated' : 'Link deactivated — scans are paused',
      );
    } catch {
      toast.error('Could not update link status');
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(
        `/api/links/${encodeURIComponent(code)}`,
        {
          method: 'DELETE',
          body: JSON.stringify(token ? { token } : {}),
        },
      );
      if (!res.ok) {
        toast.error(res.error || 'Could not delete link');
        return;
      }
      onDeleted(code);
      toast.success('Link deleted');
      navigate(user ? '/account' : '/');
    } catch {
      toast.error('Could not delete link');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="panel flex flex-col gap-3 p-4">
      <h2 className="flex items-center gap-2 font-display text-lg font-black uppercase">
        <Pencil className="size-4" />
        Change destination
      </h2>
      <p className="text-xs text-muted-foreground">
        Dynamic QR: the printed code stays the same, only where it sends people changes.
      </p>

      <div className="grid gap-1.5">
        <label htmlFor="edit-dest" className="text-sm font-semibold">
          Destination
        </label>
        <input
          id="edit-dest"
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="h-10 w-full rounded-md border-2 border-ink bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="edit-name" className="text-sm font-semibold">
          Name
        </label>
        <input
          id="edit-name"
          type="text"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          className="h-10 w-full rounded-md border-2 border-ink bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <Button type="submit" variant="hero" disabled={saving}>
        {saving && <LoaderCircle className="animate-spin" />}
        Save changes
      </Button>

      <Button
        type="button"
        variant="chunky"
        size="sm"
        disabled={toggling}
        onClick={handleToggleActive}
      >
        {toggling ? (
          <LoaderCircle className="animate-spin" />
        ) : isActive ? (
          <PauseCircle />
        ) : (
          <PlayCircle />
        )}
        {isActive ? 'Deactivate link' : 'Reactivate link'}
      </Button>

      {!confirmDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 />
          Delete link
        </Button>
      ) : (
        <div className="rounded-md border-2 border-destructive bg-background p-3 text-xs">
          <p className="font-semibold text-destructive">
            Delete this link? The QR code will stop working and its stats will be removed.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting && <LoaderCircle className="animate-spin" />}
              Confirm delete
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
