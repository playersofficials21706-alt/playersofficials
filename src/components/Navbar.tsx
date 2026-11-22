import { Link } from 'react-router-dom';
import { QrCode, ShieldCheck, UserRound } from 'lucide-react';
import { buttonClasses } from './Button';
import type { AuthUser } from '../lib/storage';

interface NavbarProps {
  user: AuthUser | null;
  authReady: boolean;
}

export function Navbar({ user, authReady }: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-ink bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <span className="grid size-9 place-items-center rounded-lg border-2 border-ink bg-volt shadow-hard-sm">
            <QrCode className="size-5" aria-hidden="true" />
          </span>
          <span className="font-display text-lg font-black uppercase sm:text-xl">
            Players<span className="text-primary">QR</span>
          </span>
        </Link>

        <nav className="flex items-center gap-3 text-sm font-semibold">
          <Link
            to="/#create"
            className="hidden rounded-md px-3 py-2 whitespace-nowrap shrink-0 hover:bg-accent sm:inline-block"
          >
            Create
          </Link>
          <Link
            to="/#my-links"
            className="hidden rounded-md px-3 py-2 whitespace-nowrap shrink-0 hover:bg-accent sm:inline-block"
          >
            My links
          </Link>
          {!authReady ? (
            <span className="h-8 w-32" />
          ) : user ? (
            <div className="flex items-center gap-2 shrink-0">
              {user.isAdmin && (
                <Link to="/admin" className={buttonClasses('hero', 'sm')}>
                  <ShieldCheck className="size-3.5" />
                  Admin
                </Link>
              )}
              <Link to="/account" className={buttonClasses('chunky', 'sm')}>
                <UserRound className="size-3.5" />
                My account
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <Link to="/auth?mode=login" className={buttonClasses('chunky', 'sm')}>
                Login
              </Link>
              <Link to="/auth?mode=signup" className={buttonClasses('ink', 'sm')}>
                Sign up
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
