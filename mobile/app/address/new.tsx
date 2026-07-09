// Add a delivery address. The backend requires a pinned lat/long, so this screen
// captures the device location (expo-location) before allowing save.
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '@clerk/clerk-expo';
import { addAddress } from '@/api/addresses';
import { Button, Field } from '@/components/ui';
import { KIGALI_SECTORS } from '@/constants';
import { colors, fonts, radius, spacing } from '@/theme';

export default function NewAddressScreen() {
  const router = useRouter();
  const { user } = useUser();

  const [name, setName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.primaryEmailAddress?.emailAddress ?? '');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('Kigali');
  const [state, setState] = useState('Kigali');
  const [zip, setZip] = useState('0000');
  const [country, setCountry] = useState('Rwanda');
  const [sector, setSector] = useState<string | null>(null);

  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pinning, setPinning] = useState(false);
  const [saving, setSaving] = useState(false);

  const pinLocation = async () => {
    setPinning(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location access to pin your address.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      Alert.alert('Location error', 'Could not get your location. Try again outdoors.');
    } finally {
      setPinning(false);
    }
  };

  const onSave = async () => {
    if (!coords) {
      Alert.alert('Pin required', 'Please pin your location before saving.');
      return;
    }
    if (!name || !phone || !street) {
      Alert.alert('Missing details', 'Name, phone, and street are required.');
      return;
    }
    setSaving(true);
    try {
      await addAddress({
        name,
        email,
        phone,
        street,
        city,
        state,
        zip,
        country,
        sector: sector ?? undefined,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      router.back();
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Field label="Full name" value={name} onChangeText={setName} />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Street / house" value={street} onChangeText={setStreet} />

      <Text style={styles.fieldLabel}>Sector (Kigali)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {KIGALI_SECTORS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, sector === s && styles.chipActive]}
            onPress={() => setSector(s)}
          >
            <Text style={[styles.chipText, sector === s && styles.chipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="City" value={city} onChangeText={setCity} />
        </View>
        <View style={styles.flex}>
          <Field label="State / Province" value={state} onChangeText={setState} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="ZIP" value={zip} onChangeText={setZip} />
        </View>
        <View style={styles.flex}>
          <Field label="Country" value={country} onChangeText={setCountry} />
        </View>
      </View>

      <TouchableOpacity style={[styles.pinBtn, coords && styles.pinBtnDone]} onPress={pinLocation} disabled={pinning}>
        <Ionicons
          name={coords ? 'checkmark-circle' : 'location-outline'}
          size={20}
          color={coords ? colors.success : colors.text}
        />
        <Text style={styles.pinText}>
          {pinning
            ? 'Getting location…'
            : coords
              ? `Location pinned (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`
              : 'Pin my current location'}
        </Text>
      </TouchableOpacity>

      <View style={{ marginTop: spacing.lg }}>
        <Button label="Save address" onPress={onSave} loading={saving} disabled={!coords} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: 6, fontFamily: fonts.medium },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  chips: { gap: 8, paddingBottom: spacing.md },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.body, fontFamily: fonts.medium },
  chipTextActive: { color: colors.primaryText, fontFamily: fonts.semibold },
  pinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 50,
    marginTop: spacing.sm,
  },
  pinBtnDone: { borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
  pinText: { fontSize: 14, color: colors.text, flex: 1, fontFamily: fonts.medium },
});
