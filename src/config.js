import dotenv from 'dotenv';
dotenv.config();

export default {
  port: process.env.PORT || 3000,
  // Stalwart
  stalwartUrl: process.env.STALWART_URL,
  // Optional override for where request/response logs are written.
  logDir: process.env.LOG_DIR,
};
