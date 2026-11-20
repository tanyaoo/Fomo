'use strict';
const fs = require('node:fs');
const path = require('node:path');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function migrateLegacyProfile({ appData, target, legacyName = 'Memo Flow', legacyNames = null }) {
  const names = legacyNames || [legacyName];
  const candidates = names.map(name => path.join(appData, name));
  const legacy = candidates.find(directory => fs.existsSync(path.join(directory, 'data', 'state.json')) || fs.existsSync(path.join(directory, 'storage-location.json'))) || candidates[0];
  if (fs.existsSync(path.join(target, 'data', 'state.json'))) return { directory: target, migrated: false };
  const hasData = fs.existsSync(path.join(legacy, 'data', 'state.json'));
  const hasLocation = fs.existsSync(path.join(legacy, 'storage-location.json'));
  if (!hasData && !hasLocation) return { directory: target, migrated: false };
  try {
    fs.mkdirSync(target, { recursive: true });
    for (const name of ['data', 'backups', 'Local Storage', 'Session Storage']) {
      const source = path.join(legacy, name), destination = path.join(target, name);
      if (fs.existsSync(source) && !fs.existsSync(destination)) fs.cpSync(source, destination, { recursive: true, force: false, errorOnExist: false });
    }
    for (const name of ['storage-location.json', 'window.json', 'ai-settings.json', 'preferences.json', 'backup-history.json', 'compose-window.json']) {
      const source = path.join(legacy, name), destination = path.join(target, name);
      if (fs.existsSync(source) && !fs.existsSync(destination)) fs.copyFileSync(source, destination);
    }
    return { directory: target, migrated: true };
  } catch (error) {
    return { directory: legacy, migrated: false, error };
  }
}

// Chromium binds safeStorage ciphertext to the per-profile os_crypt key in
// Local State. Older Fomo builds copied ai-settings.json without this file, so
// an otherwise valid API Key became unreadable in the renamed profile. Adopt
// the legacy os_crypt section only when the saved ciphertext is demonstrably
// the same key that was copied from the legacy profile.
function adoptLegacyCryptKey({ appData, target, legacyName = 'Memo Flow', legacyNames = null }) {
  const names = legacyNames || [legacyName];
  const candidates = names.map(name => path.join(appData, name)).filter(directory => directory !== target);
  const targetSettings = readJson(path.join(target, 'ai-settings.json'));
  const targetState = readJson(path.join(target, 'Local State'));
  if (!targetSettings?.encryptedKey || !targetState?.os_crypt?.encrypted_key) return { migrated: false, reason: 'target-not-eligible' };
  for (const legacy of candidates) {
    const legacySettings = readJson(path.join(legacy, 'ai-settings.json'));
    const legacyState = readJson(path.join(legacy, 'Local State'));
    if (legacySettings?.encryptedKey !== targetSettings.encryptedKey || !legacyState?.os_crypt?.encrypted_key) continue;
    if (legacyState.os_crypt.encrypted_key === targetState.os_crypt.encrypted_key) return { migrated: false, reason: 'already-adopted' };
    try {
      const localStateFile = path.join(target, 'Local State');
      const backup = path.join(target, 'Local State.before-crypt-migration');
      if (!fs.existsSync(backup)) fs.copyFileSync(localStateFile, backup);
      fs.writeFileSync(localStateFile, JSON.stringify({ ...targetState, os_crypt: legacyState.os_crypt }));
      return { migrated: true, backup };
    } catch (error) {
      return { migrated: false, reason: 'write-failed', error };
    }
  }
  return { migrated: false, reason: 'no-matching-legacy-key' };
}

module.exports = { migrateLegacyProfile, adoptLegacyCryptKey };
