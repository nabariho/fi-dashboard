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

**Problem:** Last-write-wins with no conflict detection. If the user edits on laptop, then edits on iPad before iCloud syncs the laptop's changes, one set of changes is silently lost.

**Solution:** Add a `last_modified` timestamp and `device_id` to the .fjson on every save. On load (including Refresh), compare the file's `last_modified` against the cached version. If the file was modified by a different device since the last load, warn the user: "This file was updated on [device] at [time]. Load the newer version or keep your local changes?" This doesn't merge — it just prevents silent overwrites.

**Trigger:** User starts actively editing from multiple devices in the same day.

---

## 4. Avoid File Picker on Save (Chrome without Handle)

**Problem:** On Chrome, if the session was restored from IDB (no file handle), `FileManager.save()` falls through to `_saveWithPicker()`, which opens a save-file dialog the user can cancel. The data is safe in IDB, but the UX is confusing — the user didn't ask for a picker, and the cancel path is error-prone.

**Solution:** When there's no `_handle` and File System Access is available, treat it the same as Safari: skip the picker entirely and only trigger a download if `auto_export` is enabled. Reserve the file picker for the explicit "open" flow that establishes a handle. Alternatively, persist the handle via IDB (handles are serializable with `idb-keyval`) so restored sessions can write back silently.

**Trigger:** Current implementation — revisit when polishing the save flow.
