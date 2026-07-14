// Add a delivery address. The location is mandatory: either a pinned lat/long
// (exact routing), or the official administrative address selected down to the
// cell — the backend geocodes that into an approximate point.
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '@clerk/clerk-expo';
import { addAddress } from '@/api/addresses';
import { Button, Field } from '@/components/ui';
import { EMPTY_RW_LOCATION, RwLocationSelect, type RwLocation } from '@/components/RwLocationSelect';
import { colors, fonts, radius, spacing } from '@/theme';

export default function NewAddressScreen() {
  const router = useRouter();
  const { user } = useUser();

  const [name, setName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.primaryEmailAddress?.emailAddress ?? '');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [location, setLocation] = useState<RwLocation>(EMPTY_RW_LOCATION);

  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pinning, setPinning] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasCellLevel = !!(location.district && location.sector && location.cell);
  const canSave = !!coords || hasCellLevel;

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
    if (!canSave) {
      Alert.alert(
        'Location needed',
        'Pin your current location, or select your district, sector and cell so we can locate you.',
      );
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
        city: location.district || '-',
        state: location.province || 'Kigali',
        zip: '-',
        country: 'Rwanda',
        district: location.district || undefined,
        sector: location.sector || undefined,
        cell: location.cell || undefined,
        village: location.village || undefined,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
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
      <Field label="Street / house / landmark" value={street} onChangeText={setStreet} />

      <Text style={styles.fieldLabel}>Where should we deliver?</Text>
      <Text style={styles.hint}>Select down to the cell — or just pin your exact location below.</Text>
      <RwLocationSelect value={location} onChange={setLocation} />

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
              : 'Pin my exact location (best option)'}
        </Text>
      </TouchableOpacity>

      <View style={{ marginTop: spacing.lg }}>
        <Button label="Save address" onPress={onSave} loading={saving} disabled={!canSave} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: 4, fontFamily: fonts.medium },
  hint: { fontSize: 12, color: colors.subtle, marginBottom: spacing.sm, fontFamily: fonts.regular },
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
