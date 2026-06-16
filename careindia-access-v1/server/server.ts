import { createApp, lakebase, server } from '@databricks/appkit';
import { setupCareDesertIndicatorRoutes } from './routes/lakebase/care-desert-indicator-routes';

createApp({
  plugins: [
    server({ autoStart: false }),
    lakebase(),
  ],
})
  .then(async (appkit) => {
    setupCareDesertIndicatorRoutes(appkit);
    await appkit.server.start();
  })
  .catch(console.error);
