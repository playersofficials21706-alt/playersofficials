import React from 'react';

export type ButtonVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link'
  | 'hero'
  | 'ink'
  | 'chunky';

export type ButtonSize = 'default' | 'sm' | 'lg' | 'xl' | 'icon';

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-md text-sm font-medium cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

const VARIANTS: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
  destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
  outline:
    'border-2 border-ink bg-background hover:bg-accent hover:text-accent-foreground',
  secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
  hero: 'bg-volt text-volt-foreground border-2 border-ink shadow-hard font-bold uppercase tracking-wide hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard-lg active:translate-x-1 active:translate-y-1 active:shadow-none',
  ink: 'bg-ink text-ink-foreground border-2 border-ink shadow-hard-sm font-semibold hover:bg-primary hover:border-ink active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
  chunky:
    'bg-card text-foreground border-2 border-ink shadow-hard-sm font-semibold hover:bg-accent active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
};

const SIZES: Record<ButtonSize, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
  lg: 'h-10 rounded-md px-8',
  xl: 'h-12 rounded-lg px-6 text-base',
  icon: 'h-9 w-9',
};

export function buttonClasses(
  variant: ButtonVariant = 'default',
  size: ButtonSize = 'default',
  className = '',
): string {
  return [BASE, VARIANTS[variant], SIZES[size], className].filter(Boolean).join(' ');
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'default',
  size = 'default',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      {...props}
    />
  );
}
