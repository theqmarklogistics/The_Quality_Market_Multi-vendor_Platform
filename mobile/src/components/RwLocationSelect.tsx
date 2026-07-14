// Cascading official-location pickers (NISR administrative divisions):
// Province → District → Sector → Cell → Village. Each level opens a searchable
// modal list; selecting a level resets the levels below it. Every address on
// the platform is recorded at least to the cell level; the village is the
// finest (optional) detail.
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getProvinces,
  getDistrictsByProvince,
  getSectorsByDistrict,
  getCellsBySector,
  getVillagesByCell,
} from 'rwanda-geo-structure';
import { colors, fonts, radius, spacing } from '@/theme';

export type RwLocation = {
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
};

export const EMPTY_RW_LOCATION: RwLocation = {
  province: '',
  district: '',
  sector: '',
  cell: '',
  village: '',
};

type Level = keyof RwLocation;

export function RwLocationSelect({
  value,
  onChange,
  kigaliOnly = false,
  villageOptional = true,
}: {
  value: RwLocation;
  onChange: (next: RwLocation) => void;
  kigaliOnly?: boolean;
  villageOptional?: boolean;
}) {
  const province = kigaliOnly ? 'Kigali' : value.province;
  const [open, setOpen] = useState<Level | null>(null);
  const [query, setQuery] = useState('');

  const options = useMemo<string[]>(() => {
    try {
      switch (open) {
        case 'province':
          return getProvinces();
        case 'district':
          return province ? getDistrictsByProvince(province) : [];
        case 'sector':
          return province && value.district ? getSectorsByDistrict(province, value.district) : [];
        case 'cell':
          return province && value.district && value.sector
            ? getCellsBySector(province, value.district, value.sector)
            : [];
        case 'village':
          return province && value.district && value.sector && value.cell
            ? getVillagesByCell(province, value.district, value.sector, value.cell)
            : [];
        default:
          return [];
      }
    } catch {
      return [];
    }
  }, [open, province, value.district, value.sector, value.cell]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // Selecting a level clears everything below it.
  const select = (level: Level, val: string) => {
    const next: RwLocation = { ...value, province, [level]: val };
    if (level === 'province') Object.assign(next, { district: '', sector: '', cell: '', village: '' });
    if (level === 'district') Object.assign(next, { sector: '', cell: '', village: '' });
    if (level === 'sector') Object.assign(next, { cell: '', village: '' });
    if (level === 'cell') next.village = '';
    onChange(next);
    setOpen(null);
    setQuery('');
  };

  const rows: { level: Level; label: string; selected: string; enabled: boolean }[] = [
    ...(kigaliOnly
      ? []
      : [{ level: 'province' as Level, label: 'Province', selected: value.province, enabled: true }]),
    { level: 'district', label: 'District', selected: value.district, enabled: !!province },
    { level: 'sector', label: 'Sector', selected: value.sector, enabled: !!value.district },
    { level: 'cell', label: 'Cell', selected: value.cell, enabled: !!value.sector },
    {
      level: 'village',
      label: villageOptional ? 'Village (optional)' : 'Village',
      selected: value.village,
      enabled: !!value.cell,
    },
  ];

  const openLabel = rows.find((r) => r.level === open)?.label ?? '';

  return (
    <View>
      {rows.map((r) => (
        <TouchableOpacity
          key={r.level}
          style={[styles.row, !r.enabled && styles.rowDisabled, !!r.selected && styles.rowDone]}
          disabled={!r.enabled}
          onPress={() => {
            setOpen(r.level);
            setQuery('');
          }}
          accessibilityRole="button"
          accessibilityLabel={r.label}
        >
          <Text style={styles.rowLabel}>{r.label}</Text>
          <View style={styles.rowValueWrap}>
            <Text style={[styles.rowValue, !r.selected && styles.rowPlaceholder]} numberOfLines={1}>
              {r.selected || 'Select…'}
            </Text>
            <Ionicons name="chevron-down" size={15} color={colors.subtle} />
          </View>
        </TouchableOpacity>
      ))}

      <Modal visible={open != null} animationType="slide" transparent onRequestClose={() => setOpen(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Select {openLabel.replace(' (optional)', '').toLowerCase()}</Text>
              <TouchableOpacity onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>
            {options.length > 12 ? (
              <TextInput
                style={styles.search}
                placeholder="Search…"
                placeholderTextColor={colors.subtle}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
            ) : null}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const active = open ? value[open] === item : false;
                return (
                  <TouchableOpacity style={styles.option} onPress={() => open && select(open, item)}>
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{item}</Text>
                    {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.empty}>No matches</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    marginBottom: spacing.sm,
  },
  rowDisabled: { opacity: 0.45 },
  rowDone: { borderColor: colors.primaryBorder },
  rowLabel: { fontSize: 13, color: colors.muted, fontFamily: fonts.medium },
  rowValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  rowValue: { fontSize: 14, color: colors.text, fontFamily: fonts.semibold, maxWidth: 180 },
  rowPlaceholder: { color: colors.subtle, fontFamily: fonts.regular },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    maxHeight: '75%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  modalTitle: { fontSize: 16, color: colors.text, fontFamily: fonts.bold },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    fontSize: 14,
    color: colors.text,
    fontFamily: fonts.regular,
    marginBottom: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: { fontSize: 14.5, color: colors.body, fontFamily: fonts.medium },
  optionTextActive: { color: colors.primaryDark, fontFamily: fonts.bold },
  empty: { textAlign: 'center', color: colors.subtle, paddingVertical: spacing.lg, fontFamily: fonts.regular, fontSize: 13 },
});
