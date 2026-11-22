import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const OG_IMAGE_PATH = '/src/assets/images/playersqr_og_card_1795331794890.jpg';

interface RouteSeoMeta {
  title: string;
  description: string;
  robots: string;
}

function getRouteSeo(pathname: string, search: string): RouteSeoMeta {
  if (pathname === '/') {
    return {
      title: 'PlayersQR – Dynamic QR Codes & Short Links',
      description:
        'Create custom dynamic QR codes and /playerqr/ short links, edit destinations anytime, style your QR, and track every live scan.',
      robots: 'index, follow, max-image-preview:large',
    };
  }

  if (pathname === '/auth') {
    const mode = new URLSearchParams(search).get('mode');
    if (mode === 'signup') {
      return {
        title: 'Sign Up Free – PlayersQR Dynamic QR Studio',
        description:
          'Create a free PlayersQR account to manage dynamic QR codes, custom /playerqr/ short links, vanity domains, and 30-day scan analytics.',
        robots: 'index, follow',
      };
    }
    return {
      title: 'Login – PlayersQR Dynamic QR Studio',
      description:
        'Login to your PlayersQR account to edit dynamic QR destinations, customize QR code colors and logos, and inspect live scan reports.',
      robots: 'index, follow',
    };
  }

  if (pathname === '/account') {
    return {
      title: 'Account & Vanity Domain – PlayersQR',
      description:
        'Manage your PlayersQR account, connect a custom vanity domain, and keep your dynamic QR codes organized.',
      robots: 'noindex, nofollow',
    };
  }

  if (pathname === '/admin') {
    return {
      title: 'Admin Dashboard – PlayersQR',
      description: 'Administrator console for PlayersQR.',
      robots: 'noindex, nofollow',
    };
  }

  if (
    pathname.startsWith('/links/') ||
    pathname.startsWith('/playerqr/') ||
    pathname.startsWith('/r/')
  ) {
    return {
      title: 'QR Analytics & Studio – PlayersQR',
      description:
        'View 30-day QR scan analytics, customize colors and pattern shapes, and manage your dynamic /playerqr/ link destination.',
      robots: 'noindex, nofollow',
    };
  }

  return {
    title: 'Page Not Found – PlayersQR',
    description:
      'Create custom dynamic QR codes and /playerqr/ short links, edit destinations anytime, and track every live scan.',
    robots: 'noindex, nofollow',
  };
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

export function SeoHead() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const origin = window.location.origin;
    const canonicalUrl = `${origin}${pathname}`;
    const absoluteOgImage = `${origin}${OG_IMAGE_PATH}`;
    const meta = getRouteSeo(pathname, search);

    document.title = meta.title;
    upsertMeta('name', 'description', meta.description);
    upsertMeta('name', 'robots', meta.robots);
    upsertCanonical(canonicalUrl);

    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:title', meta.title);
    upsertMeta('property', 'og:description', meta.description);
    upsertMeta('property', 'og:image', absoluteOgImage);

    upsertMeta('name', 'twitter:title', meta.title);
    upsertMeta('name', 'twitter:description', meta.description);
    upsertMeta('name', 'twitter:image', absoluteOgImage);

    const jsonLdEl = document.getElementById('playersqr-jsonld');
    if (jsonLdEl && jsonLdEl.textContent) {
      try {
        const parsed = JSON.parse(jsonLdEl.textContent) as Record<string, unknown>;
        parsed.url = origin;
        jsonLdEl.textContent = JSON.stringify(parsed);
      } catch {
        // Ignore malformed inline JSON-LD
      }
    }
  }, [pathname, search]);

  return null;
}
