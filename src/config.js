import dotenv from 'dotenv';
dotenv.config();

export default {
  apiToken: process.env.API_TOKEN,
  aliasDomain: process.env.ALIAS_DOMAIN,
  forwardTo: process.env.FORWARD_TO,
  stalwartUrl: process.env.STALWART_URL,
  stalwartToken: process.env.STALWART_TOKEN,
  port: process.env.PORT || 3000
};
