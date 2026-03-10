# Bankinter Data Validation Report

**Date:** 2026-03-10
**Scope:** All 14 months (2025-01 to 2026-02)
**Sources:** 14 card PDFs + 2 account XLSX files vs `cashflow_import.json`

---

## Summary

**9 of 14 months match perfectly** between Bankinter source files and `cashflow_import.json`.
**5 months have minor discrepancies** totaling 23.70 EUR, all related to card commission handling.
**All income amounts match exactly** across all 14 months.

**Supabase data validated:** All 14 months match `cashflow_import.json` exactly (0.00 EUR total discrepancy).

---

## Month-by-Month Results

| Month | Income | Expense (Import) | Expense (Fresh) | Diff | Status |
|-------|--------|-------------------|-----------------|------|--------|
| 2025-01 | 3,654.59 | 4,287.03 | 4,287.03 | 0.00 | OK |
| 2025-02 | 3,787.59 | 9,942.87 | 9,942.87 | 0.00 | OK |
| 2025-03 | 3,796.59 | 3,122.02 | 3,122.02 | 0.00 | OK |
| 2025-04 | 3,637.59 | 3,425.96 | 3,425.96 | 0.00 | OK |
| 2025-05 | 3,647.59 | 3,704.78 | 3,704.78 | 0.00 | OK |
| 2025-06 | 4,969.68 | 4,006.19 | 4,005.08 | -1.11 | MINOR |
| 2025-07 | 6,799.80 | 3,722.04 | 3,721.74 | -0.30 | MINOR |
| 2025-08 | 3,644.56 | 6,831.45 | 6,827.43 | -4.02 | MINOR |
| 2025-09 | 4,167.56 | 36,383.86 | 36,383.86 | 0.00 | OK |
| 2025-10 | 3,641.56 | 3,871.97 | 3,871.97 | 0.00 | OK |
| 2025-11 | 3,584.56 | 2,115.91 | 2,104.09 | -11.82 | MINOR |
| 2025-12 | 3,783.01 | 8,297.81 | 8,291.36 | -6.45 | MINOR |
| 2026-01 | 4,190.04 | 2,495.56 | 2,495.56 | 0.00 | OK |
| 2026-02 | 4,049.61 | 3,980.22 | 3,980.22 | 0.00 | OK |

---

## Discrepancy Details

All 5 discrepancies are caused by **card commissions** ("COM. USO REDES INTERNACION." and "Comisión mantenimiento") appearing in a separate section of the card PDFs. The existing import JSON includes these commissions attributed to the merchant's category; the fresh parse currently skips them as a separate transaction type.

### 2025-06: -1.11 EUR
- Bank Fees: import has 4.01, fresh has 3.20 (diff: 0.81 from HumbleBundle intl fee)
- Subscriptions/Gamma: import has 10.30, fresh has 10.00 (diff: 0.30 intl fee)

### 2025-07: -0.30 EUR
- Subscriptions/Gamma: import has 10.30, fresh has 10.00 (diff: 0.30 intl fee)

### 2025-08: -4.02 EUR
- Shopping/Amazon: import has 236.23, fresh has 232.51 (diff: 3.72 from two Amazon intl fees 1.85+1.87)
- Subscriptions/Gamma: import has 10.30, fresh has 10.00 (diff: 0.30 intl fee)

### 2025-11: -11.82 EUR
- Bank Fees: import has 11.82, fresh has 0.00 (1.08 USCUSTOMSBO fee + 10.74 Broadway/NYC fee)

### 2025-12: -6.45 EUR
- Bank Fees: import has 6.45, fresh has 0.00 (HarvBusRev intl fee)

**Root cause:** The `import_bankinter.py` script's `parse_card_pdf()` successfully extracts commission rows from the PDF tables (they appear as regular rows with dates). The commissions then get categorized by the merchant pattern in the concept field. This is correct behavior — commissions ARE real expenses. The fresh validation script erroneously skipped them. **The import JSON is correct.**

---

## cashflow_import.json vs cashflow_import_2025.json

