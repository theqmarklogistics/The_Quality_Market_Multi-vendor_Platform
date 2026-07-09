// Brand logo lockup for The Quality Market. Renders the orbit-cart mark
// (assets/brand-logo.png — the same artwork the web app and app icon use) with
// an optional two-tone wordmark, so auth, storefront and receipt surfaces all
// share one consistent brand anchor.
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fonts } from '@/theme';

// Relative require (assets live outside the `@/`-aliased src tree).
const MARK = require('../../assets/brand-logo.png');

export function BrandLogo({
  size = 64,
  showWordmark = false,
  wordmarkSize = 20,
  direction = 'column',
  gap = 10,
  style,
}: {
  /** Height/width of the square mark, in px. */
  size?: number;
  /** Show the "The Quality Market" wordmark beside/below the mark. */
  showWordmark?: boolean;
  wordmarkSize?: number;
  /** Stack the mark and wordmark ('column') or place them side by side ('row'). */
  direction?: 'row' | 'column';
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const row = direction === 'row';
  return (
    <View style={[row ? styles.row : styles.col, { gap }, style]}>
      <Image
        source={MARK}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="The Quality Market"
      />
      {showWordmark ? (
        <Text style={[styles.wordmark, { fontSize: wordmarkSize }]}>
          The Quality <Text style={styles.accent}>Market</Text>
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  wordmark: { color: colors.text, fontFamily: fonts.bold },
  accent: { color: colors.primary },
});
