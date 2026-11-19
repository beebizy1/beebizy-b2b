import { hubspotEventQueue, runHubSpotEventSource } from "../src/server/hubspotEventSources.ts";

export default hubspotEventQueue.handleNodeCallback(runHubSpotEventSource, {
  visibilityTimeoutSeconds: 150,
  retry: (_error, metadata) => ({ afterSeconds: Math.min(900, 60 * Math.max(1, metadata.deliveryCount)) }),
});
