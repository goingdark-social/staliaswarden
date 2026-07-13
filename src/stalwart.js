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
      throw new Error(
        `Stalwart authentication failed (HTTP ${resp.status}). ` +
          `Check that the API token is valid and has not expired.`
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

    if (!accountId) {
      throw new Error(
        `JMAP session at ${sessionUrl} returned apiUrl but no account IDs. ` +
          `Full session: ${JSON.stringify(session)}`
      );
    }

    log('STALWART RESPONSE', `GET ${sessionUrl} – apiUrl: ${apiUrl}, accountId: ${accountId}`);
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

async function jmapRequest(client, apiUrl, methodCalls) {
  const requestBody = { using: JMAP_USING, methodCalls };
  log('STALWART REQUEST', `POST ${apiUrl}`, requestBody);
  const response = await client.post(apiUrl, requestBody);
  log('STALWART RESPONSE', `POST ${apiUrl} – Status: ${response.status}`, response.data);
  return response.data;
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
    createdBy: opts.createdBy ?? 'staliaswarden',
  };

  let setResp;
  try {
    const raw = await jmapRequest(client, apiUrl, [
      ['x:MaskedEmail/set', { accountId, create: { new1: createFields } }, 'c1'],
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

  log('INFO', `Masked email ${created.email} created for account ${accountId}`);
  return { email: created.email, id: created.id };
}
