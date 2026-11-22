import { Link } from 'react-router-dom';
import { buttonClasses } from '../components/Button';

export function NotFoundPage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="panel max-w-md p-8 text-center">
        <div className="font-display text-7xl font-black text-foreground">404</div>
        <h1 className="mt-4 font-display text-xl font-black uppercase text-foreground">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you are looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex justify-center">
          <Link to="/" className={buttonClasses('hero', 'default')}>
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}
