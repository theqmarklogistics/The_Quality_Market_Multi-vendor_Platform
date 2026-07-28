import assert from 'node:assert/strict';
import { pickerFilter, textFilter, idMatches, focusSubtitle, categoryEntries } from '../lib/reports/filters.js';

// category → subcategory → sub-subcategory, plus a sibling root that never sold.
const CATEGORIES = [
  { id: 'c1', name: 'Food & Beverages', parentId: null, sortOrder: 1 },
  { id: 'c2', name: 'Coffee & Tea', parentId: 'c1', sortOrder: 1 },
  { id: 'c3', name: 'Arabica', parentId: 'c2', sortOrder: 1 },
  { id: 'c4', name: 'Bakery', parentId: 'c1', sortOrder: 2 },
  { id: 'c5', name: 'Electronics', parentId: null, sortOrder: 2 },
];

const STORES = new Map([
  ['st_2', 'Nyabugogo Wholesale'],
  ['st_1', 'Kigali Fresh Market'],
  ['st_3', null], // a store row with no name still has to render
]);

function run() {
  // ── Picker: options, ordering and the "all" entry ──────────────────────────
  const none = pickerFilter('storeId', 'Store', 'All stores', STORES, undefined);
  assert.equal(none.value, '');
  assert.equal(none.label, null, 'nothing selected ⇒ no focus label');
  assert.equal(none.control.options[0].label, 'All stores');
  assert.deepEqual(
    none.control.options.slice(1).map((o) => o.label),
    ['Kigali Fresh Market', 'Nyabugogo Wholesale', 'Unnamed'],
    'options are sorted by label, and a nameless entity is still listed'
  );

  // ── Picker: a valid selection resolves to itself ───────────────────────────
  const picked = pickerFilter('storeId', 'Store', 'All stores', STORES, 'st_1');
  assert.equal(picked.value, 'st_1');
  assert.equal(picked.label, 'Kigali Fresh Market');
  assert.equal(picked.control.value, 'st_1', 'the control echoes the selection back to the UI');

  // ── Picker: an id outside the window falls back to "all" ───────────────────
  // This is the security-relevant branch: a filter value the current scope does
  // not cover must never be honoured, and must not blank the report either.
  const foreign = pickerFilter('storeId', 'Store', 'All stores', STORES, 'st_someone_else');
  assert.equal(foreign.value, '', 'an unknown id resolves to the "all" option');
  assert.equal(foreign.label, null);

  // An empty picker (a window with no data) still offers the "all" option.
  const empty = pickerFilter('riderId', 'Rider', 'All riders', new Map(), 'rider_1');
  assert.equal(empty.value, '');
  assert.equal(empty.control.options.length, 1);

  // ── Picker: sort:false preserves hierarchy order ───────────────────────────
  // A category tree is flattened depth-first and indented, so sorting the labels
  // alphabetically would tear children away from their parents.
  const TREE = new Map([
    ['Food & Beverages', 'Food & Beverages'],
    ['Coffee & Tea', '— Coffee & Tea'],
    ['Arabica', '—— Arabica'],
    ['Electronics', 'Electronics'],
  ]);
  const tree = pickerFilter('category', 'Category', 'All categories', TREE, 'Coffee & Tea', { sort: false });
  assert.deepEqual(
    tree.control.options.map((o) => o.label),
    ['All categories', 'Food & Beverages', '— Coffee & Tea', '—— Arabica', 'Electronics'],
    'insertion order survives, so children stay under their parent'
  );
  assert.equal(tree.value, 'Coffee & Tea', 'a category is selected by name, not by id');

  // Sorting still applies by default — the tree picker has to opt out.
  const sortedTree = pickerFilter('category', 'Category', 'All categories', TREE, '');
  assert.deepEqual(
    sortedTree.control.options.slice(1).map((o) => o.label),
    ['— Coffee & Tea', '—— Arabica', 'Electronics', 'Food & Beverages']
  );

  // ── Category entries: pruned to what sold, parents kept for their children ─
  // Only "Arabica" sold, three levels down. Its whole ancestry must stay
  // selectable (picking "Food & Beverages" has to mean the branch), while the
  // sibling branches that sold nothing drop out of the list entirely.
  const deep = categoryEntries(CATEGORIES, new Set(['Arabica']));
  assert.deepEqual(
    [...deep.entries()],
    [['Food & Beverages', 'Food & Beverages'], ['Coffee & Tea', '— Coffee & Tea'], ['Arabica', '—— Arabica']],
    'ancestors of a sold category survive, indented, in tree order'
  );
  assert.ok(!deep.has('Bakery'), 'a branch with no sales is not offered');
  assert.ok(!deep.has('Electronics'), 'an unrelated root with no sales is not offered');

  // Two branches selling ⇒ both roots offered, still depth-first.
  const wide = categoryEntries(CATEGORIES, new Set(['Bakery', 'Electronics']));
  assert.deepEqual([...wide.keys()], ['Food & Beverages', 'Bakery', 'Electronics']);

  // A free-text category with no Category row is still reachable from the filter.
  const orphan = categoryEntries(CATEGORIES, new Set(['Arabica', 'Legacy Imports']));
  assert.equal(orphan.get('Legacy Imports'), 'Legacy Imports', 'an unmapped category is appended flat');
  assert.equal([...orphan.keys()].at(-1), 'Legacy Imports', 'and it lands after the mapped tree');

  // Nothing sold ⇒ nothing to pick.
  assert.equal(categoryEntries(CATEGORIES, new Set()).size, 0);

  // ── Text filter: trimmed, length-capped, self-describing ───────────────────
  const text = textFilter('packageId', 'Package', 'Tracking ID', '  ord_AB12  ');
  assert.equal(text.value, 'ord_AB12');
  assert.equal(text.label, 'ord_AB12');
  assert.equal(text.control.kind, 'text');
  assert.equal(text.control.placeholder, 'Tracking ID');
  assert.equal(textFilter('packageId', 'Package', '', '   ').value, '', 'whitespace only ⇒ no filter');
  assert.equal(textFilter('packageId', 'Package', '', 'x'.repeat(500)).value.length, 100, 'capped at 100 chars');

  // ── Package lookup: forgiving about case, punctuation and prefixes ─────────
  assert.ok(idMatches('ord_ab12cd34', 'ord_ab12cd34'), 'the exact id matches');
  assert.ok(idMatches('ord_ab12cd34', 'AB12CD'), 'a fragment in the wrong case matches');
  assert.ok(idMatches('ord_ab12cd34', 'ord-AB12'), 'punctuation is ignored');
  assert.ok(idMatches('ord_ab12cd34', 'INV-AB12CD34'.replace('INV-', '')), 'an id copied off a document matches');
  assert.ok(!idMatches('ord_ab12cd34', 'zz99'), 'an unrelated id does not match');
  assert.ok(!idMatches('ord_ab12cd34', ''), 'an empty query never matches');
  assert.ok(!idMatches('ord_ab12cd34', '   '), 'a whitespace query never matches');
  assert.ok(!idMatches(null, 'ab12'), 'a missing id never matches');

  // ── Focus subtitle: only active filters appear ─────────────────────────────
  assert.equal(focusSubtitle([]), null);
  assert.equal(focusSubtitle([{ name: 'Store focus', label: null }]), null, 'inactive filters are dropped');
  assert.equal(
    focusSubtitle([
      { name: 'Store focus', label: 'Kigali Fresh Market' },
      { name: 'Product focus', label: null },
      { name: 'Rider focus', label: 'Jean B.' },
    ]),
    'Store focus · Kigali Fresh Market   |   Rider focus · Jean B.'
  );

  console.log('report filters: all checks passed');
}

run();
