import axios from 'axios';
import config from './config.js';

export async function addAliasToStalwart(alias) {
  try {
    await axios.post(
      `${config.stalwartUrl}/aliases`,
      {
        alias,
        destinations: [config.forwardTo]
      },
      {
        headers: {
          Authorization: `Bearer ${config.stalwartToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`Alias ${alias} added to Stalwart`);
  } catch (err) {
    console.error(`Failed to add alias to Stalwart:`, err.response?.data || err);
  }
}
