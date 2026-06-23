// Seller → Add / Edit product. Mirrors the web's app/store/add-product and
// edit-product/[productId]. Picks up to 4 images (expo-image-picker), runs the AI
// listing helper on the first photo to suggest a name + description, validates like
// the web, then POSTs (create) or PATCHes (update) multipart to /api/store/product.
// Creating or editing resubmits the product for admin approval (backend-enforced).
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  analyzeProductImage,
  createSellerProduct,
  getSellerProduct,
  updateSellerProduct,
  type ProductFormValues,
  type ProductImageFile,
} from '@/api/store';
import { getCategories } from '@/api/products';
import { Button, Field, Loader } from '@/components/ui';
import { PRODUCT_CATEGORIES } from '@/constants';
import { colors, radius, spacing } from '@/theme';

const MAX_IMAGES = 4;
const AI_MAX_BYTES = 3 * 1024 * 1024; // base64 overhead pushes larger images past limits

const EMPTY: ProductFormValues & { importedCountry: string } = {
  name: '',
  description: '',
  mrp: '',
  price: '',
  warehouseQuantity: '',
  category: '',
  wholesalePrice: '',
  wholesaleMinQty: '',
  weightKg: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  importOrigin: '',
  importedCountry: '',
};

export default function ProductFormScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const [values, setValues] = useState({ ...EMPTY });
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<ProductImageFile[]>([]);
  const [categories, setCategories] = useState<string[]>(PRODUCT_CATEGORIES);
  const [catPicker, setCatPicker] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const set = (k: keyof typeof values, v: string) => setValues((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Edit product' : 'Add product' });
  }, [navigation, isEdit]);

  useEffect(() => {
    getCategories()
      .then((d) => {
        const names = (d.categories || []).map((c) => c.name).filter(Boolean);
        if (names.length) setCategories(names);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    getSellerProduct(id!)
      .then((p) => {
        if (!active) return;
        setValues({
          ...EMPTY,
          name: p.name,
          description: p.description,
          mrp: String(p.mrp ?? ''),
          price: String(p.price ?? ''),
          warehouseQuantity: String(p.warehouseQuantity ?? ''),
          category: p.category ?? '',
          wholesalePrice: p.wholesalePrice != null ? String(p.wholesalePrice) : '',
          wholesaleMinQty: p.wholesaleMinQty != null ? String(p.wholesaleMinQty) : '',
        });
        setExistingImages(Array.isArray(p.images) ? p.images : []);
      })
      .catch((err: any) => Alert.alert('Could not load product', err?.message ?? 'Try again.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  const totalImages = existingImages.length + newImages.length;

  const runAi = useCallback(
    async (base64: string, mimeType: string) => {
      // Only auto-fill empty fields, so we never clobber what the seller typed.
      if (values.name.trim() && values.description.trim()) return;
      setAnalyzing(true);
      try {
        const ai = await analyzeProductImage(base64, mimeType);
        setValues((f) => ({
          ...f,
          name: f.name.trim() ? f.name : ai.name ?? f.name,
          description: f.description.trim() ? f.description : ai.description ?? f.description,
        }));
      } catch {
        // Non-fatal — the seller can fill details manually.
      } finally {
        setAnalyzing(false);
      }
    },
    [values.name, values.description],
  );

  const pickImage = async () => {
    if (totalImages >= MAX_IMAGES) {
      Alert.alert('Maximum reached', `You can attach up to ${MAX_IMAGES} images.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos needed', 'Allow photo access to attach product images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const file: ProductImageFile = {
      uri: asset.uri,
      name: asset.fileName ?? `product-${Date.now()}.jpg`,
      mimeType,
    };
    const isFirst = totalImages === 0;
    setNewImages((prev) => [...prev, file]);
    // Run AI on the first attached photo (small enough for the serverless limit).
    if (isFirst && asset.base64 && (asset.fileSize ?? 0) <= AI_MAX_BYTES) {
      void runAi(asset.base64, mimeType);
    } else if (isFirst && (asset.fileSize ?? 0) > AI_MAX_BYTES) {
      Alert.alert('Image too large for AI', 'Add product details manually (AI skips images over 3 MB).');
    }
  };

  const removeExisting = (url: string) =>
    setExistingImages((prev) => prev.filter((u) => u !== url));
  const removeNew = (uri: string) => setNewImages((prev) => prev.filter((f) => f.uri !== uri));

  const validate = (): string | null => {
    if (values.name.trim().length < 3) return 'Name must be at least 3 characters.';
    if (values.description.trim().length < 20) return 'Description must be at least 20 characters.';
    const mrp = Number(values.mrp);
    const price = Number(values.price);
    if (!mrp || mrp <= 0) return 'Actual price must be greater than 0.';
    if (!price || price <= 0) return 'Offer price must be greater than 0.';
    if (price > mrp) return 'Offer price cannot exceed the actual price.';
    const qty = Number(values.warehouseQuantity);
    if (!Number.isInteger(qty) || qty < 0) return 'Quantity must be 0 or more.';
    if (!values.category) return 'Pick a category.';
    if (totalImages === 0) return 'Attach at least one image.';
    return null;
  };

  const onSubmit = async () => {
    const error = validate();
    if (error) {
      Alert.alert('Check the form', error);
      return;
    }
    setSaving(true);
    const payload: ProductFormValues = {
      name: values.name.trim(),
      description: values.description.trim(),
      mrp: values.mrp,
      price: values.price,
      warehouseQuantity: values.warehouseQuantity,
      category: values.category,
      wholesalePrice: values.wholesalePrice,
      wholesaleMinQty: values.wholesaleMinQty,
      weightKg: values.weightKg,
      lengthCm: values.lengthCm,
      widthCm: values.widthCm,
      heightCm: values.heightCm,
      importOrigin: values.importOrigin === 'IMPORTED' ? values.importedCountry : '',
    };
    try {
      const res = isEdit
        ? await updateSellerProduct(id!, payload, existingImages, newImages)
        : await createSellerProduct(payload, newImages);
      Alert.alert('Submitted', res.message || 'Product sent for admin approval.');
      router.back();
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Images */}
      <Text style={styles.sectionLabel}>Images ({totalImages}/{MAX_IMAGES})</Text>
      <View style={styles.imageRow}>
        {existingImages.map((url) => (
          <View key={url} style={styles.imageBox}>
            <Image source={{ uri: url }} style={styles.image} />
            <TouchableOpacity style={styles.imageRemove} onPress={() => removeExisting(url)}>
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
        {newImages.map((f) => (
          <View key={f.uri} style={styles.imageBox}>
            <Image source={{ uri: f.uri }} style={styles.image} />
            <TouchableOpacity style={styles.imageRemove} onPress={() => removeNew(f.uri)}>
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
        {totalImages < MAX_IMAGES ? (
          <TouchableOpacity style={styles.imageAdd} onPress={pickImage}>
            {analyzing ? (
              <ActivityIndicator color={colors.muted} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={22} color={colors.muted} />
                <Text style={styles.imageAddText}>Add</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
      {analyzing ? <Text style={styles.aiHint}>Analyzing photo with AI…</Text> : null}

      {/* Core fields */}
      <Field label="Name" value={values.name} onChangeText={(t) => set('name', t)} placeholder="Product name" />
      <Text style={styles.fieldLabel}>Description ({values.description.trim().length} chars)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={values.description}
        onChangeText={(t) => set('description', t)}
        placeholder="Describe the product (min 20 characters)"
        placeholderTextColor={colors.subtle}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />

      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="Actual price (RWF)" value={values.mrp} onChangeText={(t) => set('mrp', t)} keyboardType="numeric" placeholder="0" />
        </View>
        <View style={styles.flex}>
          <Field label="Offer price (RWF)" value={values.price} onChangeText={(t) => set('price', t)} keyboardType="numeric" placeholder="0" />
        </View>
      </View>
      <Field
        label="Warehouse quantity"
        value={values.warehouseQuantity}
        onChangeText={(t) => set('warehouseQuantity', t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        placeholder="0"
      />

      {/* Category */}
      <Text style={styles.fieldLabel}>Category</Text>
      <TouchableOpacity style={styles.selectBtn} onPress={() => setCatPicker(true)}>
        <Text style={[styles.selectText, !values.category && styles.selectPlaceholder]}>
          {values.category || 'Select a category'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.subtle} />
      </TouchableOpacity>

      {/* Wholesale (optional) */}
      <Text style={styles.sectionLabel}>Wholesale pricing (optional)</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="Wholesale price" value={values.wholesalePrice ?? ''} onChangeText={(t) => set('wholesalePrice', t)} keyboardType="numeric" placeholder="0" />
        </View>
        <View style={styles.flex}>
          <Field label="Min. qty" value={values.wholesaleMinQty ?? ''} onChangeText={(t) => set('wholesaleMinQty', t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="e.g. 10" />
        </View>
      </View>

      {/* Shipping details (create only — backend update ignores these) */}
      {!isEdit ? (
        <>
          <Text style={styles.sectionLabel}>Shipping details (optional)</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field label="Weight (kg)" value={values.weightKg ?? ''} onChangeText={(t) => set('weightKg', t)} keyboardType="numeric" placeholder="0.00" />
            </View>
            <View style={styles.flex}>
              <Field label="Length (cm)" value={values.lengthCm ?? ''} onChangeText={(t) => set('lengthCm', t)} keyboardType="numeric" placeholder="0" />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field label="Width (cm)" value={values.widthCm ?? ''} onChangeText={(t) => set('widthCm', t)} keyboardType="numeric" placeholder="0" />
            </View>
            <View style={styles.flex}>
              <Field label="Height (cm)" value={values.heightCm ?? ''} onChangeText={(t) => set('heightCm', t)} keyboardType="numeric" placeholder="0" />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Product origin</Text>
          <View style={styles.originRow}>
            {[
              { label: 'Local (Rwanda)', value: '' },
              { label: 'Imported', value: 'IMPORTED' },
            ].map((o) => {
              const active = values.importOrigin === o.value;
              return (
                <TouchableOpacity
                  key={o.label}
                  style={[styles.originChip, active && styles.originChipActive]}
                  onPress={() => set('importOrigin', o.value)}
                >
                  <Text style={[styles.originText, active && styles.originTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {values.importOrigin === 'IMPORTED' ? (
            <Field
              label="Country of origin"
              value={values.importedCountry}
              onChangeText={(t) => set('importedCountry', t)}
              placeholder="e.g. China"
            />
          ) : null}
        </>
      ) : null}

      <View style={{ marginTop: spacing.lg, marginBottom: spacing.xl }}>
        <Button
          label={isEdit ? 'Save & resubmit for approval' : 'Add product'}
          onPress={onSubmit}
          loading={saving}
        />
        <Text style={styles.approvalNote}>
          {isEdit
            ? 'Saving changes resubmits the product for admin approval.'
            : 'New products are reviewed by an admin before going live.'}
        </Text>
      </View>

      {/* Category picker */}
      <Modal visible={catPicker} animationType="slide" transparent onRequestClose={() => setCatPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select category</Text>
              <TouchableOpacity onPress={() => setCatPicker(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={categories}
              keyExtractor={(c) => c}
              renderItem={({ item }) => {
                const active = values.category === item;
                return (
                  <TouchableOpacity
                    style={styles.catRow}
                    onPress={() => {
                      set('category', item);
                      setCatPicker(false);
                    }}
                  >
                    <Text style={[styles.catText, active && styles.catTextActive]}>{item}</Text>
                    {active ? <Ionicons name="checkmark" size={18} color={colors.success} /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  textArea: { height: 110, marginBottom: spacing.md },

  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  imageBox: { position: 'relative' },
  image: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.card },
  imageRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageAdd: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageAddText: { fontSize: 11, color: colors.muted, marginTop: 2 },
  aiHint: { fontSize: 12, color: colors.success, marginTop: 6 },

  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },

  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: spacing.md,
  },
  selectText: { fontSize: 16, color: colors.text },
  selectPlaceholder: { color: colors.subtle },

  originRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  originChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  originChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  originText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  originTextActive: { color: colors.primaryText },

  approvalNote: { fontSize: 12, color: colors.subtle, marginTop: spacing.sm, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  catText: { fontSize: 15, color: colors.text },
  catTextActive: { color: colors.success, fontWeight: '700' },
});
