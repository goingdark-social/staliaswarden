import express from 'express';
import config from './config.js';
import { generateAlias } from './alias.js';
import { addAliasToStalwart } from './stalwart.js';
import { log, logFile } from './logger.js';

const app = express();
app.use(express.json());

// Helper function to redact sensitive information
function redactSecrets(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const redacted = { ...obj };
  if (redacted.authorization) {
    redacted.authorization = '[REDACTED]';
  }
  if (redacted.Authorization) {
    redacted.Authorization = '[REDACTED]';
  }
  return redacted;
}

// Request logging middleware
app.use((req, res, next) => {
  const requestInfo = {
    method: req.method,
    path: req.path,
    headers: redactSecrets(req.headers),
    body: req.body
  };
  log('REQUEST', `${req.method} ${req.path}`, requestInfo);
  next();
});

// Response logging middleware
app.use((req, res, next) => {
  const originalJson = res.json;
  let responseBody = null;
  
  res.json = function(data) {
    responseBody = data;
    return originalJson.call(this, data);
  };
  
  res.on('finish', () => {
    const responseInfo = {
      status: res.statusCode,
      body: responseBody
    };
    log('RESPONSE', `${req.method} ${req.path} - Status: ${res.statusCode}`, responseInfo);
  });
  
  next();
});

async function createAlias(domain, stalwartToken, description = null) {
  if (!domain) {
    throw new Error('Domain is required');
  }
  const alias = generateAlias(domain, description);
  if (!alias) {
    throw new Error('Failed to generate alias');
  }
  
  // Must successfully add to Stalwart before returning
  // If this fails, we don't return the alias since it won't actually work
  await addAliasToStalwart(alias, stalwartToken, description);
  
  return alias;
}

// Handler function for creating aliases (used by both routes)
async function handleCreateAlias(req, res) {
  // Log the complete Bitwarden request
  const bitwardenRequest = {
    method: req.method,
    url: req.originalUrl || req.url,
    path: req.path,
    query: req.query,
    headers: redactSecrets(req.headers),
    body: req.body
  };
  log('BITWARDEN REQUEST', `Complete request from Bitwarden`, bitwardenRequest);

  // Extract Stalwart API token from Authorization header
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  // Pass the token through as-is to preserve the exact format from Bitwarden
  // Bitwarden sends: "Bearer api_<key>", which we pass directly to Stalwart
  const stalwartToken = authHeader;

  const { domain, description } = req.body || {};
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }

  let alias;
  try {
    alias = await createAlias(domain, stalwartToken, description);
  } catch (err) {
    log('ERROR', `Failed to create alias: ${err.message}`);
    return res.status(500).json({ error: err.message || "Failed to create alias" });
  }

  if (!alias) {
    return res.status(500).json({ error: "Failed to create alias" });
  }

  const now = Date.now();
  const [localPart, domainPart] = alias.split("@");

  res.status(201).json({
    data: {
      id: now,
      email: alias,
      local_part: localPart,
      domain: domainPart,
      description: null,
      enabled: true
    }
  });
}

// Support multiple routes for compatibility
// Standard route
app.post('/api/aliases', handleCreateAlias);
// Addy.io compatible route (what Bitwarden expects)
app.post('/api/v1/aliases', handleCreateAlias);
// Handle case where Bitwarden base URL is misconfigured
app.post('/api/aliases/api/v1/aliases', handleCreateAlias);

app.listen(config.port, () => {
  log('INFO', `Alias service running on port ${config.port}`);
  log('INFO', `Logging to file: ${logFile}`);
});
