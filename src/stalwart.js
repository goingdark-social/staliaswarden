import axios from 'axios';
import config from './config.js';

export async function addAliasToStalwart(alias, stalwartToken) {
  if (!stalwartToken) {
    throw new Error('Stalwart API token is required');
  }

  // Stalwart API keys should be used as Bearer tokens
  // The token format is api_<key> and should be sent as: Authorization: Bearer api_<key>
  // Bitwarden sends the full header value "Bearer api_<key>", which we pass through as-is
  // If for some reason it doesn't have Bearer prefix, add it to ensure correct format
  const authHeader = stalwartToken.startsWith('Bearer ') 
    ? stalwartToken 
    : `Bearer ${stalwartToken}`;

  const api = axios.create({
    baseURL: config.stalwartUrl,
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader
    }
  });

  try {
    const res = await api.patch(
      `/principal/${config.forwardTo}`,
      [{
        "action": "addItem",
        "field": "emails",
        "value": alias
      }]
    );
    console.log(`Alias ${alias} added to Stalwart`);
    return res;
  } catch (err) {
    console.error(`Failed to add alias to Stalwart:`, err.response?.data || err.message);
    throw err;
  }
}
