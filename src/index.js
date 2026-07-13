import express from 'express';
import config from './config.js';
import { addAliasToStalwart } from './stalwart.js';
import { log, logFile } from './logger.js';

export function extractDomainFromDescription(description) {
  if (!description || typeof description !== 'string') {
    return null;
  }

  const domainPattern = /([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,})/;
  const match = description.match(domainPattern);

  return match?.[1] ?? null;
}

const app = express();
app.use(express.json());

function redactSecrets(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const redacted = { ...obj };
  if (redacted.authorization) redacted.authorization = '[REDACTED]';
  if (redacted.Authorization) redacted.Authorization = '[REDACTED]';
  return redacted;
}

app.use((req, res, next) => {
  log('REQUEST', `${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    headers: redactSecrets(req.headers),
    body: req.body,
  });
  next();
});

app.use((req, res, next) => {
  const originalJson = res.json;
  let responseBody = null;

  res.json = function (data) {
    responseBody = data;
    return originalJson.call(this, data);
  };

  res.on('finish', () => {
    log('RESPONSE', `${req.method} ${req.path} - Status: ${res.statusCode}`, {
      status: res.statusCode,
      body: responseBody,
    });
  });

  next();
});

export function getBaseLabel(domain) {
  if (!domain) return null;
  const parts = domain.split('.');
  let label;
  if (parts.length <= 2) {
    label = parts[0];
  } else if (parts.length === 3) {
    label = parts[1];
  } else {
    label = parts[parts.length - 3];
  }
  return label.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 64) || null;
}

async function createAlias(domain, stalwartToken, description = null) {
  if (!domain) {
    throw new Error('Domain is required');
  }

  // Pull the site domain out of Bitwarden's boilerplate description so the
  // MaskedEmail description and forDomain fields stay clean (just the domain).
  const siteDomain = extractDomainFromDescription(description);
  const cleanDescription = siteDomain ?? description ?? null;

  const result = await addAliasToStalwart(domain, stalwartToken, cleanDescription, {
    forDomain: siteDomain ?? undefined,
    url: siteDomain ? `https://${siteDomain}` : undefined,
    emailPrefix: siteDomain ? getBaseLabel(siteDomain) : undefined,
    createdBy: 'Bitwarden',
  });

  return { email: result.email, id: result.id, description: cleanDescription };
}

async function handleCreateAlias(req, res) {
  log('BITWARDEN REQUEST', `Complete request from Bitwarden`, {
    method: req.method,
    url: req.originalUrl || req.url,
    path: req.path,
    query: req.query,
    headers: redactSecrets(req.headers),
    body: req.body,
  });

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const stalwartToken = authHeader;
  const { domain, description } = req.body || {};

  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }

  let created;
  try {
    created = await createAlias(domain, stalwartToken, description);
  } catch (err) {
    log('ERROR', `Failed to create alias: ${err.message}`);
    return res.status(500).json({ error: err.message || 'Failed to create alias' });
  }

  const atIndex = created.email.indexOf('@');
  if (atIndex < 0) {
    return res.status(500).json({ error: 'Stalwart returned a malformed email address' });
  }
  const localPart = created.email.slice(0, atIndex);
  const domainPart = created.email.slice(atIndex + 1);

  res.status(201).json({
    data: {
      id: created.id,
      email: created.email,
      local_part: localPart,
      domain: domainPart,
      description: created.description,
      enabled: true,
    },
  });
}

app.post('/api/aliases', handleCreateAlias);
app.post('/api/v1/aliases', handleCreateAlias);
app.post('/api/aliases/api/v1/aliases', handleCreateAlias);

export { app };

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    log('INFO', `Alias service running on port ${config.port}`);
    log('INFO', `Logging to file: ${logFile}`);
  });
}
