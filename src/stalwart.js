import axios from 'axios';
import config from './config.js';
import { log } from './logger.js';

const JMAP_USING = ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'];

const JMAP_SESSION_PATHS = ['/.well-known/jmap', '/jmap/session'];

async function discoverJmapSession(baseUrl, authHeader) {
  const parsedBase = new URL(baseUrl);
  const origin = `${parsedBase.protocol}//${parsedBase.host}`;

  for (const path of JMAP_SESSION_PATHS) {
    const sessionUrl = `${origin}${path}`;

    // Only network-level errors (ECONNREFUSED, DNS, timeout) are caught here —
    // everything else (auth failure, bad session payload) propagates immediately.
    let resp;
    try {
      log('STALWART REQUEST', `GET ${sessionUrl} (JMAP session discovery)`);
      resp = await axios.get(sessionUrl, {
        headers: { Authorization: authHeader },
        maxRedirects: 5,
        timeout: 5000,
        validateStatus: (s) => s < 500,
      });
    } catch (err) {
      log('INFO', `JMAP session probe failed for ${sessionUrl}: ${err.message}`);
      continue;
    }

    if (resp.status === 401 || resp.status === 403) {
      throw httpError(
        resp.status,
        `Stalwart rejected the API key (HTTP ${resp.status}). ` +
          `Check that the key pasted into Bitwarden is valid, has not expired, ` +
          `and is not restricted to other IP addresses.`
      );
    }

    if (resp.status !== 200 || !resp.data?.apiUrl) {
      log('INFO', `JMAP session not found at ${sessionUrl} (status ${resp.status}), trying next path…`);
      continue;
    }

    const session = resp.data;

    // Rewrite Stalwart's advertised apiUrl to use our configured origin
    // so all requests go through the same host/proxy as STALWART_URL.
    // Stalwart may advertise an internal hostname or relative path.
    let advertisedPath;
    try {
      advertisedPath = new URL(session.apiUrl).pathname;
    } catch {
      advertisedPath = session.apiUrl.startsWith('/') ? session.apiUrl : `/${session.apiUrl}`;
    }
    const apiUrl = `${origin}${advertisedPath}`;

    const accountId =
      session.primaryAccounts?.['urn:stalwart:jmap'] ??
      session.primaryAccounts?.['urn:ietf:params:jmap:core'] ??
      session.primaryAccounts?.['urn:ietf:params:jmap:mail'] ??
      (session.accounts ? Object.keys(session.accounts)[0] : null);

    // accountId is informational only. x:MaskedEmail/set derives the owning
    // account from the credentials used to authenticate the request, so a
    // session that advertises no primaryAccounts is still usable.
    log('STALWART RESPONSE', `GET ${sessionUrl} – apiUrl: ${apiUrl}, accountId: ${accountId ?? '(not advertised)'}`);
    return { apiUrl, accountId };
  }

  throw new Error(
    `JMAP session discovery failed for all candidate paths (tried: ${JMAP_SESSION_PATHS.map(
      (p) => origin + p
    ).join(', ')}). ` +
      `Verify that STALWART_URL points to the correct host/port and that a ` +
      `JMAP-enabled HTTP listener is configured in Stalwart.`
  );
}

function toAuthHeader(stalwartToken) {
  return stalwartToken.startsWith('Bearer ')
    ? stalwartToken
    : `Bearer ${stalwartToken}`;
}

function buildHttpClient(authHeader) {
  return axios.create({
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    timeout: 10000,
  });
}

// Carries the upstream status so the HTTP layer can answer Bitwarden with 401
// instead of a blanket 500 when the API key is the problem.
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function jmapRequest(client, apiUrl, methodCalls) {
  const requestBody = { using: JMAP_USING, methodCalls };
  log('STALWART REQUEST', `POST ${apiUrl}`, requestBody);

  let response;
  try {
    response = await client.post(apiUrl, requestBody);
  } catch (err) {
    throw describeJmapFailure(err, apiUrl);
  }

  log('STALWART RESPONSE', `POST ${apiUrl} – Status: ${response.status}`, response.data);
  return response.data;
}

