import express from 'express';
import config from './config.js';
import { generateAlias } from './alias.js';
import { addAliasToStalwart } from './stalwart.js';

const app = express();
app.use(express.json());

async function createAlias(domain, stalwartToken) {
  const alias = generateAlias(domain);
  if (!alias) return null;
  try {
    await addAliasToStalwart(alias, stalwartToken);
  } catch (err) {
    console.error(`Error adding alias to Stalwart:`, err.message);
    // Continue anyway - we still return the alias even if Stalwart call fails
    // This allows the user to see the alias was generated
  }
  return alias;
}

app.post('/api/v1/aliases', async (req, res) => {
  // Extract Stalwart API token from Authorization header
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  // Pass the token through as-is to preserve the exact format from Bitwarden
  // Bitwarden sends: "Bearer api_<key>", which we pass directly to Stalwart
  const stalwartToken = authHeader;

  const { domain } = req.body || {};
  const alias = await createAlias(domain, stalwartToken);

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
});

app.listen(config.port, () => {
  console.log(`Alias service running on port ${config.port}`);
});
