import { prisma } from './prisma'
import axios from 'axios'

export type AlertType = 
  | 'PAPER_VALIDATED'
  | 'PAPER_REJECTED'
  | 'INVALID_REFERENCE'
  | 'SUSPICIOUS_DIAGRAM'
  | 'DUPLICATE_DETECTED'
  | 'VALIDATION_ERROR'
  | 'DAILY_SUMMARY'

export type AlertSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'

export interface CreateAlertParams {
  type: AlertType
  severity?: AlertSeverity
  title: string
  message: string
  paperId?: string
  referenceId?: string
  diagramId?: string
  userId?: string
  metadata?: Record<string, any>
}

export async function createAlert(params: CreateAlertParams) {
  return await prisma.alert.create({
    data: {
      type: params.type,
      severity: params.severity || 'INFO',
      title: params.title,
      message: params.message,
      paperId: params.paperId,
      referenceId: params.referenceId,
      diagramId: params.diagramId,
      userId: params.userId,
      metadata: params.metadata || {},
    },
  })
}

export async function sendEmailAlert(alert: any) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('SendGrid API key not configured, skipping email alert')
    return
  }

  try {
    const emailData = {
      personalizations: [
        {
          to: [{ email: process.env.EMAIL_FROM || 'admin@scholarsentinel.com' }],
          subject: `[Scholar Sentinel] ${alert.title}`,
        },
      ],
      from: { email: process.env.EMAIL_FROM || 'noreply@scholarsentinel.com' },
      content: [
        {
          type: 'text/plain',
          value: `${alert.message}\n\nType: ${alert.type}\nSeverity: ${alert.severity}`,
        },
      ],
    }

    await axios.post('https://api.sendgrid.com/v3/mail/send', emailData, {
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error('Error sending email alert:', error)
  }
}

export async function sendSlackAlert(alert: any) {
  if (!process.env.SLACK_WEBHOOK_URL) {
    console.warn('Slack webhook URL not configured, skipping Slack alert')
    return
  }

  try {
    const colorMap: Record<string, string> = {
      INFO: '#36a64f',
      WARNING: '#ff9900',
      ERROR: '#ff0000',
      CRITICAL: '#8b0000',
    }

    const payload = {
      text: alert.title,
      attachments: [
        {
          color: colorMap[alert.severity] || '#36a64f',
          fields: [
            {
              title: 'Type',
              value: alert.type,
              short: true,
            },
            {
              title: 'Severity',
              value: alert.severity,
              short: true,
            },
            {
              title: 'Message',
              value: alert.message,
              short: false,
            },
          ],
          ts: Math.floor(new Date(alert.createdAt).getTime() / 1000),
        },
      ],
    }

    await axios.post(process.env.SLACK_WEBHOOK_URL, payload)
  } catch (error) {
    console.error('Error sending Slack alert:', error)
  }
}

export async function sendDiscordAlert(alert: any) {
  if (!process.env.DISCORD_WEBHOOK_URL) {
    console.warn('Discord webhook URL not configured, skipping Discord alert')
    return
  }

  try {
    const colorMap: Record<string, number> = {
      INFO: 0x36a64f,
      WARNING: 0xff9900,
      ERROR: 0xff0000,
      CRITICAL: 0x8b0000,
    }

    const payload = {
      embeds: [
        {
          title: alert.title,
          description: alert.message,
          color: colorMap[alert.severity] || 0x36a64f,
          fields: [
            {
              name: 'Type',
              value: alert.type,
              inline: true,
            },
            {
              name: 'Severity',
              value: alert.severity,
              inline: true,
            },
          ],
          timestamp: new Date(alert.createdAt).toISOString(),
        },
      ],
    }

    await axios.post(process.env.DISCORD_WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error('Error sending Discord alert:', error)
  }
}

export async function sendAlert(alert: any) {
  // Create alert in database
  const createdAlert = await createAlert(alert)

  // Send via configured channels
  const promises: Promise<void>[] = []

  if (process.env.SENDGRID_API_KEY) {
    promises.push(sendEmailAlert(createdAlert))
  }

  if (process.env.SLACK_WEBHOOK_URL) {
    promises.push(sendSlackAlert(createdAlert))
  }

  if (process.env.DISCORD_WEBHOOK_URL) {
    promises.push(sendDiscordAlert(createdAlert))
  }

  await Promise.allSettled(promises)

  return createdAlert
}

