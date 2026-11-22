import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Check, AlertCircle, X } from 'lucide-react';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  success: () => {},
  error: () => {},
});

let nextToastId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, type: 'success' | 'error') => {
    const id = nextToastId++;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3400);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const success = useCallback((msg: string) => push(msg, 'success'), [push]);
  const error = useCallback((msg: string) => push(msg, 'error'), [push]);
  const value = useMemo<ToastContextValue>(() => ({ success, error }), [success, error]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-center gap-2.5 rounded-lg border-2 border-ink px-3.5 py-2.5 text-sm font-semibold shadow-hard animate-rise ${
              item.type === 'error'
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-card text-foreground'
            }`}
          >
            {item.type === 'error' ? (
              <AlertCircle className="size-4 shrink-0" />
            ) : (
              <span className="grid size-5 shrink-0 place-items-center rounded border border-ink bg-volt text-volt-foreground">
                <Check className="size-3.5" />
              </span>
            )}
            <span className="flex-1">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="rounded p-0.5 opacity-70 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
