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

**Solution:** Store the last 5–10 versions in an IndexedDB `backups` store with timestamps. Add a "Restore from backup" option in the Admin page that lists available snapshots and lets the user preview before restoring.

**Trigger:** Complements version history (item 1).

---

## 3. Multi-Device Conflict Detection

**Problem (file mode):** Last-write-wins with no conflict detection. If the user edits on laptop, then edits on iPad before iCloud syncs the laptop's changes, one set of changes is silently lost.

**Solution:** Add a `last_modified` timestamp and `device_id` to the .fjson on every save. On load (including Refresh), compare the file's `last_modified` against the cached version. If the file was modified by a different device since the last load, warn the user: "This file was updated on [device] at [time]. Load the newer version or keep your local changes?" This doesn't merge — it just prevents silent overwrites.

**Note:** In DB mode, Supabase handles this via `updated_at` timestamps and the diff-based save in StorageManager. Per-record upserts mean non-conflicting edits to different records merge naturally. True conflicts (same record edited on two devices before sync) still use last-write-wins.

**Trigger:** User starts actively editing from multiple devices in the same day.

---

## ~~4. Avoid File Picker on Save (Chrome without Handle)~~ ✓ Resolved

Resolved by persisting a directory handle in IDB. On Chrome, users pick a save folder once via `showDirectoryPicker()`, and subsequent saves write there silently. The handle survives across sessions.

---

## ~~5. Multi-Device File Path Sync (Safari/iOS)~~ Largely resolved by DB mode

**Original problem:** On Safari/iOS there is no File System Access API. Every save triggers a manual "Save to Files" flow.

**Resolution:** DB mode (Supabase) eliminates the need for file-based sync entirely. Data syncs via HTTPS to the database, works identically on all browsers and devices. File mode remains available as a fallback but is no longer the primary workflow.

**Remaining gap:** File mode on Safari/iOS still has the same limitation if the user prefers local-only storage.

---

## 6. Unify Goals with Milestones Framework

**Problem:** The Emergency Fund and House Down Payment goals are hardcoded in `goals-calc.js` and `ui-goals.js` — specific account IDs (TRADE_REPUBLIC, BBVA, ARRAS, BANKINTER), custom status logic (green/yellow/red), and bespoke rendering with action items and surplus suggestions. Meanwhile, the new milestone system (Phase 3) is generic and data-driven. Having two parallel systems creates duplication and makes it harder to add new goals.

**Current state:**
- `goals-calc.js`: hardcoded `computeEmergencyFund()` and `computeHouseDownPayment()` with specific account IDs
- `ui-goals.js`: `renderGoalsPanel()` and `renderGoalsDetail()` have ~200 lines of hardcoded HTML for these two goals, including account-specific explanations, surplus reallocation suggestions, and action items
- `milestone-calc.js`: generic milestone calculator with sub-targets, glide paths, and status
- Admin: milestones are editable via CRUD; emergency/house targets are config values only

**Solution:** Migrate goals into the milestone framework in stages:
1. **Data migration**: Represent Emergency Fund and House Down Payment as milestones with sub-targets. Each goal becomes a milestone (or sub-target of a broader milestone). The account-to-goal mapping moves from hardcoded IDs to a configurable `goal_accounts` field in the milestone or account config.
2. **Calculator unification**: Replace `goals-calc.js` with milestone-calc extensions. The custom status logic (green = dedicated covers target, yellow = combined covers it) becomes configurable rules on the goal, not hardcoded per-goal functions.
3. **Renderer unification**: Replace the bespoke goals HTML with the generic milestone card renderer. Keep the detailed breakdown (account contributions, surplus suggestions, action items) as optional "detail mode" for goals that have account-level attribution.
4. **Admin unification**: Goals become editable milestones in the Milestones tab, with an additional "linked accounts" config per sub-target.

**Risks:**
- The current Emergency Fund rendering has nuanced UX (three-tier status, surplus reallocation suggestions, action items) that a generic milestone card doesn't replicate. Need to ensure the unified system can handle goal-specific detail views.
- Account-to-goal mapping is currently implicit (hardcoded). Making it configurable requires a data migration path for existing users.

**Trigger:** When adding a third goal type, or when the hardcoded account IDs need to change.
