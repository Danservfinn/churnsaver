const LOG_DRAIN_URL = process.env.LOG_DRAIN_URL;

export async function sendToLogDrain(payload: Record<string, unknown>): Promise<void> {
  if (!LOG_DRAIN_URL) return;

  try {
    await fetch(LOG_DRAIN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('Log drain delivery failed', error);
    }
  }
}

