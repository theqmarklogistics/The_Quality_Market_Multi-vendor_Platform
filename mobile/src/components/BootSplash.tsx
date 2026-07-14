// Boot screen shown between the native splash and the first screen, while the
// Outfit fonts and the Clerk session load: the brand mark over the indeterminate
// brand-green loading line. No text here — the custom fonts aren't loaded yet,
// so the wordmark would flash in a system font.
import { StyleSheet, View } from 'react-native';
import { BrandLogo } from './BrandLogo';
import { LoadingLine } from './ui';
import { colors } from '@/theme';

export function BootSplash() {
  return (
    <View style={styles.wrap} accessibilityLabel="The Quality Market is loading">
      <BrandLogo size={96} />
      <LoadingLine width={168} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    backgroundColor: colors.bg, // matches the native splash background (white)
  },
});
