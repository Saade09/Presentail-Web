import { logger } from "./logger";

export type AlertSeverity = "info" | "warn" | "critical";

export type AlertField = {
  title: string;
  value: string;
};

export type Alert = {
  title: string;
  body: string;
  severity?: AlertSeverity;
  fields?: AlertField[];
  source?: string;
};

const SLACK_WEBHOOK_URL = process.env.ALERTS_SLACK_WEBHOOK_URL;

function severityIcon(s: AlertSeverity): string {
  if (s === "critical") return ":rotating_light:";
  if (s === "warn") return ":warning:";
  return ":information_source:";
}

async function sendToSlack(alert: Alert): Promise<boolean> {
  if (!SLACK_WEBHOOK_URL) return false;
  const severity = alert.severity ?? "warn";
  const lines: string[] = [
    `${severityIcon(severity)} *${alert.title}*`,
    alert.body,
  ];
  if (alert.fields && alert.fields.length > 0) {
    for (const f of alert.fields) {
      lines.push(`• *${f.title}*: ${f.value}`);
    }
  }
  if (alert.source) lines.push(`_source: ${alert.source}_`);
  const text = lines.join("\n");

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5_000);
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      logger.warn(
        { status: res.status, source: alert.source },
        "alerts: Slack webhook responded non-2xx",
      );
      return false;
    }
    return true;
  } catch (err: any) {
    logger.warn(
      { err: err?.message, source: alert.source },
      "alerts: Slack webhook send failed",
    );
    return false;
  }
}

/**
 * Send an operational alert. Currently dispatches to Slack via
 * ALERTS_SLACK_WEBHOOK_URL. When no channel is configured, the alert is
 * still logged at WARN level so it shows up in normal log searches and any
 * downstream log-based crash digest.
 */
export async function sendAlert(alert: Alert): Promise<void> {
  const severity = alert.severity ?? "warn";
  logger.warn(
    {
      alert: true,
      severity,
      title: alert.title,
      source: alert.source,
      fields: alert.fields,
    },
    alert.body,
  );
  await sendToSlack(alert);
}
