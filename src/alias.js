import { v4 as uuidv4 } from 'uuid';
import config from './config.js';

export function generateAlias(domain = 'random') {
  const username = uuidv4().split('-')[0]; // short random ID
  const selectedDomain =
    domain === 'random' || !domain ? config.aliasDomain : domain;
  return `${username}@${selectedDomain}`;
}