// Stalwart answers request-level failures with RFC 7807 problem+json. Axios
// collapses those to 'Request failed with status code 4xx', which hides the
// two causes that actually happen in the field: a bad API key and an API key
// without the sysMaskedEmailCreate permission.
function describeJmapFailure(err, apiUrl) {
  const status = err.response?.status;
  if (!status) return new Error(`JMAP request to ${apiUrl} failed: ${err.message}`);

  const problem = err.response.data;
  const detail =
    typeof problem === 'string'
      ? problem
      : [problem?.title, problem?.detail].filter(Boolean).join(' – ') || JSON.stringify(problem);

  if (status === 401) {
    return httpError(401, `Stalwart rejected the API key (HTTP 401): ${detail}. Check the key pasted into Bitwarden's API key field.`);
  }
  if (status === 403) {
    return httpError(
      403,
      `Stalwart accepted the API key but denied the request (HTTP 403): ${detail}. ` +
        `The key needs the sysMaskedEmailCreate permission.`
    );
  }
  return new Error(`JMAP request to ${apiUrl} failed with HTTP ${status}: ${detail}`);
}

function extractMethodResult(jmapResponse, methodName, callId) {
  const responses = jmapResponse?.methodResponses ?? [];
  const match = responses.find(([name, , id]) => name === methodName && id === callId);

  if (!match) {
    const errorResponse = responses.find(([name, , id]) => name === 'error' && id === callId);
    if (errorResponse) {
      const err = errorResponse[1];
      throw new Error(`JMAP error for ${methodName} (${callId}): ${err.type} – ${err.description ?? ''}`);
    }
    throw new Error(
      `No JMAP response found for method '${methodName}' with callId '${callId}'. ` +
        `Full response: ${JSON.stringify(jmapResponse)}`
    );
  }

  return match[1];
}

export async function addAliasToStalwart(desiredAlias, stalwartToken, description = null, opts = {}) {
  if (!stalwartToken) throw new Error('Stalwart API token is required');
  if (!config.stalwartUrl) throw new Error('STALWART_URL is not configured.');
  try {
    new URL(config.stalwartUrl);
  } catch {
    throw new Error(
      `STALWART_URL is not a valid URL: '${config.stalwartUrl}'. Include the protocol, e.g. https://stalwart.example.com`
    );
  }

  const authHeader = toAuthHeader(stalwartToken);
  const client = buildHttpClient(authHeader);

  const { apiUrl, accountId } = await discoverJmapSession(config.stalwartUrl, authHeader);

  const createFields = {
    enabled: true,
    emailDomain: desiredAlias,
    ...(description != null ? { description } : {}),
    ...(opts.emailPrefix != null ? { emailPrefix: opts.emailPrefix } : {}),
    ...(opts.forDomain != null ? { forDomain: opts.forDomain } : {}),
    ...(opts.url != null ? { url: opts.url } : {}),
  };

  let setResp;
  try {
    const raw = await jmapRequest(client, apiUrl, [
      ['x:MaskedEmail/set', { create: { new1: createFields } }, 'c1'],
    ]);
    setResp = extractMethodResult(raw, 'x:MaskedEmail/set', 'c1');
  } catch (err) {
    log('ERROR', `Failed to create masked email: ${err.message}`, err.response?.data);
    throw err;
  }

  const notCreated = setResp?.notCreated ?? {};
  if (notCreated.new1) {
    const problem = notCreated.new1;
    throw new Error(
      `Stalwart rejected the masked email creation for domain '${desiredAlias}': ` +
        (problem.description ?? JSON.stringify(problem))
    );
  }

  const created = setResp?.created?.new1;
  if (!created || !created.email || !created.id) {
    throw new Error(
      `x:MaskedEmail/set did not return a complete created object (need email and id). Full response: ${JSON.stringify(setResp)}`
    );
  }

  log('INFO', `Masked email ${created.email} created for account ${accountId ?? '(server-assigned)'}`);
  return { email: created.email, id: created.id };
}
