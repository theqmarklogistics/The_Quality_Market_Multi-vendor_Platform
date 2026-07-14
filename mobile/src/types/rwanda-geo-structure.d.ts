// The package ships type declarations at dist/src/index.d.ts but its
// package.json "types" field points to a missing dist/index.d.ts, so TS can't
// resolve them. Declare the functions we use here instead.
declare module 'rwanda-geo-structure' {
  export function getProvinces(): string[];
  export function getDistricts(): string[];
  export function getDistrictsByProvince(province: string): string[];
  export function getSectors(): string[];
  export function getSectorsByDistrict(province: string, district: string): string[];
  export function getCells(): string[];
  export function getCellsBySector(province: string, district: string, sector: string): string[];
  export function getVillages(): string[];
  export function getVillagesByCell(
    province: string,
    district: string,
    sector: string,
    cell: string,
  ): string[];
}
