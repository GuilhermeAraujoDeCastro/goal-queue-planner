import assert from 'node:assert/strict';
export function emulatorClient(project, firestorePort, authPort) {
  if (!project.startsWith('demo-') || !Number.isInteger(firestorePort) || !Number.isInteger(authPort)) throw new Error('Somente projetos demo em 127.0.0.1.');
  const host = `http://127.0.0.1:${firestorePort}`, base = `${host}/v1/projects/${project}/databases/(default)/documents`;
  const path = id => `projects/${project}/databases/(default)/documents/${id}`;
  const value = v => v instanceof Date ? { timestampValue: v.toISOString() } : v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'string' ? { stringValue: v } : typeof v === 'number' ? Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(value) } } : { mapValue: { fields: fields(v) } };
  const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, value(v)]));
  const put = (id, data, merge = false) => ({ update: { name: path(id), fields: fields(data) }, ...(merge ? { updateMask: { fieldPaths: Object.keys(data) } } : {}) });
  const del = id => ({ delete: path(id) });
  async function commit(token, writes, expected = 200) {
    const response = await fetch(base + ':commit', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
    const body = await response.json(); assert.equal(response.status, expected, JSON.stringify(body)); return body;
  }
  async function get(id, token = null, expected = 200) {
    const response = await fetch(base + '/' + id, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const body = await response.json(); assert.equal(response.status, expected, JSON.stringify(body)); return body;
  }
  async function account(email = `qa-${crypto.randomUUID()}@example.invalid`, password = 'Fixture-Only-123!') {
    const request = route => fetch(`http://127.0.0.1:${authPort}/identitytoolkit.googleapis.com/v1/accounts:${route}?key=demo-only`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    let response = await request('signUp'); if (response.status === 400) response = await request('signInWithPassword');
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return { uid: body.localId, token: body.idToken, email, password };
  }
  async function rules(content) {
    const response = await fetch(host + `/emulator/v1/projects/${project}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }) });
    const body = await response.text(); assert.equal(response.status, 200, body);
  }
  return { project, path, put, del, get, commit, account, rules };
}
