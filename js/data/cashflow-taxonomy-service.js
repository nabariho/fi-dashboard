// === CASHFLOW TAXONOMY SERVICE ===
// Manages category/subcategory structures and validation.
// Pure data operations, no DOM access.

var CashflowTaxonomyService = (function() {
  var DEFAULT_INCOME = ['Salary', 'Bonus', 'Other'];

  function slugify(str) {
    return (str || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  function titleCase(str) {
    return (str || '').trim().replace(/\w\S*/g, function(txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  }

  function clone(obj) {
    return Object.assign({}, obj);
  }

  function ensureUniqueId(baseId, existingIds) {
    var id = baseId || 'item';
    var n = 2;
    while (existingIds[id]) {
      id = baseId + '_' + n;
      n++;
    }
    return id;
  }

  function indexById(rows, key) {
    var map = {};
    (rows || []).forEach(function(r) {
      if (r && r[key]) map[r[key]] = r;
    });
    return map;
  }

  function findCategoryByName(type, name, categories) {
    var normalizedName = titleCase(name);
    return (categories || []).find(function(c) {
      return c.type === type && titleCase(c.name) === normalizedName;
    }) || null;
  }

  function findSubcategoryByName(categoryId, name, subcategories) {
    var normalizedName = titleCase(name);
    return (subcategories || []).find(function(s) {
      return s.category_id === categoryId && titleCase(s.name) === normalizedName;
    }) || null;
  }

  function createCategory(type, name, categories) {
    var rows = categories || [];
    var normalizedName = titleCase(name || 'Other');
    var existing = findCategoryByName(type, normalizedName, rows);
    if (existing) return clone(existing);

    var ids = indexById(rows, 'category_id');
    var baseId = (type === 'income' ? 'income_' : 'expense_') + slugify(normalizedName || 'other');
    var categoryId = ensureUniqueId(baseId, ids);

    var maxOrder = rows.reduce(function(max, r) {
      return Math.max(max, r.sort_order || 0);
    }, 0);

    return {
      category_id: categoryId,
      type: type,
      name: normalizedName,
      active: true,
      sort_order: maxOrder + 1,
      classification: type === 'expense' ? 'spending' : null
    };
  }

  function createSubcategory(categoryId, name, subcategories) {
    var rows = subcategories || [];
    var normalizedName = titleCase(name || 'Other');
    var existing = findSubcategoryByName(categoryId, normalizedName, rows);
    if (existing) return clone(existing);

    var ids = indexById(rows, 'subcategory_id');
    var baseId = categoryId + '_' + slugify(normalizedName || 'other');
    var subcategoryId = ensureUniqueId(baseId, ids);
    var maxOrder = rows.reduce(function(max, r) {
      return Math.max(max, r.sort_order || 0);
    }, 0);

    return {
      subcategory_id: subcategoryId,
      category_id: categoryId,
      name: normalizedName,
      active: true,
      sort_order: maxOrder + 1
    };
  }

  function getCategoriesForType(categories, type, includeInactive) {
    return (categories || [])
      .filter(function(c) { return c.type === type && (includeInactive || c.active !== false); })
      .slice()
      .sort(function(a, b) {
        if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
        return (a.name || '').localeCompare(b.name || '');
      });
  }

  function getSubcategoriesForCategory(subcategories, categoryId, includeInactive) {
    return (subcategories || [])
      .filter(function(s) { return s.category_id === categoryId && (includeInactive || s.active !== false); })
      .slice()
      .sort(function(a, b) {
        if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
        return (a.name || '').localeCompare(b.name || '');
      });
  }

  function resolveCategoryName(categoryId, categories, fallback) {
    var category = (categories || []).find(function(c) { return c.category_id === categoryId; });
    return category ? category.name : (fallback || categoryId || 'Uncategorized');
  }

  function resolveSubcategoryName(subcategoryId, subcategories, fallback) {
    var sub = (subcategories || []).find(function(s) { return s.subcategory_id === subcategoryId; });
    return sub ? sub.name : (fallback || '');
  }

  function ensureDefaultIncomeCategories(categories) {
    var out = (categories || []).slice();
    DEFAULT_INCOME.forEach(function(name) {
      if (!findCategoryByName('income', name, out)) {
        out.push(createCategory('income', name, out));
      }
    });
    return out;
  }

  function validate(categories, subcategories) {
    var errors = [];
    var categoryIds = {};
    var categoryNameKeys = {};
    var subcategoryIds = {};
    var subcategoryNameKeys = {};

    (categories || []).forEach(function(c) {
      if (!c.category_id) errors.push('Cashflow categories: missing category_id.');
      if (categoryIds[c.category_id]) errors.push('Cashflow categories: duplicate category_id "' + c.category_id + '".');
      categoryIds[c.category_id] = true;
      if (c.type !== 'income' && c.type !== 'expense') {
        errors.push('Cashflow categories: "' + c.category_id + '" type must be income or expense.');
      }
      if (!c.name) errors.push('Cashflow categories: "' + c.category_id + '" missing name.');
      if (c.type === 'expense' && c.classification && c.classification !== 'spending' && c.classification !== 'transfer') {
        errors.push('Cashflow categories: "' + c.category_id + '" classification must be "spending" or "transfer".');
      }
      var key = (c.type || '') + '|' + titleCase(c.name || '');
      if (categoryNameKeys[key]) errors.push('Cashflow categories: duplicate name "' + c.name + '" for type "' + c.type + '".');
      categoryNameKeys[key] = true;
    });

    (subcategories || []).forEach(function(s) {
      if (!s.subcategory_id) errors.push('Cashflow subcategories: missing subcategory_id.');
      if (subcategoryIds[s.subcategory_id]) errors.push('Cashflow subcategories: duplicate subcategory_id "' + s.subcategory_id + '".');
      subcategoryIds[s.subcategory_id] = true;
      if (!s.category_id) errors.push('Cashflow subcategories: "' + s.subcategory_id + '" missing category_id.');
      if (s.category_id && !categoryIds[s.category_id]) {
        errors.push('Cashflow subcategories: "' + s.subcategory_id + '" references unknown category "' + s.category_id + '".');
      }
      if (!s.name) errors.push('Cashflow subcategories: "' + s.subcategory_id + '" missing name.');
      var key = (s.category_id || '') + '|' + titleCase(s.name || '');
      if (subcategoryNameKeys[key]) {
        errors.push('Cashflow subcategories: duplicate name "' + s.name + '" in category "' + s.category_id + '".');
      }
      subcategoryNameKeys[key] = true;
    });

    return errors;
  }

  return {
    slugify: slugify,
    titleCase: titleCase,
    createCategory: createCategory,
    createSubcategory: createSubcategory,
    findCategoryByName: findCategoryByName,
    findSubcategoryByName: findSubcategoryByName,
    getCategoriesForType: getCategoriesForType,
    getSubcategoriesForCategory: getSubcategoriesForCategory,
    resolveCategoryName: resolveCategoryName,
    resolveSubcategoryName: resolveSubcategoryName,
    ensureDefaultIncomeCategories: ensureDefaultIncomeCategories,
    validate: validate
  };
})();
