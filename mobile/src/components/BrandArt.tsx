// Branded service illustrations for The Quality Market — composed scenes built
// from MaterialCommunityIcons glyphs and layered brand-tinted shapes (soft green
// blob, dashed ground line, speed streaks), so home/service surfaces get
// illustration-quality art without adding react-native-svg (which would require
// a new native dev-client build).
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/theme';

export type BrandArtVariant = 'motorbike' | 'truck' | 'storefront' | 'bags';

const GLYPH: Record<BrandArtVariant, keyof typeof MaterialCommunityIcons.glyphMap> = {
  motorbike: 'motorbike',
  truck: 'truck-fast',
  storefront: 'storefront-outline',
  bags: 'shopping-outline',
};

// Vehicles get motion streaks + a ground line; places sit on a plain ground.
const MOVING: Record<BrandArtVariant, boolean> = {
  motorbike: true,
  truck: true,
  storefront: false,
  bags: false,
};

/**
 * Square illustrated badge, sized via `size` (default 96). The glyph is drawn
 * in brand ink over a soft green blob with a small green accent chip, matching
 * the web hero's green-on-slate look.
 */
export function BrandArt({
  variant,
  size = 96,
  style,
}: {
  variant: BrandArtVariant;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const s = size / 96; // scale factor against the 96pt reference design
  const moving = MOVING[variant];
  return (
    <View
      style={[{ width: size, height: size }, styles.wrap, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Soft brand blob behind the subject */}
      <View
        style={[
          styles.blob,
          {
            width: 78 * s,
            height: 78 * s,
            borderRadius: 39 * s,
            top: 4 * s,
            right: 2 * s,
          },
        ]}
      />
      {/* Small floating accent dots */}
      <View style={[styles.dot, { width: 8 * s, height: 8 * s, borderRadius: 4 * s, top: 8 * s, left: 12 * s }]} />
      <View
        style={[
          styles.dotSoft,
          { width: 12 * s, height: 12 * s, borderRadius: 6 * s, bottom: 26 * s, right: 4 * s },
        ]}
      />

      {/* Speed streaks (vehicles only) */}
      {moving ? (
        <>
          <View style={[styles.streak, { width: 22 * s, height: 3 * s, left: 0, top: 40 * s }]} />
          <View style={[styles.streak, { width: 14 * s, height: 3 * s, left: 4 * s, top: 50 * s, opacity: 0.55 }]} />
          <View style={[styles.streak, { width: 8 * s, height: 3 * s, left: 8 * s, top: 60 * s, opacity: 0.35 }]} />
        </>
      ) : null}

      {/* Subject glyph */}
      <MaterialCommunityIcons
        name={GLYPH[variant]}
        size={48 * s}
        color={colors.ink}
        style={{ marginLeft: moving ? 10 * s : 0 }}
      />

      {/* Dashed ground line the subject sits on */}
      <View
        style={[
          styles.ground,
          {
            width: 64 * s,
            bottom: 14 * s,
            borderBottomWidth: Math.max(2 * s, 1.5),
          },
        ]}
      />

      {/* Brand chip — tiny green check seal anchoring the scene to the brand */}
      <View
        style={[
          styles.chip,
          {
            width: 22 * s,
            height: 22 * s,
            borderRadius: 11 * s,
            bottom: 6 * s,
            right: 10 * s,
            borderWidth: Math.max(2 * s, 1.5),
          },
        ]}
      >
        <MaterialCommunityIcons name="check-bold" size={12 * s} color={colors.primaryText} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  blob: { position: 'absolute', backgroundColor: colors.primaryTint },
  dot: { position: 'absolute', backgroundColor: colors.primary, opacity: 0.7 },
  dotSoft: { position: 'absolute', backgroundColor: colors.primaryBorder },
  streak: {
    position: 'absolute',
    backgroundColor: colors.primary,
    borderRadius: 999,
    opacity: 0.8,
  },
  ground: {
    position: 'absolute',
    borderColor: colors.primaryBorder,
    borderStyle: 'dashed',
  },
  chip: {
    position: 'absolute',
    backgroundColor: colors.primary,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
