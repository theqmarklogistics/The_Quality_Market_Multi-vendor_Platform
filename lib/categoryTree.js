// Category tree helpers. Categories nest up to MAX_CATEGORY_DEPTH levels
// (category → subcategory → sub-subcategory) via Category.parentId; products
// reference their category by NAME, so names are globally unique and filtering
// by a parent means matching the whole descendant name set.
//
// Pure functions (server + client safe) over flat rows [{ id, name, parentId, sortOrder }].

export const MAX_CATEGORY_DEPTH = 3;

const bySort = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name));

/** Nested tree: roots (parentId null) with recursive `children`, sibling-sorted. */
export function buildCategoryTree(rows = []) {
    const byParent = new Map();
    for (const r of rows) {
        const key = r.parentId || null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(r);
    }
    const attach = (node) => ({
        ...node,
        children: (byParent.get(node.id) || []).sort(bySort).map(attach),
    });
    return (byParent.get(null) || []).sort(bySort).map(attach);
}

/** Depth of a category (1 = root). Broken parent links count as roots. */
export function categoryDepth(id, rows = []) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    let depth = 1;
    let cur = byId.get(id);
    const seen = new Set();
    while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.parentId)) {
        seen.add(cur.id);
        cur = byId.get(cur.parentId);
        depth += 1;
    }
    return depth;
}

/** Height of the subtree rooted at `id` (1 = leaf). */
export function subtreeHeight(id, rows = []) {
    const children = rows.filter((r) => r.parentId === id);
    if (!children.length) return 1;
    return 1 + Math.max(...children.map((c) => subtreeHeight(c.id, rows)));
}

/** True when `candidateId` is `id` itself or one of its descendants. */
export function isSelfOrDescendant(id, candidateId, rows = []) {
    if (id === candidateId) return true;
    const children = rows.filter((r) => r.parentId === id);
    return children.some((c) => isSelfOrDescendant(c.id, candidateId, rows));
}

/**
 * All category NAMES covered by selecting `name` — itself plus every
 * descendant. Used to filter products (Product.category is a name string), so
 * picking a parent shows its whole subtree's products.
 */
export function categoryNamesWithDescendants(name, rows = []) {
    const root = rows.find((r) => r.name === name);
    if (!root) return [name];
    const out = [];
    const walk = (node) => {
        out.push(node.name);
        rows.filter((r) => r.parentId === node.id).forEach(walk);
    };
    walk(root);
    return out;
}

/**
 * Flatten the tree depth-first into picker options:
 * [{ id, name, parentId, depth, label }] where label is the name indented with
 * "— " per level (e.g. "— Phones", "—— Smartphones").
 */
export function flattenCategoryOptions(rows = []) {
    const out = [];
    const walk = (nodes, depth) => {
        for (const n of nodes) {
            out.push({ id: n.id, name: n.name, parentId: n.parentId ?? null, depth, label: depth > 1 ? `${'—'.repeat(depth - 1)} ${n.name}` : n.name });
            walk(n.children || [], depth + 1);
        }
    };
    walk(buildCategoryTree(rows), 1);
    return out;
}
