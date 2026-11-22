import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LoaderCircle, MailCheck } from 'lucide-react';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { apiFetch, readSavedLinks, type AuthUser } from '../lib/storage';

interface AuthPageProps {
  onAuthenticated: (user: AuthUser, sessionToken?: string | null) => void;
}

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const paramMode = searchParams.get('mode');
  const initialMode = paramMode === 'signup' ? 'signup' : 'login';
  const redirectTarget = searchParams.get('redirect') || '/account';

  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (paramMode === 'signup') setMode('signup');
    else if (paramMode === 'login' || paramMode === 'signin') setMode('login');
  }, [paramMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'reset') {
        const res = await apiFetch<{ ok: boolean; error?: string }>(
          '/api/auth/reset-password',
          {
            method: 'POST',
            body: JSON.stringify({ email }),
          },
        );
        if (!res.ok) {
          setError(res.error || 'Could not send reset link');
          return;
        }
        setResetSent(true);
        return;
      }

      const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const res = await apiFetch<{
        ok: boolean;
        user?: AuthUser;
        sessionToken?: string | null;
        error?: string;
      }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          deviceLinks: readSavedLinks(),
        }),
      });

      if (!res.ok || !res.user) {
        setError(res.error || 'Invalid login credentials');
        return;
      }

      onAuthenticated(res.user, res.sessionToken);
      toast.success(mode === 'signup' ? 'Account created' : 'Logged in');
      navigate(redirectTarget.startsWith('/') ? redirectTarget : '/account');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (resetSent) {
    return (
      <main className="mx-auto flex max-w-md flex-col px-4 py-12">
        <div className="panel p-6 shadow-hard-lg animate-rise">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <MailCheck className="size-10 text-primary" />
            <h1 className="font-display text-2xl font-black uppercase">Check your inbox</h1>
            <p className="text-sm text-muted-foreground">
              If an account exists for <span className="font-mono text-foreground">{email}</span>,
              we sent you a link to set a new password.
            </p>
            <Button
              variant="ink"
              className="mt-2"
              onClick={() => {
                setResetSent(false);
                setMode('login');
              }}
            >
              Back to login
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col px-4 py-12">
      <div className="panel p-6 shadow-hard-lg animate-rise">
        {mode !== 'reset' && (
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg border-2 border-ink bg-muted p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`rounded-md py-2 text-sm font-bold uppercase transition-all cursor-pointer ${
                mode === 'login' ? 'bg-ink text-ink-foreground' : 'text-foreground'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`rounded-md py-2 text-sm font-bold uppercase transition-all cursor-pointer ${
                mode === 'signup' ? 'bg-ink text-ink-foreground' : 'text-foreground'
              }`}
            >
              Sign up
            </button>
          </div>
        )}

        <h1 className="font-display text-2xl font-black uppercase">
          {mode === 'login'
            ? 'Login'
            : mode === 'signup'
              ? 'Create your account'
              : 'Reset password'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'reset'
            ? 'Enter your email and we will send you a password reset link.'
            : 'Keep all your QR codes and scan stats saved privately to your account.'}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="auth-email" className="text-sm font-semibold">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-md border-2 border-ink bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {mode !== 'reset' && (
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="auth-password" className="text-sm font-semibold">
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('reset');
                      setError(null);
                    }}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-md border-2 border-ink bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {error && (
            <p className="rounded-md border-2 border-destructive bg-card px-3 py-2 text-sm font-semibold text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" variant="hero" size="xl" disabled={submitting}>
            {submitting && <LoaderCircle className="animate-spin" />}
            {mode === 'login'
              ? 'Login'
              : mode === 'signup'
                ? 'Sign up'
                : 'Send reset link'}
          </Button>

          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className="text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Back to login
            </button>
          )}
        </form>

        {mode !== 'reset' && (
          <div className="mt-5 border-t-2 border-muted pt-4 text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>
                New here?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                  }}
                  className="font-bold text-primary hover:underline cursor-pointer"
                >
                  Sign up to create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className="font-bold text-primary hover:underline cursor-pointer"
                >
                  Login here
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
