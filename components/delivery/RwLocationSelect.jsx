'use client'
import { useMemo } from "react";
import {
    getProvinces,
    getDistrictsByProvince,
    getSectorsByDistrict,
    getCellsBySector,
    getVillagesByCell,
} from "rwanda-geo-structure";

// Cascading official-location dropdowns (NISR administrative divisions):
// Province → District → Sector → Cell → Village. Selecting a level resets the
// levels below it. Every address on the platform is recorded at least to the
// cell level; the village is the finest (optional) detail.
//
// value:    { province, district, sector, cell, village }
// onChange: (nextValue) => void
// kigaliOnly: lock the province to Kigali (delivery service operates in Kigali)
// villageOptional: label the village select as optional (default true)
const EMPTY = { province: "", district: "", sector: "", cell: "", village: "" };

export default function RwLocationSelect({
    value,
    onChange,
    kigaliOnly = false,
    villageOptional = true,
    inputClass = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none",
}) {
    const v = { ...EMPTY, ...(value || {}) };
    const province = kigaliOnly ? "Kigali" : v.province;

    const provinces = useMemo(() => (kigaliOnly ? ["Kigali"] : getProvinces()), [kigaliOnly]);
    const districts = useMemo(() => (province ? getDistrictsByProvince(province) : []), [province]);
    const sectors = useMemo(
        () => (province && v.district ? getSectorsByDistrict(province, v.district) : []),
        [province, v.district]
    );
    const cells = useMemo(
        () => (province && v.district && v.sector ? getCellsBySector(province, v.district, v.sector) : []),
        [province, v.district, v.sector]
    );
    const villages = useMemo(
        () => (province && v.district && v.sector && v.cell ? getVillagesByCell(province, v.district, v.sector, v.cell) : []),
        [province, v.district, v.sector, v.cell]
    );

    // Changing a level clears everything below it.
    const set = (level, val) => {
        const next = { ...v, province, [level]: val };
        if (level === "province") { next.district = ""; next.sector = ""; next.cell = ""; next.village = ""; }
        if (level === "district") { next.sector = ""; next.cell = ""; next.village = ""; }
        if (level === "sector") { next.cell = ""; next.village = ""; }
        if (level === "cell") { next.village = ""; }
        onChange(next);
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {!kigaliOnly && (
                <select className={inputClass} value={province} onChange={(e) => set("province", e.target.value)} aria-label="Province">
                    <option value="">Province…</option>
                    {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
            )}
            <select className={inputClass} value={v.district} onChange={(e) => set("district", e.target.value)} disabled={!province} aria-label="District">
                <option value="">District…</option>
                {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className={inputClass} value={v.sector} onChange={(e) => set("sector", e.target.value)} disabled={!v.district} aria-label="Sector">
                <option value="">Sector…</option>
                {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={inputClass} value={v.cell} onChange={(e) => set("cell", e.target.value)} disabled={!v.sector} aria-label="Cell">
                <option value="">Cell…</option>
                {cells.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className={inputClass} value={v.village} onChange={(e) => set("village", e.target.value)} disabled={!v.cell} aria-label="Village">
                <option value="">{villageOptional ? "Village (optional)…" : "Village…"}</option>
                {villages.map((vg) => <option key={vg} value={vg}>{vg}</option>)}
            </select>
        </div>
    );
}
