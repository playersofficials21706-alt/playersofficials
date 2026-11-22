import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ImagePlus,
  Palette,
  RotateCcw,
  Shapes,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from './Button';
import {
  buildStyledQrMatrix,
  buildStyledQrSvgMarkup,
  DEFAULT_QR_STYLE,
  isCenterQuietZone,
  isFinderModule,
  QR_COLOR_PRESETS,
  QR_FG_SWATCHES,
  QR_LOGO_ICON_PATHS,
  renderStyledQrPngDataUrl,
  sanitizeQrStyle,
  type QrLogoPreset,
  type QrPatternShape,
  type QrStyleConfig,
} from '../lib/qr';
import { trackTelemetryEvent } from '../lib/storage';
import { useToast } from './Toast';

interface QrPreviewProps {
  value: string;
  fileName: string;
  code?: string;
  dark?: string;
  light?: string;
  shape?: QrPatternShape;
  logoType?: QrLogoPreset;
  customLogoUrl?: string;
  className?: string;
  showDownloads?: boolean;
}

export function QrPreview({
  value,
  fileName,
  code,
  dark = '#1b1f2e',
  light = '#ffffff',
  shape = 'square',
  logoType = 'none',
  customLogoUrl,
  className = '',
  showDownloads = true,
}: QrPreviewProps) {
  const [downloadingPng, setDownloadingPng] = useState(false);

  const style = useMemo(
    () =>
      sanitizeQrStyle({
        fgColor: dark,
        bgColor: light,
        shape,
        logoType,
        customLogoUrl,
      }),
    [dark, light, shape, logoType, customLogoUrl],
  );

  const hasLogo = style.logoType !== 'none';
  const matrix = useMemo(() => buildStyledQrMatrix(value, hasLogo), [value, hasLogo]);
  const margin = 2;

  const triggerDownload = (href: string, ext: 'png' | 'svg') => {
    const a = document.createElement('a');
    a.href = href;
    a.download = `${fileName}.${ext}`;
    a.click();
  };

  const handleDownloadPng = async () => {
    if (!value) return;
    setDownloadingPng(true);
    try {
      const hiResUrl = await renderStyledQrPngDataUrl(value, style, 1024, margin);
      if (!hiResUrl) return;
      triggerDownload(hiResUrl, 'png');
      trackTelemetryEvent('qr_download_png', { code });
    } finally {
      setDownloadingPng(false);
    }
  };

  const handleDownloadSvg = () => {
    if (!value) return;
    const svgMarkup = buildStyledQrSvgMarkup(value, style, margin);
    if (!svgMarkup) return;
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, 'svg');
    trackTelemetryEvent('qr_download_svg', { code });
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const renderPreviewSvg = () => {
    if (!matrix) {
      return <div className="size-full animate-pulse rounded bg-muted" />;
    }

    const { size, grid } = matrix;
    const total = size + margin * 2;
    const boxSize = Math.max(4, Math.floor(size * 0.25));
    const boxStart = (total - boxSize) / 2;
    const pad = boxSize * 0.14;

    return (
      <svg
        viewBox={`0 0 ${total} ${total}`}
        className="size-full rounded"
        role="img"
        aria-label="Generated dynamic QR code"
        shapeRendering="geometricPrecision"
      >
        <rect width={total} height={total} fill={style.bgColor} />

        {grid.map((rowArr, r) =>
          rowArr.map((active, c) => {
            if (!active || isCenterQuietZone(r, c, size, hasLogo)) return null;
            const x = c + margin;
            const y = r + margin;
            const finder = isFinderModule(r, c, size);
            const key = `${r}-${c}`;

            if (finder || style.shape === 'square') {
              const rx = finder && style.shape !== 'square' ? 0.2 : 0;
              return (
                <rect
                  key={key}
                  x={x}
                  y={y}
                  width={1}
                  height={1}
                  rx={rx}
                  ry={rx}
                  fill={style.fgColor}
                />
              );
            }
            if (style.shape === 'rounded') {
              return (
                <rect
                  key={key}
                  x={x + 0.06}
                  y={y + 0.06}
                  width={0.88}
                  height={0.88}
                  rx={0.28}
                  ry={0.28}
                  fill={style.fgColor}
                />
              );
            }
            if (style.shape === 'dots') {
              return (
                <circle
                  key={key}
                  cx={x + 0.5}
                  cy={y + 0.5}
                  r={0.43}
                  fill={style.fgColor}
                />
              );
            }
            return (
              <polygon
                key={key}
                points={`${x + 0.5},${y + 0.04} ${x + 0.96},${y + 0.5} ${x + 0.5},${y + 0.96} ${x + 0.04},${y + 0.5}`}
                fill={style.fgColor}
              />
            );
          }),
        )}

        {hasLogo && (
          <g>
            <rect
              x={boxStart}
              y={boxStart}
              width={boxSize}
              height={boxSize}
              rx={boxSize * 0.22}
              fill={style.bgColor}
              stroke={style.fgColor}
              strokeWidth={Math.max(0.25, boxSize * 0.06)}
            />
            {style.logoType === 'custom' && style.customLogoUrl ? (
              <image
                href={style.customLogoUrl}
                x={boxStart + pad}
                y={boxStart + pad}
                width={boxSize - pad * 2}
                height={boxSize - pad * 2}
                preserveAspectRatio="xMidYMid meet"
              />
            ) : style.logoType !== 'none' && style.logoType !== 'custom' ? (
              (() => {
                const iconDef = QR_LOGO_ICON_PATHS[style.logoType];
                const iconArea = boxSize - pad * 2.2;
                const scale = iconArea / 24;
                const tx = boxStart + (boxSize - iconArea) / 2;
                const ty = boxStart + (boxSize - iconArea) / 2;
                return (
                  <g
                    transform={`translate(${tx},${ty}) scale(${scale})`}
                    fill={style.fgColor}
                  >
                    {iconDef.paths.map((d, idx) => (
                      <path key={idx} d={d} />
                    ))}
                  </g>
                );
              })()
            ) : null}
          </g>
        )}
      </svg>
    );
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="aspect-square w-full overflow-hidden rounded-lg border-2 border-ink bg-card p-2 shadow-hard-sm">
        {renderPreviewSvg()}
      </div>
      {showDownloads && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="chunky"
            size="sm"
            onClick={handleDownloadPng}
            disabled={!matrix || downloadingPng}
          >
            <Download />
            PNG
          </Button>
          <Button
            variant="chunky"
            size="sm"
            onClick={handleDownloadSvg}
            disabled={!matrix}
          >
            <Download />
            SVG
          </Button>
        </div>
      )}
    </div>
  );
}