December 2025 shows a 796.52 EUR difference between the two files:
- `cashflow_import.json`: 8,297.81 EUR expenses
- `cashflow_import_2025.json`: 7,501.29 EUR expenses

**Cause:** The unified `import_bankinter.py` processes ALL card PDFs (including Jan 2026), so it correctly captures late-December transactions that appear in the January 2026 billing statement:
- 27/12: UBER 35.83
- 29/12: EL RINCON DE TRIANA 105.60
- 29/12: TICKETMASTER 165.20
- 29/12: EL CORTE INGLES 106.40
- 30/12: EL CORTE INGLES 83.49
- 30/12: REVOLUT 300.00

The `import_bankinter_2025.py` only processed 2025 PDFs, missing these transactions.
Additionally, `cashflow_import_2025.json` lacks subcategory granularity (no Hiperdino/Mercadona/Spar split, no Dining Out/Cafes/Fast Food split, etc.).

**Recommendation:** Use `cashflow_import.json` as the source of truth. The `cashflow_import_2025.json` is obsolete.

---

## Categorization Spot-Checks

Verified against PDFs:
- Salary amounts match XLSX exactly across all months
- Bizum income captured correctly from XLSX
- June 2025 tax refund (217.99) captured correctly
- July 2025 double salary (6,747.61 = extra pay) captured correctly
- September 2025 Trade Republic 32,000 transfer captured correctly
- All ANUL. (refund) entries correctly reduce category totals
- Revolut top-ups correctly classified as Shopping/Revolut (transfer)
- Investment transfers (Indexa, IBKR, Trade Republic) correctly classified as Investing (transfer)
- Donations (AECC 10/mo, Amnistia 6/mo, Cruz Roja 6/mo) consistent across months
- Housing rent (575) vs electricity (variable) split correctly by amount threshold

---

## Supabase Validation (2026-03-10)

Queried all cashflow entries from Supabase via MCP tools for each of the 14 months and computed income/expense totals.

| Month | Expected Inc | Supabase Inc | Expected Exp | Supabase Exp | Status |
|-------|-------------|-------------|-------------|-------------|--------|
| 2025-01 | 3,654.59 | 3,654.59 | 4,287.03 | 4,287.03 | PASS |
| 2025-02 | 3,787.59 | 3,787.59 | 9,942.87 | 9,942.87 | PASS |
| 2025-03 | 3,796.59 | 3,796.59 | 3,122.02 | 3,122.02 | PASS |
| 2025-04 | 3,637.59 | 3,637.59 | 3,425.96 | 3,425.96 | PASS |
| 2025-05 | 3,647.59 | 3,647.59 | 3,704.78 | 3,704.78 | PASS |
| 2025-06 | 4,969.68 | 4,969.68 | 4,006.19 | 4,006.19 | PASS |
| 2025-07 | 6,799.80 | 6,799.80 | 3,722.04 | 3,722.04 | PASS |
| 2025-08 | 3,644.56 | 3,644.56 | 6,831.45 | 6,831.45 | PASS |
| 2025-09 | 4,167.56 | 4,167.56 | 36,383.86 | 36,383.86 | PASS |
| 2025-10 | 3,641.56 | 3,641.56 | 3,871.97 | 3,871.97 | PASS |
| 2025-11 | 3,584.56 | 3,584.56 | 2,115.91 | 2,115.91 | PASS |
| 2025-12 | 3,783.01 | 3,783.01 | 8,297.81 | 8,297.81 | PASS |
| 2026-01 | 4,190.04 | 4,190.04 | 2,495.56 | 2,495.56 | PASS |
| 2026-02 | 4,049.61 | 4,049.61 | 3,980.22 | 3,980.22 | PASS |

**Result: 14/14 months PASS. Zero discrepancies.** All income and expense totals in Supabase match `cashflow_import.json` to the cent.

---

## Pending Items

- [ ] March 2026 card PDF not yet available
- [ ] Delete or archive `cashflow_import_2025.json` (obsolete)
