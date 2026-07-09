// Modal for rating a delivered product. Calls POST /api/rating.
import { useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addRating } from '@/api/ratings';
import { Button } from './ui';
import { colors, fonts, radius, spacing } from '@/theme';

export function RatingModal({
  visible,
  orderId,
  productId,
  productName,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  orderId: string;
  productId: string;
  productName: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await addRating({ orderId, productId, rating, review: review.trim() || undefined });
      onSubmitted();
      onClose();
      setReview('');
      setRating(5);
    } catch (err: any) {
      Alert.alert('Could not submit', err?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Rate {productName}</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setRating(i)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`${i} star${i === 1 ? '' : 's'}`}
              >
                <Ionicons
                  name="star"
                  size={38}
                  color={i <= rating ? colors.star : colors.starEmpty}
                />
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Share your experience (optional)"
            placeholderTextColor={colors.subtle}
            value={review}
            onChangeText={setReview}
            multiline
          />
          <Button label="Submit review" onPress={submit} loading={submitting} />
          <TouchableOpacity onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 2,
  },
  title: { fontSize: 18, fontFamily: fonts.bold, color: colors.text },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 88,
    textAlignVertical: 'top',
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  cancel: { alignItems: 'center', paddingVertical: spacing.sm, minHeight: 44 },
  cancelText: { color: colors.muted, fontSize: 15, fontFamily: fonts.medium },
});
