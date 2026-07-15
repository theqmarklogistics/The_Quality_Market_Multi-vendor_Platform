// Admin-managed home advertisement slots, served by the web backend's
// GET /api/hero (public, cached server-side). The admin console edits these
// under Admin → Hero, so the mobile home carousel shows the same campaigns
// as the web hero without an app release.
import { apiGet } from './client';

export type HeroMain = {
  slot?: string;
  badgeText: string | null;
  headline: string | null;
  description: string | null;
  startingPrice: string | null;
  cta1Label: string | null;
  cta1Href: string | null;
  cta2Label: string | null;
  cta2Href: string | null;
  imageUrl: string | null;
};

export type HeroCard = {
  slot?: string;
  cardTitle: string | null;
  accentColor: string | null;
  linkLabel: string | null;
  linkHref: string | null;
  imageUrl: string | null;
};

export type HeroConfig = {
  main: HeroMain;
  card1: HeroCard;
  card2: HeroCard;
};

// Mirrors the DEFAULTS in app/api/hero/route.js so the carousel renders
// meaningful ads even before the request resolves (or when offline).
export const HERO_DEFAULTS: HeroConfig = {
  main: {
    badgeText: 'Fast, Tracked Delivery Across Kigali!',
    headline: 'Anything you need. Anyone can sell.',
    description:
      'Shop products of every kind from verified stores across Rwanda — and get them delivered to your door by our own riders, tracked live.',
    startingPrice: null,
    cta1Label: 'Shop now',
    cta1Href: '/shop',
    cta2Label: 'Delivery service',
    cta2Href: '/external',
    imageUrl: null,
  },
  card1: {
    cardTitle: 'Fast, tracked delivery',
    accentColor: '#16A34A',
    linkLabel: 'Book a delivery',
    linkHref: '/external',
    imageUrl: null,
  },
  card2: {
    cardTitle: 'Open your own store',
    accentColor: '#FFAD51',
    linkLabel: 'Start selling',
    linkHref: '/create-store',
    imageUrl: null,
  },
};

export function getHeroConfig(): Promise<HeroConfig> {
  return apiGet<HeroConfig>('/api/hero');
}
