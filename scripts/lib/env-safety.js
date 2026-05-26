function isLocalApiUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

function isRemoteApiUrl(value) {
  return !isLocalApiUrl(value);
}

function requireDedicatedCredentialsForRemote({ apiUrl, tokenKeys = [], credentialPairs = [], purpose }) {
  if (!isRemoteApiUrl(apiUrl)) return;

  const hasToken = tokenKeys.some((key) => Boolean(process.env[key]));
  const hasCredentialPair = credentialPairs.some(([emailKey, passwordKey]) => Boolean(process.env[emailKey] && process.env[passwordKey]));
  if (hasToken || hasCredentialPair) return;

  const tokenHint = tokenKeys.length ? tokenKeys.join('/') : 'an access token';
  const pairHint = credentialPairs.map(([emailKey, passwordKey]) => `${emailKey}+${passwordKey}`).join(' or ');
  const credentialHint = [tokenHint, pairHint].filter(Boolean).join(' or ');
  throw new Error(`${purpose} against a non-local API requires dedicated credentials (${credentialHint}). Demo or bootstrap password fallbacks are not allowed.`);
}

function requireExplicitRemoteMutationFlag({ apiUrl, flagName, purpose }) {
  if (!isRemoteApiUrl(apiUrl)) return;
  if (process.env[flagName] === 'true') return;
  throw new Error(`${purpose} is blocked for non-local API ${apiUrl}. Set ${flagName}=true only after confirming the target can receive demo writes.`);
}

module.exports = {
  isLocalApiUrl,
  isRemoteApiUrl,
  requireDedicatedCredentialsForRemote,
  requireExplicitRemoteMutationFlag,
};
