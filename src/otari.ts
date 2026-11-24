import { OtariClient } from '@mozilla-ai/otari';
import { config } from './config';
export const otariClient = new OtariClient({
  platformToken: config.otariApiKey,
  apiBase: config.otariHost,
});
