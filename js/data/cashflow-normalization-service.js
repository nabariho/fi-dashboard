// === CASHFLOW NORMALIZATION SERVICE ===
// Backward-compatible migration for legacy cashflow entries.
// Produces normalized category/subcategory IDs while preserving labels.

var CashflowNormalizationService = (function() {
  function clone(obj) {
    return Object.assign({}, obj);
  }

  function buildEntryId(month, type, categoryId, subcategoryId) {
    var id = month + '_' + type + '_' + (categoryId || 'uncategorized');
    if (subcategoryId) id += '_' + subcategoryId;
    return id;
  }

  function normalizeDataset(data) {
    var input = data || {};
    var categories = (input.cashflowCategories || []).map(clone);
    var subcategories = (input.cashflowSubcategories || []).map(clone);
    var entries = (input.cashflowEntries || []).map(clone);
    var changed = false;

    if (typeof CashflowTaxonomyService !== 'undefined') {
      categories = CashflowTaxonomyService.ensureDefaultIncomeCategories(categories);
    }

    var categoryById = {};
    categories.forEach(function(c) { if (c.category_id) categoryById[c.category_id] = c; });

    function ensureCategory(type, name) {
      var existing = CashflowTaxonomyService.findCategoryByName(type, name, categories);
      if (existing) return existing;
      var created = CashflowTaxonomyService.createCategory(type, name, categories);
      categories.push(created);
      categoryById[created.category_id] = created;
      changed = true;
      return created;
    }

    function ensureSubcategory(categoryId, name) {
      var existing = CashflowTaxonomyService.findSubcategoryByName(categoryId, name, subcategories);
      if (existing) return existing;
      var created = CashflowTaxonomyService.createSubcategory(categoryId, name, subcategories);
      subcategories.push(created);
      changed = true;
      return created;
    }

    var usedEntryIds = {};
    function ensureUniqueEntryId(baseId) {
      var id = baseId;
      var n = 2;
      while (usedEntryIds[id]) {
        id = baseId + '__' + n;
        n++;
      }
      usedEntryIds[id] = true;
      return id;
    }

    var normalizedEntries = entries.map(function(entry) {
      var row = clone(entry);
      var type = row.type === 'income' ? 'income' : 'expense';
      var categoryId = row.category_id;
      var categoryName = row.category ? CashflowTaxonomyService.titleCase(row.category) : '';
      var categoryRow = categoryId ? categoryById[categoryId] : null;

      if (!categoryRow) {
        categoryRow = ensureCategory(type, categoryName || 'Other');
        categoryId = categoryRow.category_id;
      } else if (categoryRow.type !== type) {
        categoryRow = ensureCategory(type, categoryName || categoryRow.name || 'Other');
        categoryId = categoryRow.category_id;
      }

      row.category_id = categoryId;
      row.category = categoryRow.name;

      if (type === 'expense') {
        var subcategoryId = row.subcategory_id || null;
        var subcategoryName = row.subcategory ? CashflowTaxonomyService.titleCase(row.subcategory) : '';

        if (subcategoryId) {
          var existingSub = subcategories.find(function(s) { return s.subcategory_id === subcategoryId; });
          if (!existingSub || existingSub.category_id !== categoryId) {
            subcategoryId = null;
          }
        }

        if (!subcategoryId && subcategoryName) {
          var sub = ensureSubcategory(categoryId, subcategoryName);
          subcategoryId = sub.subcategory_id;
          row.subcategory = sub.name;
        } else if (subcategoryId) {
          var subRow = subcategories.find(function(s) { return s.subcategory_id === subcategoryId; });
          row.subcategory = subRow ? subRow.name : '';
        } else {
          row.subcategory = '';
        }

        row.subcategory_id = subcategoryId || null;
      } else {
        row.subcategory_id = null;
        row.subcategory = '';
      }

      var baseId = buildEntryId(row.month, row.type, row.category_id, row.subcategory_id);
      var nextId = ensureUniqueEntryId(baseId);
      if (row.entry_id !== nextId) changed = true;
      row.entry_id = nextId;
      return row;
    });

    var usedCategoryIds = {};
    normalizedEntries.forEach(function(e) { usedCategoryIds[e.category_id] = true; });

    categories = categories.map(function(c) {
      var category = clone(c);
      if (typeof category.active === 'undefined') category.active = true;
      if (typeof category.sort_order === 'undefined') category.sort_order = 0;
      return category;
    }).sort(function(a, b) {
      if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
      return (a.name || '').localeCompare(b.name || '');
    });

    subcategories = subcategories.map(function(s) {
      var sub = clone(s);
      if (typeof sub.active === 'undefined') sub.active = true;
      if (typeof sub.sort_order === 'undefined') sub.sort_order = 0;
      return sub;
    }).filter(function(s) {
      return !!usedCategoryIds[s.category_id];
    }).sort(function(a, b) {
      if (a.category_id !== b.category_id) return a.category_id.localeCompare(b.category_id);
      if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
      return (a.name || '').localeCompare(b.name || '');
    });

    normalizedEntries.sort(function(a, b) {
      if (a.month !== b.month) return a.month > b.month ? -1 : 1;
      return (a.entry_id || '').localeCompare(b.entry_id || '');
    });

    return {
      categories: categories,
      subcategories: subcategories,
      entries: normalizedEntries,
      changed: changed
    };
  }

  return {
    normalizeDataset: normalizeDataset,
    buildEntryId: buildEntryId
  };
})();
