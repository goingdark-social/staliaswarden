import express from 'express';
import config from './config.js';
import { generateAlias } from './alias.js';
import { addAliasToStalwart } from './stalwart.js';

const app = express();
app.use(express.json());

function auth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token || token !== config.apiToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

async function handleAliasCreation(req, res) {
  try {
    const { domain } = req.body || {};
    const alias = generateAlias(domain);
    await addAliasToStalwart(alias);
    res.status(201).json({ alias });
  } catch (err) {
    console.error("Alias creation failed:", err);
    res.status(500).json({ error: "Failed to create alias" });
  }
}

// Addy.io-compatible endpoint
app.post('/api/v1/aliases', auth, handleAliasCreation);

// SimpleLogin-compatible endpoint
app.post('/api/alias/random/new', auth, handleAliasCreation);

app.listen(config.port, () => {
  console.log(`Alias service running on port ${config.port}`);
});
