export interface CategoryNodeRef {
  id: number;
  parentId: number | null;
}

/**
 * Returns the given category id plus every descendant id (any depth) in a
 * single pass. Parent/child relationships are expressed by each row's
 * `parentId`, so only the lightweight `id`/`parentId` columns are needed.
 *
 * The caller stays responsible for fetching the rows; this helper keeps the
 * descendant computation identical for menu and shop categories so the logic
 * is never duplicated across modules.
 */
export function collectCategoryAndDescendants(
  categories: CategoryNodeRef[],
  rootId: number,
): number[] {
  const childrenByParent = new Map<number, number[]>();
  for (const category of categories) {
    if (category.parentId === null || category.parentId === undefined) continue;
    const siblings = childrenByParent.get(category.parentId);
    if (siblings) {
      siblings.push(category.id);
    } else {
      childrenByParent.set(category.parentId, [category.id]);
    }
  }

  const ids = new Set<number>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const parent = stack.pop()!;
    for (const childId of childrenByParent.get(parent) ?? []) {
      if (ids.has(childId)) continue;
      ids.add(childId);
      stack.push(childId);
    }
  }

  return [...ids];
}
