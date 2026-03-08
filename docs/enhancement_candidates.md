# Enhancement Candidates

Future improvements tracked here. These are known gaps accepted as edge cases for now.

---

## 1. Version History in File

**Problem:** If a user accidentally deletes data and saves, the only recovery is finding a backup file in Downloads.

**Solution:** Store a version counter + last-modified timestamp inside the .fjson. On each save, increment the version. Keep the last N snapshots embedded in the file (or as a separate IDB store) so the user can roll back without hunting for downloaded backups.

**Trigger:** User reports accidental data loss.

---

## 2. Auto-Backup to IndexedDB

**Problem:** Backup files are downloaded to the Downloads folder on every save. They pile up, are hard to find, and don't exist on devices where no save was performed.

**Solution:** Store the last 5-10 versions in an IndexedDB `backups` store with timestamps. Add a "Restore from backup" option in the Admin page that lists available snapshots and lets the user preview before restoring.

**Trigger:** Complements version history (item 1).

---

## 3. Multi-Device Conflict Detection

**Problem (file mode):** Last-write-wins with no conflict detection. If the user edits on laptop, then edits on iPad before iCloud syncs the laptop's changes, one set of changes is silently lost.

**Solution:** Add a `last_modified` timestamp and `device_id` to the .fjson on every save. On load (including Refresh), compare the file's `last_modified` against the cached version. If the file was modified by a different device since the last load, warn the user: "This file was updated on [device] at [time]. Load the newer version or keep your local changes?" This doesn't merge -- it just prevents silent overwrites.

**Note:** In DB mode, Supabase handles this via `updated_at` timestamps and the diff-based save in StorageManager. Per-record upserts mean non-conflicting edits to different records merge naturally. True conflicts (same record edited on two devices before sync) still use last-write-wins.

**Trigger:** User starts actively editing from multiple devices in the same day.

---

## ~~4. Avoid File Picker on Save (Chrome without Handle)~~ Resolved

Resolved by persisting a directory handle in IDB. On Chrome, users pick a save folder once via `showDirectoryPicker()`, and subsequent saves write there silently. The handle survives across sessions.

---

## ~~5. Multi-Device File Path Sync (Safari/iOS)~~ Largely resolved by DB mode

**Original problem:** On Safari/iOS there is no File System Access API. Every save triggers a manual "Save to Files" flow.

**Resolution:** DB mode (Supabase) eliminates the need for file-based sync entirely. Data syncs via HTTPS to the database, works identically on all browsers and devices. File mode remains available as a fallback but is no longer the primary workflow.

**Remaining gap:** File mode on Safari/iOS still has the same limitation if the user prefers local-only storage.

---

## ~~6. Unify Goals with Milestones Framework~~ Being resolved in Phase 9

**Original problem:** Emergency Fund and House Down Payment goals were hardcoded with specific account IDs in `goals-calc.js`.

**Partial resolution:** Emergency fund account roles are now configurable via `emergency_fund_role` field on each account. The Planning tab provides generic goal tracking with priority-based allocation.

**Full resolution (Phase 9a):** Removing `goals-calc.js` entirely. Goals Panel, Emergency Fund tab, and milestones all read from the unified planner output. See `docs/phase9-unified-goal-system.md`.

---

## 7. Benchmark Tracking (Phase 2c)

**Problem:** No way to compare portfolio returns against market benchmarks (e.g., MSCI World, S&P 500).

**Solution:** Add a `benchmarks` data structure for manual entry of monthly benchmark returns. Render as dashed lines on the returns chart. Add a Benchmarks section in the Admin page.

**Trigger:** When the user wants to evaluate their portfolio manager's performance vs passive index.

---

## 8. Historical Emergency Fund Chart with Target Changes

**Problem:** The emergency fund history chart shows a flat target line based on the current target value. If the target has changed over time, the historical view is misleading.

**Solution:** Store target history (or derive from config snapshots). Show the target line changing over time on the funding history chart.

**Trigger:** User changes their emergency fund target significantly.
