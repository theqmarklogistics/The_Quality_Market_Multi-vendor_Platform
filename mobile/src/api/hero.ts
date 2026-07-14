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
    headline: "Gadgets you'll love. Prices you'll trust.",
    description:
      'Discover hand-picked electronics, practical accessories, and store-approved finds built for everyday use and long-term value.',
    startingPrice: '4.9K',
    cta1Label: 'Shop now',
    cta1Href: '/shop',
    cta2Label: 'Open a store',
    cta2Href: '/create-store',
    imageUrl: null,
  },
  card1: {
    cardTitle: 'Best products',
    accentColor: '#FFAD51',
    linkLabel: 'View more',
    linkHref: '/shop',
    imageUrl: null,
  },
  card2: {
    cardTitle: '20% discounts',
    accentColor: '#78B2FF',
    linkLabel: 'View more',
    linkHref: '/shop',
    imageUrl: null,
  },
};

export function getHeroConfig(): Promise<HeroConfig> {
  return apiGet<HeroConfig>('/api/hero');
}
