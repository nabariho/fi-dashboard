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

## ~~4. Avoid File Picker on Save (Chrome without Handle)~~ ✓ Resolved

Resolved by persisting a directory handle in IDB. On Chrome, users pick a save folder once via `showDirectoryPicker()`, and subsequent saves write there silently. The handle survives across sessions.

---

## 5. Multi-Device File Path Sync (Safari/iOS)

**Problem:** On Safari/iOS there is no File System Access API. Every save with `auto_export` triggers a download, and the user must manually tap "Save to Files" → pick iCloud Drive each time. There's no way to remember a save location.

**Solution:** Research options: (a) Origin Private File System (OPFS) — available in Safari 15.2+ but sandboxed, not visible in Files app; (b) Web Share Target API — could allow the app to receive files shared from Files app; (c) PWA with file handling — `file_handlers` manifest field (not yet in Safari). Most likely this remains a Safari platform limitation until Apple adds directory picker support.

**Trigger:** User finds the manual "Save to Files" flow too painful on iOS.
