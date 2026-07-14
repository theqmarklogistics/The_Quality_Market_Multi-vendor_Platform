// Home: the service landing for The Quality Market.
// - Auto-rotating advertisement carousel fed by the admin-managed /api/hero
//   slots (same campaigns as the web hero — editable without an app release).
// - Explicit service sections with branded illustrations: Shop the market,
//   Delivery service (riders + trucks), and Open your store (sellers).
// - "Popular right now" product rail deep-linking into the Shop tab.
// The product grid itself lives on the Shop tab (app/(tabs)/shop.tsx).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getBestSelling } from '@/api/products';
import { getHeroConfig, HERO_DEFAULTS, type HeroCard, type HeroConfig, type HeroMain } from '@/api/hero';
import type { Product } from '@/api/types';
import { ProductCard } from '@/components/ProductCard';
import { BrandLogo } from '@/components/BrandLogo';
import { BrandArt } from '@/components/BrandArt';
import { Button, SectionTitle } from '@/components/ui';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

const AD_INTERVAL_MS = 5000;
const AD_HEIGHT = 240;

type AdSlide =
  | { key: string; kind: 'main'; main: HeroMain }
  | {
      key: string;
      kind: 'card';
      card: HeroCard;
      fallbackIcon: keyof typeof MaterialCommunityIcons.glyphMap;
    };