const SHAPE_OPTIONS: Array<{ value: QrPatternShape; label: string }> = [
  { value: 'square', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'dots', label: 'Dots' },
  { value: 'diamond', label: 'Diamond' },
];

const BG_OPTIONS: Array<{ label: string; color: string }> = [
  { label: 'White', color: '#ffffff' },
  { label: 'Volt', color: '#e4f75a' },
  { label: 'Cream', color: '#fff8ec' },
];

export function QrStylingPanel({
  style,
  onChange,
}: {
  style: QrStyleConfig;
  onChange: (next: QrStyleConfig) => void;
}) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Upload a PNG, JPG, or WebP logo image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo image must be under 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      const img = new Image();
      img.onload = () => {
        const maxSide = 192;
        const canvas = document.createElement('canvas');
        canvas.width = maxSide;
        canvas.height = maxSide;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, maxSide, maxSide);

        const ratio = Math.min(maxSide / img.width, maxSide / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        ctx.drawImage(img, (maxSide - w) / 2, (maxSide - h) / 2, w, h);

        const normalizedUrl = canvas.toDataURL('image/png');
        onChange({
          ...style,
          logoType: 'custom',
          customLogoUrl: normalizedUrl,
        });
        toast.success('Center logo added');
      };
      img.onerror = () => toast.error('Could not read logo image');
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const isDefault =
    style.fgColor === DEFAULT_QR_STYLE.fgColor &&
    style.bgColor === DEFAULT_QR_STYLE.bgColor &&
    style.shape === DEFAULT_QR_STYLE.shape &&
    style.logoType === 'none';

  return (
    <div className="mt-4 flex flex-col gap-3.5 border-t-2 border-muted pt-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-foreground">
          <Sparkles className="size-3.5 text-primary" />
          QR styling
        </span>
        {!isDefault && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_QR_STYLE)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
        )}
      </div>

      {/* Foreground Color */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase text-muted-foreground">
          <span className="flex items-center gap-1">
            <Palette className="size-3" />
            Foreground color
          </span>
          <span className="font-mono text-[11px] text-foreground">{style.fgColor}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {QR_FG_SWATCHES.map((swatch) => {
            const active = style.fgColor.toLowerCase() === swatch.color.toLowerCase();
            return (
              <button
                key={swatch.color}
                type="button"
                title={swatch.label}
                aria-label={`Foreground color ${swatch.label}`}
                aria-pressed={active}
                onClick={() => onChange({ ...style, fgColor: swatch.color })}
                className={`size-7 rounded-md border-2 border-ink cursor-pointer transition-transform ${
                  active ? 'scale-105 ring-2 ring-ring shadow-hard-sm' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: swatch.color }}
              />
            );
          })}

          <label
            className="inline-flex h-7 items-center gap-1.5 rounded-md border-2 border-ink bg-background px-2 text-xs font-semibold cursor-pointer hover:bg-accent"
            title="Pick custom foreground color"
          >
            <input
              type="color"
              value={style.fgColor}
              onChange={(e) => onChange({ ...style, fgColor: e.target.value })}
              aria-label="Custom foreground color picker"
              className="size-4 cursor-pointer border-0 bg-transparent p-0"
            />
            Custom
          </label>
        </div>

        {/* Quick Background Swatches */}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">Bg:</span>
          {BG_OPTIONS.map((bg) => {
            const active = style.bgColor.toLowerCase() === bg.color.toLowerCase();
            return (
              <button
                key={bg.label}
                type="button"
                onClick={() => onChange({ ...style, bgColor: bg.color })}
                className={`inline-flex items-center gap-1 rounded border-2 border-ink px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer ${
                  active ? 'bg-ink text-ink-foreground' : 'bg-card hover:bg-accent'
                }`}
              >
                <span
                  className="size-2.5 rounded-xs border border-ink"
                  style={{ backgroundColor: bg.color }}
                />
                {bg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pattern Shape */}
      <div>
        <div className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase text-muted-foreground">
          <Shapes className="size-3" />
          Pattern shape
        </div>
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="QR pattern shape">
          {SHAPE_OPTIONS.map((opt) => {
            const active = style.shape === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange({ ...style, shape: opt.value })}
                className={`flex flex-col items-center gap-1 rounded-md border-2 border-ink px-1.5 py-1.5 text-[11px] font-bold cursor-pointer transition-all ${
                  active
                    ? 'bg-volt text-volt-foreground shadow-hard-sm'
                    : 'bg-card hover:bg-accent'
                }`}
              >
                <ShapeThumb shape={opt.value} />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Center Logo / Icon */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase text-muted-foreground">
          <span>Center logo / icon</span>
          {style.logoType !== 'none' && (
            <button
              type="button"
              onClick={() =>
                onChange({ ...style, logoType: 'none', customLogoUrl: undefined })
              }
              className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-destructive hover:underline cursor-pointer"
            >
              <X className="size-3" />
              Remove
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onChange({ ...style, logoType: 'none' })}
            className={`rounded-md border-2 border-ink px-2 py-1 text-xs font-semibold cursor-pointer ${
              style.logoType === 'none'
                ? 'bg-ink text-ink-foreground'
                : 'bg-card hover:bg-accent'
            }`}
          >
            None
          </button>

          {(
            Object.entries(QR_LOGO_ICON_PATHS) as Array<
              [Exclude<QrLogoPreset, 'none' | 'custom'>, { label: string; paths: string[] }]
            >
          ).map(([key, def]) => {
            const active = style.logoType === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange({ ...style, logoType: key })}
                className={`inline-flex items-center gap-1 rounded-md border-2 border-ink px-2 py-1 text-xs font-semibold cursor-pointer ${
                  active ? 'bg-ink text-ink-foreground' : 'bg-card hover:bg-accent'
                }`}
              >
                <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden="true">
                  {def.paths.map((d, idx) => (
                    <path key={idx} d={d} />
                  ))}
                </svg>
                {def.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`inline-flex items-center gap-1 rounded-md border-2 border-ink px-2 py-1 text-xs font-semibold cursor-pointer ${
              style.logoType === 'custom'
                ? 'bg-volt text-volt-foreground shadow-hard-sm'
                : 'bg-card hover:bg-accent'
            }`}
          >
            <ImagePlus className="size-3.5" />
            {style.customLogoUrl ? 'Change logo' : 'Upload logo'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleUploadLogo}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
}

function ShapeThumb({ shape }: { shape: QrPatternShape }) {
  return (
    <svg viewBox="0 0 20 20" className="size-4 fill-current" aria-hidden="true">
      {shape === 'square' && (
        <>
          <rect x="2" y="2" width="7" height="7" />
          <rect x="11" y="2" width="7" height="7" />
          <rect x="2" y="11" width="7" height="7" />
          <rect x="11" y="11" width="7" height="7" />
        </>
      )}
      {shape === 'rounded' && (
        <>
          <rect x="2" y="2" width="7" height="7" rx="2.2" />
          <rect x="11" y="2" width="7" height="7" rx="2.2" />
          <rect x="2" y="11" width="7" height="7" rx="2.2" />
          <rect x="11" y="11" width="7" height="7" rx="2.2" />
        </>
      )}
      {shape === 'dots' && (
        <>
          <circle cx="5.5" cy="5.5" r="3.2" />
          <circle cx="14.5" cy="5.5" r="3.2" />
          <circle cx="5.5" cy="14.5" r="3.2" />
          <circle cx="14.5" cy="14.5" r="3.2" />
        </>
      )}
      {shape === 'diamond' && (
        <>
          <polygon points="5.5,2 9,5.5 5.5,9 2,5.5" />
          <polygon points="14.5,2 18,5.5 14.5,9 11,5.5" />
          <polygon points="5.5,11 9,14.5 5.5,18 2,14.5" />
          <polygon points="14.5,11 18,14.5 14.5,18 11,14.5" />
        </>
      )}
    </svg>
  );
}

export function QrColorPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="QR colors">
      {QR_COLOR_PRESETS.map((preset, idx) => {
        const active = value === idx;
        return (
          <button
            key={preset.name}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(idx)}
            className={`flex items-center gap-1.5 rounded-md border-2 border-ink px-2 py-1 text-xs font-semibold cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              active ? 'bg-ink text-ink-foreground' : 'bg-card hover:bg-accent'
            }`}
          >
            <span className="flex overflow-hidden rounded-sm border border-ink">
              <span className="size-3" style={{ backgroundColor: preset.dark }} />
              <span className="size-3" style={{ backgroundColor: preset.light }} />
            </span>
            {preset.name}
          </button>
        );
      })}
    </div>
  );
}

export function CopyLinkButton({
  value,
  label = 'Copy',
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      setCopied(true);
      toast.success('Link copied');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      try {
        const el = document.createElement('textarea');
        el.value = value;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        const copiedOk = document.execCommand('copy');
        document.body.removeChild(el);
        if (!copiedOk) throw new Error('Fallback copy failed');
        setCopied(true);
        toast.success('Link copied');
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        toast.error("Couldn't copy — select the link and copy it manually.");
      }
    }
  };

  return (
    <Button variant="ink" size="sm" onClick={handleCopy}>
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : label}
    </Button>
  );
}
