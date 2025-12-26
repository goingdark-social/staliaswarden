import axios from 'axios';
import config from './config.js';
import { log } from './logger.js';

async function getPrincipalFromToken(stalwartToken) {
  // Check if STALWART_URL is configured
  if (!config.stalwartUrl) {
    throw new Error('STALWART_URL is not configured. Please set the STALWART_URL environment variable.');
  }

  // Stalwart API keys should be used as Bearer tokens
  // The token format is api_<key> and should be sent as: Authorization: Bearer api_<key>
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

  // Query Stalwart to get the principal associated with this API key
  // We'll list principals and find the one that matches this token
  // The API key is tied to a specific principal, so we need to find it
  try {
    // Get principals - the API key will only return principals it has access to
    const url = '/principal?limit=100';
    log('STALWART REQUEST', `GET ${config.stalwartUrl}${url}`);
    const response = await api.get(url);
    log('STALWART RESPONSE', `GET ${url} - Status: ${response.status}`, response.data);
    if (response.data?.data?.items && response.data.data.items.length > 0) {
      // The API key should return the principal it belongs to
      // Typically the first result or the one matching the token
      const principal = response.data.data.items[0];
      
      // Extract email from principal
      if (principal.emails) {
        if (typeof principal.emails === 'string') {
          // If emails is a comma-separated string, get the first one
          return principal.emails.split(',')[0].trim();
        } else if (Array.isArray(principal.emails) && principal.emails.length > 0) {
          // If emails is an array, get the first one
          return principal.emails[0];
        }
      }
      
      // If no emails field, try using the name field (which might be the email)
      if (principal.name && principal.name.includes('@')) {
        return principal.name;
      }
    }
  } catch (err) {
    log('ERROR', `Error fetching principal from Stalwart: ${err.message}`, err.response?.data);
    throw new Error('Unable to determine principal from API key');
  }

  throw new Error('Unable to determine principal from API key');
}

export async function addAliasToStalwart(alias, stalwartToken, description = null) {
  if (!stalwartToken) {
    throw new Error('Stalwart API token is required');
  }

  // Check if STALWART_URL is configured
  if (!config.stalwartUrl) {
    throw new Error('STALWART_URL is not configured. Please set the STALWART_URL environment variable.');
  }

  // Get the principal from the API key
  const principal = await getPrincipalFromToken(stalwartToken);

  // Stalwart API keys should be used as Bearer tokens
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
    const url = `/principal/${principal}`;
    const payload = [{
      "action": "addItem",
      "field": "emails",
      "value": alias
    }];
    log('STALWART REQUEST', `PATCH ${config.stalwartUrl}${url}`, payload);
    const res = await api.patch(url, payload);
    log('STALWART RESPONSE', `PATCH ${url} - Status: ${res.status}`, res.data);
    
    // Include description in the log if provided by Bitwarden
    const descriptionText = description ? ` (${description})` : '';
    log('INFO', `Alias ${alias} added to Stalwart for principal ${principal}${descriptionText}`);
    return res;
  } catch (err) {
    log('ERROR', `Failed to add alias to Stalwart: ${err.message}`, err.response?.data);
    throw err;
  }
}
