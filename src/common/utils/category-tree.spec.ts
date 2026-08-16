import { collectCategoryAndDescendants } from './category-tree';

describe('collectCategoryAndDescendants', () => {
  it('returns the root id when it has no children', () => {
    const categories = [
      { id: 1, parentId: null },
      { id: 2, parentId: 1 },
    ];

    expect(collectCategoryAndDescendants(categories, 2).sort()).toEqual([2]);
  });

  it('collects direct children', () => {
    const categories = [
      { id: 1, parentId: null },
      { id: 2, parentId: 1 },
      { id: 3, parentId: 1 },
      { id: 4, parentId: 2 },
    ];

    expect(collectCategoryAndDescendants(categories, 1).sort()).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('collects descendants at arbitrary depth (grandchildren)', () => {
    const categories = [
      { id: 1, parentId: null }, // Food
      { id: 2, parentId: 1 }, // Pizza
      { id: 3, parentId: 2 }, // Italian Pizza
      { id: 4, parentId: 2 }, // American Pizza
      { id: 5, parentId: 1 }, // Burgers
      { id: 6, parentId: 5 }, // Double Smash
    ];

    expect(collectCategoryAndDescendants(categories, 1).sort()).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(collectCategoryAndDescendants(categories, 2).sort()).toEqual([
      2, 3, 4,
    ]);
  });

  it('ignores children whose parent is not in the returned set', () => {
    const categories = [
      { id: 1, parentId: null },
      { id: 2, parentId: 10 },
    ];

    expect(collectCategoryAndDescendants(categories, 1)).toEqual([1]);
  });

  it('handles rows with undefined parentId as roots', () => {
    const categories = [
      { id: 1, parentId: undefined as never },
      { id: 2, parentId: 1 },
    ];

    expect(collectCategoryAndDescendants(categories, 1).sort()).toEqual([1, 2]);
  });
});
