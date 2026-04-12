export async function sendSlackMessage(
  webhookUrl: string,
  payload: object
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to reach Slack webhook: ${msg}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Slack webhook returned ${response.status}: ${body}`);
  }
}
