// Report focus filters — the controls that narrow a report onto one entity (a
// store, product, package, rider, corridor or hub) so its own performance can be
// read in isolation.
//
// Filters only ever REMOVE rows from data the scope already granted, so they can
// never widen access: an id belonging to someone else's store simply matches
// nothing. Every control is self-describing — the UI renders whatever is returned
// here and echoes the chosen value back on the next request. Two kinds exist:
//   picker — a dropdown whose options come from the entities actually present in
//            the window, so the list stays short and every choice returns rows
//   text   — a free-text box, for identifiers too numerous to list (a package)
//
// Pure functions (no prisma, no request context) so they can be unit-checked —
// see scripts/check-report-filters.mjs.

// Relative + extension-ful so plain node can load this module in the check script.
import { categoryNamesWithDescendants, flattenCategoryOptions } from "../categoryTree.js";

/**
 * A dropdown filter. `entries` is a Map of id → label covering the entities the
 * current window contains. A requested id that isn't in it resolves to '' (the
 * "all" option) rather than an empty report, so a stale link degrades gracefully.
 *
 * Options are sorted by label unless `sort: false`, which preserves the Map's
 * insertion order — what a hierarchy needs, since a category tree flattened
 * depth-first is already in the only order that reads correctly.
 *
 * @returns {{control: object, value: string, label: string|null}}
 *          `control` is what the UI renders, `value` the resolved selection and
 *          `label` its display name (null when nothing is selected).
 */
export function pickerFilter(key, label, allLabel, entries, requested, { sort = true } = {}) {
    const listed = [...entries.entries()].map(([value, text]) => ({ value, label: String(text || 'Unnamed') }));
    if (sort) listed.sort((a, b) => a.label.localeCompare(b.label));

    const value = requested && entries.has(requested) ? requested : '';
    return {
        control: { key, label, value, options: [{ value: '', label: allLabel }, ...listed] },
        value,
        label: value ? String(entries.get(value) || 'Unnamed') : null,
    };
}

/** A free-text filter, for identifiers too numerous to put in a dropdown. */
export function textFilter(key, label, placeholder, requested) {
    const value = String(requested || '').trim().slice(0, 100);
    return { control: { key, label, value, kind: 'text', placeholder }, value, label: value || null };
}

/**
 * Loose identifier match for the package box: case- and punctuation-insensitive,
 * and satisfied by any fragment of the id, so "AB12CD" finds "ord_ab12cd34"
 * whether it was copied from a label, a document or the tracking link. An empty
 * query matches nothing (callers skip the filter entirely when it is blank).
 */
export function idMatches(id, query) {
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const q = norm(query);
    return q.length > 0 && norm(id).includes(q);
}

/**
 * Category picker entries, keyed by NAME because a product references its
 * category by name. The tree is flattened depth-first and indented ("— Coffee &
 * Tea"), then pruned to the branches that actually sold in the window — a parent
 * survives when any of its descendants sold, so picking it still means "the whole
 * branch". A sold category with no Category row (a legacy free-text name) is
 * appended flat, so nothing visible on the report is unreachable from the filter.
 *
 * Pair with `pickerFilter(..., { sort: false })`: the depth-first order is the
 * only one in which the indentation reads correctly.
 *
 * @param {Array<{id:string, name:string, parentId:string|null, sortOrder?:number}>} rows
 * @param {Set<string>} soldCategories  category names present in the window
 */
export function categoryEntries(rows, soldCategories) {
    const entries = new Map();
    for (const option of flattenCategoryOptions(rows)) {
        const covered = categoryNamesWithDescendants(option.name, rows);
        if (covered.some((name) => soldCategories.has(name))) entries.set(option.name, option.label);
    }
    for (const name of soldCategories) {
        if (!entries.has(name)) entries.set(name, name);
    }
    return entries;
}

/**
 * "Store focus · Kigali Fresh   |   Product focus · Coffee 1kg" — the line shown
 * under the report title, on the PDF and in the CSV, naming every filter applied.
 * Null when nothing is filtered, so the header stays clean.
 */
export function focusSubtitle(parts) {
    const active = (parts || []).filter((p) => p && p.label);
    return active.length ? active.map((p) => `${p.name} · ${p.label}`).join('   |   ') : null;
}