export default function HomeScreen() {
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const slideW = winW - spacing.lg * 2;
  const slideStep = slideW + spacing.md;

  const [hero, setHero] = useState<HeroConfig>(HERO_DEFAULTS);
  const [bestSellers, setBestSellers] = useState<Product[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [heroRes, bestRes] = await Promise.allSettled([getHeroConfig(), getBestSelling(8)]);
    if (heroRes.status === 'fulfilled') setHero(heroRes.value);
    if (bestRes.status === 'fulfilled') setBestSellers(bestRes.value.products ?? []);
    // On failure the built-in defaults / empty rail keep the screen useful.
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Map the admin-configured web hrefs onto native destinations.
  const openWebHref = useCallback(
    (href: string | null | undefined, title = 'The Quality Market') => {
      if (!href) return;
      if (href.startsWith('/shop')) {
        router.push('/(tabs)/shop');
      } else if (href === '/external/new') {
        router.push('/external/book');
      } else if (href.startsWith('/external')) {
        router.push('/external');
      } else if (href === '/create-store') {
        router.push({ pathname: '/web-dashboard', params: { path: '/create-store', title: 'Create your store' } });
      } else {
        router.push({ pathname: '/web-dashboard', params: { path: href, title } });
      }
    },
    [router],
  );

  const slides = useMemo<AdSlide[]>(
    () => [
      { key: 'main', kind: 'main', main: hero.main },
      { key: 'card1', kind: 'card', card: hero.card1, fallbackIcon: 'shopping-outline' },
      { key: 'card2', kind: 'card', card: hero.card2, fallbackIcon: 'sale' },
    ],
    [hero],
  );

  // ---- Carousel autoplay (paused while dragging, disabled with reduce-motion) ----
  const adListRef = useRef<FlatList<AdSlide>>(null);
  const adIndexRef = useRef(0);
  const adPausedRef = useRef(false);
  const [adIndex, setAdIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setInterval(() => {
      if (adPausedRef.current) return;
      const next = (adIndexRef.current + 1) % slides.length;
      adListRef.current?.scrollToOffset({ offset: next * slideStep, animated: true });
    }, AD_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [reduceMotion, slides.length, slideStep]);

  const onAdScrollEnd = useCallback(
    (offsetX: number) => {
      const idx = Math.min(slides.length - 1, Math.max(0, Math.round(offsetX / slideStep)));
      adIndexRef.current = idx;
      setAdIndex(idx);
      adPausedRef.current = false;
    },
    [slides.length, slideStep],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Brand header + messages shortcut (Messages left the tab bar for Shop) */}
        <View style={styles.brandRow}>
          <BrandLogo direction="row" size={32} gap={8} showWordmark wordmarkSize={21} />
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push('/(tabs)/chat')}
            accessibilityRole="button"
            accessibilityLabel="Messages"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* ---- Top CTAs: the two things you can do here, in one line each ---- */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(tabs)/shop')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Start shopping"
          >
            <View style={styles.quickIcon}>
              <Ionicons name="bag-handle" size={18} color={colors.primaryDark} />
            </View>
            <Text style={styles.quickTitle}>Shop</Text>
            <Text style={styles.quickDesc}>Buy anything from verified stores — delivered to you.</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickCard, styles.quickCardBrand]}
            onPress={() => router.push('/external/book')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Book a delivery"
          >
            <View style={styles.quickIcon}>
              <MaterialCommunityIcons name="truck-fast" size={18} color={colors.primaryDark} />
            </View>
            <Text style={styles.quickTitle}>Delivery</Text>
            <Text style={styles.quickDesc}>Send your own package across Kigali with our riders.</Text>
          </TouchableOpacity>
        </View>

        {/* ---- Advertisement carousel (admin-managed hero slots) ---- */}
        <FlatList
          ref={adListRef}
          data={slides}
          keyExtractor={(s) => s.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={slideStep}
          decelerationRate="fast"
          contentContainerStyle={styles.adRail}
          onScrollBeginDrag={() => {
            adPausedRef.current = true;
          }}
          onMomentumScrollEnd={(e) => onAdScrollEnd(e.nativeEvent.contentOffset.x)}
          renderItem={({ item }) =>
            item.kind === 'main' ? (
              <MainAd main={item.main} width={slideW} onCta={openWebHref} />
            ) : (
              <CardAd card={item.card} width={slideW} fallbackIcon={item.fallbackIcon} onPress={openWebHref} />
            )
          }
        />
        <View style={styles.dotsRow} accessibilityLabel={`Ad ${adIndex + 1} of ${slides.length}`}>
          {slides.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === adIndex && styles.dotActive]} />
          ))}
        </View>

        {/* ---- Services ---- */}
        <Text style={styles.kicker}>OUR SERVICES</Text>
        <Text style={styles.servicesTitle}>One app for shopping, delivery & selling</Text>

        {/* 1 — Shop the market */}
        <View style={styles.serviceCard}>
          <View style={styles.serviceHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.serviceTag}>ANYTHING, FROM ANY STORE</Text>
              <Text style={styles.serviceTitle}>Shop the market</Text>
            </View>
            <BrandArt variant="bags" size={92} />
          </View>
          <Text style={styles.serviceDesc}>
            Shop products of every kind — electronics, groceries, fashion and more. Every seller
            is verified by our staff, and every order is delivered by our own riders, tracked
            live from checkout to your door.
          </Text>
          <Bullet text="Store-approved products at honest prices" />
          <Bullet text="Pay with MTN MoMo or bank transfer" />
          <Bullet text="Shipping calculated and paid at checkout — no surprises" />
          <View style={styles.serviceActions}>
            <Button
              label="Start shopping"
              icon="bag-handle-outline"
              size="md"
              onPress={() => router.push('/(tabs)/shop')}
            />
          </View>
        </View>

        {/* 2 — Delivery service */}
        <View style={[styles.serviceCard, styles.serviceCardBrand]}>
          <View style={styles.serviceHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.serviceTag}>SEND ANYTHING ACROSS KIGALI</Text>
              <Text style={styles.serviceTitle}>Delivery service</Text>
            </View>
            <BrandArt variant="motorbike" size={92} />
          </View>
          <Text style={styles.serviceDesc}>
            Not just for our shop — book our riders and trucks for your own packages. Your client
            shares their live location through a link, that pin sets the exact delivery fee, and
            you both track the drop in real time.
          </Text>
          <View style={styles.stepsRow}>
            <Step icon="package-variant-closed" label={'Book in\nminutes'} />
            <StepArrow />
            <Step icon="truck-fast" label={'Shared rider &\ntruck routes'} />
            <StepArrow />
            <Step icon="map-marker-radius" label={'Live GPS\ntracking'} />
          </View>
          <Bullet text="Pay by MoMo — delivery documents issued by our staff" />
          <Bullet text="Scheduled departures on every corridor, every day" />
          <View style={styles.serviceActions}>
            <Button
              label="Book a delivery"
              icon="cube-outline"
              variant="brand"
              size="md"
              onPress={() => router.push('/external/book')}
            />
            <Button
              label="See departure times"
              icon="time-outline"
              variant="ghost"
              size="md"
              onPress={() => router.push('/schedule')}
            />
          </View>
        </View>

        {/* 3 — Open your store */}
        <View style={styles.serviceCard}>
          <View style={styles.serviceHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.serviceTag}>FOR SELLERS</Text>
              <Text style={styles.serviceTitle}>Open your store</Text>
            </View>
            <BrandArt variant="storefront" size={92} />
          </View>
          <Text style={styles.serviceDesc}>
            Anyone can sell anything here — all you need is a store. Choose Local Seller — you
            pack and ship your own orders — or Full Managed, where our warehouse stores, packs
            and delivers for you.
          </Text>
          <Bullet text="Quick application, reviewed by our staff" />
          <Bullet text="Manage products, orders and payouts in the seller console" />
          <Bullet text="Chat with your buyers right inside the app" />
          <View style={styles.serviceActions}>
            <Button
              label="Create your store"
              icon="storefront-outline"
              size="md"
              onPress={() =>
                router.push({
                  pathname: '/web-dashboard',
                  params: { path: '/create-store', title: 'Create your store' },
                })
              }
            />
          </View>
        </View>

        {/* ---- Popular right now ---- */}
        {bestSellers.length > 0 ? (
          <View style={styles.popularWrap}>
            <SectionTitle
              title="Popular right now"
              action="See all"
              onAction={() => router.push('/(tabs)/shop')}
              style={{ marginBottom: spacing.sm }}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.popularRail}
            >
              {bestSellers.map((p) => (
                <View key={p.id} style={styles.popularCard}>
                  <ProductCard product={p} />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Trust strip */}
        <View style={styles.trustRow}>
          <Trust icon="shield-checkmark-outline" label="Verified sellers" />
          <Trust icon="wallet-outline" label="MoMo & bank" />
          <Trust icon="navigate-outline" label="Live tracking" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- Advertisement slides ---------- */

function MainAd({
  main,
  width,
  onCta,
}: {
  main: HeroMain;
  width: number;
  onCta: (href: string | null | undefined, title?: string) => void;
}) {
  return (
    <View style={[styles.mainAd, { width }]}>
      {/* Decorative brand circles */}
      <View style={styles.mainAdCircleLg} />
      <View style={styles.mainAdCircleSm} />
      {main.badgeText ? (
        <View style={styles.adBadge}>
          <Ionicons name="flash" size={12} color={colors.primaryDark} />
          <Text style={styles.adBadgeText} numberOfLines={1}>
            {main.badgeText}
          </Text>
        </View>
      ) : null}
      <Text style={styles.adHeadline} numberOfLines={2}>
        {main.headline}
      </Text>
      <Text style={styles.adDesc} numberOfLines={3}>
        {main.description}
      </Text>
      <View style={styles.adBottomRow}>
        <View style={{ flex: 1 }}>
          {main.startingPrice ? (
            <>
              <Text style={styles.adPriceLabel}>Starts from</Text>
              <Text style={styles.adPrice}>RWF {main.startingPrice}</Text>
            </>
          ) : null}
        </View>
        {main.imageUrl ? (
          <Image source={{ uri: main.imageUrl }} alt="Featured product" style={styles.adImage} resizeMode="contain" />
        ) : null}
      </View>
      <View style={styles.adCtaRow}>
        {main.cta1Label && main.cta1Href ? (
          <TouchableOpacity
            style={styles.adCtaDark}
            onPress={() => onCta(main.cta1Href, main.cta1Label ?? undefined)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.adCtaDarkText}>{main.cta1Label}</Text>
            <Ionicons name="bag-handle-outline" size={14} color={colors.onInk} />
          </TouchableOpacity>
        ) : null}
        {main.cta2Label && main.cta2Href ? (
          <TouchableOpacity
            style={styles.adCtaLight}
            onPress={() => onCta(main.cta2Href, main.cta2Label ?? undefined)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.adCtaLightText}>{main.cta2Label}</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.text} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function CardAd({
  card,
  width,
  fallbackIcon,
  onPress,
}: {
  card: HeroCard;
  width: number;
  fallbackIcon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: (href: string | null | undefined, title?: string) => void;
}) {
  const accent = card.accentColor || '#FFAD51';
  return (
    <TouchableOpacity
      style={[styles.cardAd, { width, borderColor: `${accent}55` }]}
      onPress={() => onPress(card.linkHref, card.cardTitle ?? undefined)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={card.cardTitle ?? 'Offer'}
    >
      <View style={{ flex: 1 }}>
        <View style={[styles.cardAdAccentBar, { backgroundColor: accent }]} />
        <Text style={styles.cardAdTitle} numberOfLines={2}>
          {card.cardTitle}
        </Text>
        <View style={styles.cardAdLinkRow}>
          <Text style={styles.cardAdLink}>{card.linkLabel || 'View more'}</Text>
          <Ionicons name="arrow-forward" size={15} color={colors.muted} />
        </View>
      </View>
      {card.imageUrl ? (
        <Image source={{ uri: card.imageUrl }} alt={card.cardTitle ?? ''} style={styles.cardAdImage} resizeMode="contain" />
      ) : (
        <View style={[styles.cardAdIconWrap, { backgroundColor: `${accent}22` }]}>
          <MaterialCommunityIcons name={fallbackIcon} size={44} color={colors.ink} />
        </View>
      )}
    </TouchableOpacity>
  );
}

/* ---------- Small pieces ---------- */

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Ionicons name="checkmark-circle" size={16} color={colors.primary} style={{ marginTop: 1 }} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function Step({
  icon,
  label,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepIcon}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.primaryDark} />
      </View>
      <Text style={styles.stepLabel}>{label}</Text>
    </View>
  );
}

function StepArrow() {
  return <Ionicons name="chevron-forward" size={14} color={colors.subtle} style={{ marginTop: 12 }} />;
}

function Trust({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.trustItem}>
      <Ionicons name={icon} size={15} color={colors.primaryDark} />
      <Text style={styles.trustLabel}>{label}</Text>
    </View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxl },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.borderLight,
  },

  // Top quick CTAs
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  quickCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
    ...shadows.card,
  },
  quickCardBrand: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  quickIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  quickTitle: { fontSize: 15, color: colors.text, fontFamily: fonts.bold },
  quickDesc: { fontSize: 11.5, lineHeight: 15, color: colors.muted, fontFamily: fonts.regular },

  // Ads
  adRail: { paddingHorizontal: spacing.lg, gap: spacing.md },
  mainAd: {
    height: AD_HEIGHT,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  mainAdCircleLg: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.primaryTint,
    opacity: 0.5,
    top: -70,
    right: -50,
  },
  mainAdCircleSm: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.primaryTint,
    opacity: 0.4,
    bottom: -30,
    left: -25,
  },
  adBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  adBadgeText: { fontSize: 11, color: colors.primaryDark, fontFamily: fonts.semibold },
  adHeadline: {
    fontSize: 21,
    lineHeight: 26,
    color: colors.text,
    fontFamily: fonts.bold,
    marginTop: spacing.sm,
  },
  adDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
    fontFamily: fonts.regular,
    marginTop: 4,
    maxWidth: '88%',
  },
  adBottomRow: { flexDirection: 'row', alignItems: 'flex-end', flex: 1 },
  adPriceLabel: { fontSize: 11, color: colors.muted, fontFamily: fonts.regular },
  adPrice: {
    fontSize: 20,
    color: colors.text,
    fontFamily: fonts.bold,
    fontVariant: ['tabular-nums'],
  },
  adImage: { width: 92, height: 92 },
  adCtaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  adCtaDark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: radius.full,
    paddingHorizontal: 18,
    minHeight: 44,
  },
  adCtaDarkText: { color: colors.onInk, fontSize: 13.5, fontFamily: fonts.semibold },
  adCtaLight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 18,
    minHeight: 44,
  },
  adCtaLightText: { color: colors.text, fontSize: 13.5, fontFamily: fonts.semibold },
  cardAd: {
    height: AD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadows.card,
  },
  cardAdAccentBar: { width: 34, height: 5, borderRadius: 3, marginBottom: spacing.sm },
  cardAdTitle: { fontSize: 26, lineHeight: 32, color: colors.text, fontFamily: fonts.bold },
  cardAdLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.md },
  cardAdLink: { fontSize: 14, color: colors.muted, fontFamily: fonts.medium },
  cardAdImage: { width: 120, height: 120 },
  cardAdIconWrap: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: { width: 18, backgroundColor: colors.primary },

  // Services
  kicker: {
    fontSize: 12,
    color: colors.primaryDark,
    fontFamily: fonts.semibold,
    letterSpacing: 1.2,
    marginTop: spacing.xl,
    marginBottom: 2,
    paddingHorizontal: spacing.lg,
  },
  servicesTitle: {
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
    fontFamily: fonts.bold,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  serviceCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  serviceCardBrand: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  serviceHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  serviceTag: {
    fontSize: 10.5,
    color: colors.primaryDark,
    fontFamily: fonts.semibold,
    letterSpacing: 1,
  },
  serviceTitle: { fontSize: 19, color: colors.text, fontFamily: fonts.bold, marginTop: 2 },
  serviceDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.body,
    fontFamily: fonts.regular,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginBottom: 7,
  },
  bulletText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.body,
    fontFamily: fonts.medium,
  },
  serviceActions: { gap: spacing.xs, marginTop: spacing.sm },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: 10.5,
    lineHeight: 14,
    color: colors.body,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },

  // Popular rail + trust strip
  popularWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  popularRail: { gap: spacing.md, paddingRight: spacing.xs },
  popularCard: { width: 150 },
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  trustLabel: { fontSize: 12, color: colors.muted, fontFamily: fonts.medium },
});
