// Shared design tokens for The Quality Market mobile app.
// Mirrors the web app's brand: Outfit type, slate neutrals, green-600 accent,
// dark slate purchase CTAs, soft green tints, rounded-2xl surfaces.

// Raw brand scales (Tailwind slate + green, as used across the web app).
export const palette = {
  white: '#ffffff',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',
  green50: '#f0fdf4',
  green100: '#dcfce7',
  green200: '#bbf7d0',
  green400: '#4ade80',
  green600: '#16a34a',
  green700: '#15803d',
  green800: '#166534',
  red50: '#fef2f2',
  red100: '#fee2e2',
  red600: '#dc2626',
  red700: '#b91c1c',
  amber50: '#fffbeb',
  amber100: '#fef3c7',
  amber600: '#d97706',
  amber700: '#b45309',
  blue50: '#eff6ff',
  blue100: '#dbeafe',
  blue600: '#2563eb',
  blue700: '#1d4ed8',
};

export const colors = {
  // Neutrals
  text: palette.slate900,
  body: palette.slate700,
  muted: palette.slate500,
  subtle: palette.slate400,
  border: palette.slate200,
  borderLight: palette.slate100,
  card: palette.slate50, // soft surface / image placeholder background
  surface: palette.white,
  bg: palette.white,
  screen: palette.slate50, // page background behind white cards

  // Brand accent (links, active states, highlights) — web's green-600
  primary: palette.green600,
  primaryDark: palette.green700,
  primarySoft: palette.green50,
  primaryTint: palette.green100,
  primaryBorder: palette.green200,
  primaryText: palette.white,

  // Dark purchase CTA (web's bg-slate-800/900 buttons)
  ink: palette.slate900,
  inkPress: palette.slate800,
  onInk: palette.white,

  // Status
  success: palette.green600,
  successDeep: palette.green700,
  successSoft: palette.green100,
  successBg: palette.green50,
  danger: palette.red600,
  dangerDeep: palette.red700,
  dangerSoft: palette.red100,
  dangerBg: palette.red50,
  warning: palette.amber600,
  warningDeep: palette.amber700,
  warningSoft: palette.amber100,
  warningBg: palette.amber50,
  info: palette.blue600,
  infoDeep: palette.blue700,
  infoSoft: palette.blue100,
  infoBg: palette.blue50,

  // Ratings — the web fills stars with brand green, empty with gray-300
  star: palette.green600,
  starEmpty: '#d1d5db',
};

// Outfit — the same Google Font the web app loads via next/font.
// Loaded in app/_layout.tsx with expo-font; use these names in fontFamily.
export const fonts = {
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

// Elevation presets tuned to the web's soft slate shadows
// (shadow-[0_10px_30px_rgba(15,23,42,0.06)] on cards).
export const shadows = {
  card: {
    shadowColor: palette.slate900,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  raised: {
    shadowColor: palette.slate900,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
  // For the sticky footer bars that sit above content.
  footer: {
    shadowColor: palette.slate900,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 10,
  },
};
