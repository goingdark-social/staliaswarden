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

// Addy.io-compatible endpoint
app.post('/api/v1/aliases', auth, async (req, res) => {
  const { domain } = req.body || {};
  const alias = generateAlias(domain);
  await addAliasToStalwart(alias);
  res.status(201).json({ alias });
});

// SimpleLogin-compatible endpoint
app.post('/api/alias/random/new', auth, async (req, res) => {
  const alias = generateAlias();
  await addAliasToStalwart(alias);
  res.status(201).json({ alias });
});

app.listen(config.port, () => {
  console.log(`Alias service running on port ${config.port}`);
});
