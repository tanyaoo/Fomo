'use strict';

// Plan only: never perform network operations or overwrite existing assets.
function recoveryPlan({ expected, existing, draft }) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) throw Error('Expected asset hashes are required');
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) throw Error('Existing asset hashes are required');
  if (typeof draft !== 'boolean') throw Error('Release draft state is required');
  const names = Object.keys(expected);
  if (!names.length) throw Error('Expected assets must not be empty');
  for (const [name, hash] of Object.entries(expected)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || !/^[a-f0-9]{64}$/.test(hash)) throw Error('Invalid expected asset or digest');
  }
  for (const [name, hash] of Object.entries(existing)) {
    if (!Object.hasOwn(expected, name)) throw Error('Unexpected asset on release: ' + name);
    if (hash !== expected[name]) throw Error('Existing asset differs: ' + name);
  }
  const missing = names.filter(name => !Object.hasOwn(existing, name));
  if (!draft && missing.length) throw Error('Published release is incomplete; do not mutate it');
  return { missing, complete: missing.length === 0, mayPublish: draft && missing.length === 0 };
}

module.exports = { recoveryPlan };
