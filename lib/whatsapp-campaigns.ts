import {
  WhatsAppCampaignAudienceMode,
  WhatsAppCampaignJobStatus,
  WhatsAppCampaignMessageType,
  WhatsAppCampaignStatus,
} from "@/lib/generated/prisma/enums"
import { type CurrentUser } from "@/lib/auth"
import { getEvolutionContactsSnapshot } from "@/lib/evolution-contacts"
import {
  type EvolutionContact,
  type EvolutionContactsSnapshot,
} from "@/lib/evolution-contacts-types"
import { prisma } from "@/lib/prisma"
import {
  type WhatsAppCampaignActionResult,
  type WhatsAppCampaignInput,
  type WhatsAppCampaignItem,
  type WhatsAppCampaignJobItem,
  type WhatsAppCampaignJobStatusCode,
  type WhatsAppCampaignMediaDraft,
  type WhatsAppCampaignSnapshot,
  type WhatsAppCampaignStatusCode,
} from "@/lib/whatsapp-campaigns-types"

type JsonRecord = Record<string, unknown>

type EvolutionConfig = {
  baseUrl: string
  apiKey: string
}

type CampaignWithRelations = Awaited<
  ReturnType<typeof readUserCampaigns>
>[number]

const DEFAULT_TIMEZONE = "America/Sao_Paulo"
const MAX_JOBS_PER_TICK = 10
const MAX_MEDIA_ATTACHMENTS = 3
const EVOLUTION_CAMPAIGN_WEBHOOK_EVENTS = [
  "MESSAGES_SET",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "SEND_MESSAGE",
  "CHATS_SET",
  "CHATS_UPSERT",
  "CHATS_UPDATE",
  "CHATS_DELETE",
  "CONTACTS_SET",
  "CONTACTS_UPSERT",
  "CONTACTS_UPDATE",
  "PRESENCE_UPDATE",
  "CONNECTION_UPDATE",
  "CALL",
] as const
const configuredWebhookInstances = new Set<string>()

export class WhatsAppCampaignError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "WhatsAppCampaignError"
    this.status = status
  }
}

export async function getWhatsAppCampaignsSnapshot(
  user: CurrentUser
): Promise<WhatsAppCampaignSnapshot> {
  const [contactsSnapshot, campaigns] = await Promise.all([
    getEvolutionContactsSnapshot({ userId: user.email }),
    readUserCampaigns(user.id),
  ])

  const campaignItems = campaigns.map(toCampaignItem)
  const pendingJobs = campaignItems.reduce(
    (sum, campaign) => sum + campaign.jobSummary.pending,
    0
  )
  const sentJobs = campaignItems.reduce(
    (sum, campaign) => sum + campaign.jobSummary.sent,
    0
  )
  const failedJobs = campaignItems.reduce(
    (sum, campaign) => sum + campaign.jobSummary.failed,
    0
  )

  return {
    campaigns: campaignItems,
    contacts: contactsSnapshot.contacts,
    instances: contactsSnapshot.instances,
    labels: contactsSnapshot.labels,
    totals: {
      campaigns: campaignItems.length,
      contacts: contactsSnapshot.contacts.length,
      failedJobs,
      pendingJobs,
      running: campaignItems.filter((campaign) => campaign.status === "RUNNING")
        .length,
      scheduled: campaignItems.filter(
        (campaign) => campaign.status === "SCHEDULED"
      ).length,
      sentJobs,
    },
    updatedAt: new Date().toISOString(),
  }
}

export async function saveWhatsAppCampaign({
  input,
  user,
}: {
  input: WhatsAppCampaignInput
  user: CurrentUser
}): Promise<WhatsAppCampaignActionResult> {
  const normalized = normalizeCampaignInput(input)
  const campaign = await upsertCampaign(user.id, normalized)
  await writeCampaignEvent({
    campaignId: campaign.id,
    message: "Campanha salva.",
    type: "campaign_saved",
  })

  const snapshot = await getWhatsAppCampaignsSnapshot(user)

  return {
    campaign: snapshot.campaigns.find((item) => item.id === campaign.id),
    snapshot,
  }
}

export async function prepareWhatsAppCampaign({
  input,
  user,
}: {
  input: WhatsAppCampaignInput
  user: CurrentUser
}): Promise<WhatsAppCampaignActionResult> {
  const normalized = normalizeCampaignInput(input)
  const campaign = await upsertCampaign(user.id, normalized)
  const prepared = await createCampaignJobs({
    campaignId: campaign.id,
    clearExisting: true,
    contactsSnapshot: await getEvolutionContactsSnapshot({ userId: user.email }),
    userId: user.id,
  })
  const snapshot = await getWhatsAppCampaignsSnapshot(user)

  return {
    campaign: snapshot.campaigns.find((item) => item.id === campaign.id),
    prepared,
    snapshot,
  }
}

export async function setWhatsAppCampaignStatus({
  campaignId,
  status,
  user,
}: {
  campaignId: string
  status: "PAUSED" | "RUNNING" | "CANCELED"
  user: CurrentUser
}): Promise<WhatsAppCampaignActionResult> {
  const campaign = await requireCampaign(user.id, campaignId)
  const now = new Date()

  if (status === "CANCELED") {
    await prisma.whatsAppCampaignJob.updateMany({
      data: {
        status: WhatsAppCampaignJobStatus.CANCELED,
      },
      where: {
        campaignId: campaign.id,
        status: {
          in: [
            WhatsAppCampaignJobStatus.PENDING,
            WhatsAppCampaignJobStatus.SENDING,
          ],
        },
      },
    })
  }

  await prisma.whatsAppCampaign.update({
    data: {
      completedAt: status === "CANCELED" ? now : undefined,
      pausedAt: status === "PAUSED" ? now : null,
      startedAt: status === "RUNNING" ? now : undefined,
      status: WhatsAppCampaignStatus[status],
    },
    where: {
      id: campaign.id,
    },
  })
  await writeCampaignEvent({
    campaignId: campaign.id,
    message: statusToEventMessage(status),
    type: `campaign_${status.toLowerCase()}`,
  })

  return {
    snapshot: await getWhatsAppCampaignsSnapshot(user),
  }
}

export async function deleteWhatsAppCampaign({
  campaignId,
  user,
}: {
  campaignId: string
  user: CurrentUser
}): Promise<WhatsAppCampaignActionResult> {
  const campaign = await requireCampaign(user.id, campaignId)

  await prisma.whatsAppCampaign.delete({
    where: {
      id: campaign.id,
    },
  })

  return {
    snapshot: await getWhatsAppCampaignsSnapshot(user),
  }
}

export async function processWhatsAppCampaignJobs({
  limit = MAX_JOBS_PER_TICK,
  user,
}: {
  limit?: number
  user: CurrentUser
}): Promise<WhatsAppCampaignActionResult> {
  const now = new Date()
  const jobs = await prisma.whatsAppCampaignJob.findMany({
    include: {
      campaign: {
        include: {
          messages: {
            orderBy: {
              position: "asc",
            },
          },
        },
      },
      message: true,
    },
    orderBy: {
      scheduledAt: "asc",
    },
    take: Math.max(1, Math.min(limit, MAX_JOBS_PER_TICK)),
    where: {
      campaign: {
        status: {
          in: [WhatsAppCampaignStatus.RUNNING, WhatsAppCampaignStatus.SCHEDULED],
        },
        userId: user.id,
      },
      scheduledAt: {
        lte: now,
      },
      status: WhatsAppCampaignJobStatus.PENDING,
    },
  })
  const processed = {
    failed: 0,
    sent: 0,
    skipped: 0,
  }

  for (const job of jobs) {
    const campaign = job.campaign

    if (campaign.status === WhatsAppCampaignStatus.SCHEDULED) {
      await prisma.whatsAppCampaign.update({
        data: {
          startedAt: campaign.startedAt ?? now,
          status: WhatsAppCampaignStatus.RUNNING,
        },
        where: {
          id: campaign.id,
        },
      })
    }

    const optOut = await prisma.contactOptOut.findUnique({
      where: {
        userId_number: {
          number: job.contactNumber,
          userId: user.id,
        },
      },
    })

    if (optOut) {
      await markJobSkipped(job.id, campaign.id, "Contato descadastrado.")
      processed.skipped += 1
      continue
    }

    const message =
      job.message ?? campaign.messages[Math.floor(Math.random() * campaign.messages.length)]

    if (!message) {
      await markJobFailed(job.id, campaign.id, "Campanha sem mensagens.")
      processed.failed += 1
      continue
    }

    await prisma.whatsAppCampaignJob.update({
      data: {
        attempts: {
          increment: 1,
        },
        messageId: message.id,
        status: WhatsAppCampaignJobStatus.SENDING,
      },
      where: {
        id: job.id,
      },
    })

    try {
      await ensureEvolutionCampaignWebhook(job.instanceName).catch(async (error) => {
        await writeCampaignEvent({
          campaignId: campaign.id,
          jobId: job.id,
          message: `Webhook de leitura nao configurado: ${getErrorMessage(error)}`,
          type: "webhook_warning",
        }).catch(() => undefined)
      })

      const response = await sendCampaignMessage({
        contactName: job.contactName,
        instanceName: job.instanceName,
        message,
        number: job.contactNumber,
        optOutText: campaign.optOutText,
      })

      await prisma.whatsAppCampaignJob.update({
        data: {
          remoteMessageIds: extractEvolutionMessageIds(response),
          response: response as never,
          sentAt: new Date(),
          status: WhatsAppCampaignJobStatus.SENT,
        },
        where: {
          id: job.id,
        },
      })
      await writeCampaignEvent({
        campaignId: campaign.id,
        jobId: job.id,
        message: `Mensagem enviada para ${job.contactName}.`,
        type: "message_sent",
      })
      processed.sent += 1
    } catch (error) {
      await markJobFailed(job.id, campaign.id, getErrorMessage(error))
      processed.failed += 1
    }

    await reconcileCampaignStatus(campaign.id, user)
  }

  return {
    processed,
    snapshot: await getWhatsAppCampaignsSnapshot(user),
  }
}

export async function handleEvolutionCampaignWebhook(payload: unknown) {
  const updates = extractEvolutionStatusUpdates(payload)
  const results = {
    delivered: 0,
    ignored: 0,
    read: 0,
  }

  for (const update of updates) {
    if (!update.messageId || update.deliveryStatus === "unknown") {
      results.ignored += 1
      continue
    }

    const jobs = await prisma.whatsAppCampaignJob.findMany({
      where: {
        instanceName: update.instanceName || undefined,
        remoteMessageIds: {
          has: update.messageId,
        },
      },
    })

    if (!jobs.length) {
      results.ignored += 1
      continue
    }

    for (const job of jobs) {
      const now = new Date()

      if (update.deliveryStatus === "read") {
        const readMessageIds = uniqueClean([
          ...job.readMessageIds,
          update.messageId,
        ])
        const wasUnread = !job.readAt

        await prisma.whatsAppCampaignJob.update({
          data: {
            deliveredAt: job.deliveredAt ?? now,
            readAt: job.readAt ?? now,
            readMessageIds,
          },
          where: {
            id: job.id,
          },
        })

        if (wasUnread) {
          await writeCampaignEvent({
            campaignId: job.campaignId,
            jobId: job.id,
            message: `Mensagem lida por ${job.contactName}.`,
            metadata: {
              messageId: update.messageId,
              rawStatus: update.rawStatus,
            },
            type: "message_read",
          })
          results.read += 1
        }
      } else {
        const wasUndelivered = !job.deliveredAt

        await prisma.whatsAppCampaignJob.update({
          data: {
            deliveredAt: job.deliveredAt ?? now,
          },
          where: {
            id: job.id,
          },
        })

        if (wasUndelivered) {
          results.delivered += 1
        }
      }
    }
  }

  return results
}

async function upsertCampaign(userId: string, input: WhatsAppCampaignInput) {
  const data = {
    audienceMode: input.audienceMode,
    dailyLimit: input.dailyLimit,
    excludedLabels: input.excludedLabels,
    includedLabels: input.includedLabels,
    maxDelaySeconds: input.maxDelaySeconds,
    minDelaySeconds: input.minDelaySeconds,
    name: input.name,
    optOutText: input.optOutText,
    recurrenceDays: input.recurrenceDays,
    recurrenceTime: input.recurrenceTime || null,
    recurring: input.recurring,
    safetyMaxErrors: input.safetyMaxErrors,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    selectedContactIds: input.selectedContactIds,
    selectedInstanceNames: input.selectedInstanceNames,
    timezone: input.timezone,
  }

  return prisma.$transaction(async (tx) => {
    let campaign

    if (input.id) {
      const current = await tx.whatsAppCampaign.findFirst({
        where: {
          id: input.id,
          userId,
        },
      })

      if (!current) {
        throw new WhatsAppCampaignError("Campanha nao encontrada.", 404)
      }

      campaign = await tx.whatsAppCampaign.update({
        data,
        where: {
          id: current.id,
        },
      })
    } else {
      campaign = await tx.whatsAppCampaign.create({
        data: {
          ...data,
          userId,
        },
      })
    }

    await tx.whatsAppCampaignMessage.deleteMany({
      where: {
        campaignId: campaign.id,
      },
    })

    await tx.whatsAppCampaignMessage.createMany({
      data: input.messages.map((message, index) => ({
        attachments: (message.attachments ?? []) as never,
        campaignId: campaign.id,
        caption: message.caption?.trim() || null,
        fileName: message.fileName?.trim() || null,
        media: message.media?.trim() || null,
        mimetype: message.mimetype?.trim() || null,
        position: index + 1,
        text: message.text.trim(),
        textAfterMedia: Boolean(message.textAfterMedia),
        type: WhatsAppCampaignMessageType[message.type],
      })),
    })

    return campaign
  })
}

async function createCampaignJobs({
  baseDateOverride,
  campaignId,
  clearExisting,
  contactsSnapshot,
  userId,
}: {
  baseDateOverride?: Date
  campaignId: string
  clearExisting: boolean
  contactsSnapshot: EvolutionContactsSnapshot
  userId: string
}) {
  const campaign = await prisma.whatsAppCampaign.findFirst({
    include: {
      messages: {
        orderBy: {
          position: "asc",
        },
      },
    },
    where: {
      id: campaignId,
      userId,
    },
  })

  if (!campaign) {
    throw new WhatsAppCampaignError("Campanha nao encontrada.", 404)
  }

  if (!campaign.messages.length) {
    throw new WhatsAppCampaignError("Adicione pelo menos uma mensagem.")
  }

  const audience = selectCampaignAudience(campaign, contactsSnapshot.contacts)

  if (!audience.length) {
    throw new WhatsAppCampaignError("Nenhum contato encontrado para este publico.")
  }

  const optOuts = await prisma.contactOptOut.findMany({
    where: {
      userId,
    },
  })
  const optOutNumbers = new Set(optOuts.map((item) => item.number))
  const runKey = `run_${Date.now()}`
  const baseDate =
    baseDateOverride ??
    (campaign.scheduledAt && campaign.scheduledAt > new Date()
      ? campaign.scheduledAt
      : new Date())
  const jobs = []
  let skippedOptOut = 0
  let secondsInCurrentDay = 0

  for (const [index, contact] of audience.entries()) {
    if (optOutNumbers.has(contact.number)) {
      skippedOptOut += 1
      continue
    }

    const dayOffset = Math.floor(index / campaign.dailyLimit)

    if (index % campaign.dailyLimit === 0) {
      secondsInCurrentDay = 0
    } else {
      secondsInCurrentDay += randomInt(
        campaign.minDelaySeconds,
        campaign.maxDelaySeconds
      )
    }

    const scheduledAt = new Date(
      baseDate.getTime() + dayOffset * 24 * 60 * 60 * 1000 + secondsInCurrentDay * 1000
    )
    const message =
      campaign.messages[Math.floor(Math.random() * campaign.messages.length)]

    jobs.push({
      campaignId: campaign.id,
      contactId: contact.id,
      contactName: contact.name,
      contactNumber: contact.number,
      instanceDisplayName: contact.instanceDisplayName,
      instanceName: contact.instanceName,
      messageId: message?.id,
      runKey,
      scheduledAt,
      status: WhatsAppCampaignJobStatus.PENDING,
    })
  }

  await prisma.$transaction([
    ...(clearExisting
      ? [
          prisma.whatsAppCampaignJob.deleteMany({
            where: {
              campaignId: campaign.id,
              status: {
                in: [
                  WhatsAppCampaignJobStatus.CANCELED,
                  WhatsAppCampaignJobStatus.FAILED,
                  WhatsAppCampaignJobStatus.PENDING,
                  WhatsAppCampaignJobStatus.SKIPPED,
                ],
              },
            },
          }),
        ]
      : []),
    prisma.whatsAppCampaignJob.createMany({
      data: jobs,
      skipDuplicates: true,
    }),
    prisma.whatsAppCampaign.update({
      data: {
        activeRunKey: runKey,
        preparedAt: new Date(),
        scheduledAt: baseDate,
        status:
          baseDate > new Date()
            ? WhatsAppCampaignStatus.SCHEDULED
            : WhatsAppCampaignStatus.RUNNING,
      },
      where: {
        id: campaign.id,
      },
    }),
  ])
  await writeCampaignEvent({
    campaignId: campaign.id,
    message: `${jobs.length} contatos preparados para envio.`,
    metadata: {
      skippedOptOut,
    },
    type: "campaign_prepared",
  })

  return {
    skippedOptOut,
    total: jobs.length,
  }
}

function selectCampaignAudience(
  campaign: {
    audienceMode: string
    excludedLabels: string[]
    includedLabels: string[]
    selectedContactIds: string[]
    selectedInstanceNames: string[]
  },
  contacts: EvolutionContact[]
) {
  const selectedContacts = new Set(campaign.selectedContactIds)
  const includedLabels = new Set(campaign.includedLabels)
  const excludedLabels = new Set(campaign.excludedLabels)
  const selectedInstances = new Set(campaign.selectedInstanceNames)

  return contacts.filter((contact) => {
    if (
      selectedInstances.size &&
      !selectedInstances.has(contact.instanceName)
    ) {
      return false
    }

    if (
      campaign.audienceMode === WhatsAppCampaignAudienceMode.CUSTOM &&
      !selectedContacts.has(contact.id)
    ) {
      return false
    }

    if (
      campaign.audienceMode === WhatsAppCampaignAudienceMode.FILTER &&
      !includedLabels.size
    ) {
      return false
    }

    if (
      campaign.audienceMode === WhatsAppCampaignAudienceMode.FILTER &&
      includedLabels.size &&
      !contact.labels.some((label) => includedLabels.has(label))
    ) {
      return false
    }

    if (contact.labels.some((label) => excludedLabels.has(label))) {
      return false
    }

    return Boolean(contact.number)
  })
}

async function sendCampaignMessage({
  contactName,
  instanceName,
  message,
  number,
  optOutText,
}: {
  contactName: string
  instanceName: string
  message: {
    attachments?: unknown
    caption: string | null
    fileName: string | null
    media: string | null
    mimetype: string | null
    text: string
    textAfterMedia: boolean
    type: WhatsAppCampaignMessageType
  }
  number: string
  optOutText: string
}) {
  const renderedText = renderCampaignText(message.text, {
    name: contactName,
    number,
  })
  const renderedCaption = renderCampaignText(message.caption ?? "", {
    name: contactName,
    number,
  })
  const footer = optOutText.trim()
  const textWithFooter = footer ? `${renderedText}\n\n${footer}` : renderedText
  const mediaCaption = message.textAfterMedia
    ? renderedCaption
    : renderedCaption || renderedText
  const captionWithFooter =
    mediaCaption && footer ? `${mediaCaption}\n\n${footer}` : mediaCaption

  if (message.type === WhatsAppCampaignMessageType.TEXT) {
    return sendEvolutionTextMessage({
      instanceName,
      number,
      text: textWithFooter,
    })
  }

  const attachments = normalizeStoredAttachments(message)

  if (!attachments.length) {
    throw new WhatsAppCampaignError("Mensagem de midia sem arquivo.")
  }

  const mediaResponses = []

  for (const [index, attachment] of attachments.entries()) {
    mediaResponses.push(
      await sendEvolutionMediaMessage({
        caption: index === 0 && !message.textAfterMedia ? captionWithFooter : "",
        fileName: attachment.fileName || defaultFileName(message.type),
        instanceName,
        media: normalizeMediaPayload(attachment.media),
        mediatype: message.type.toLowerCase(),
        mimetype: attachment.mimetype || defaultMimeType(message.type),
        number,
      })
    )
  }

  if (message.textAfterMedia && renderedText) {
    const textResponse = await sendEvolutionTextMessage({
      instanceName,
      number,
      text: textWithFooter,
    })

    return {
      mediaResponses,
      textResponse,
    }
  }

  return {
    mediaResponses,
  }
}

async function ensureEvolutionCampaignWebhook(instanceName: string) {
  if (configuredWebhookInstances.has(instanceName)) {
    return
  }

  const webhookUrl = getEvolutionCampaignWebhookUrl()

  await evolutionRequest(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        events: [...EVOLUTION_CAMPAIGN_WEBHOOK_EVENTS],
        url: webhookUrl,
        webhookBase64: false,
        webhookByEvents: false,
      },
    }),
  })

  configuredWebhookInstances.add(instanceName)
}

function getEvolutionCampaignWebhookUrl() {
  const explicitUrl = process.env.EVOLUTION_WEBHOOK_URL?.trim()

  if (explicitUrl) {
    return explicitUrl
  }

  const appUrl = (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "")
  const url = new URL("/api/webhooks/evolution", appUrl)

  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    url.hostname = "host.docker.internal"
  }

  const secret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim()

  if (secret) {
    url.searchParams.set("secret", secret)
  }

  return url.toString()
}

async function sendEvolutionTextMessage({
  instanceName,
  number,
  text,
}: {
  instanceName: string
  number: string
  text: string
}) {
  const pathName = `/message/sendText/${encodeURIComponent(instanceName)}`

  try {
    return await evolutionRequest(pathName, {
      method: "POST",
      body: JSON.stringify({
        delay: 1200,
        linkPreview: true,
        number,
        text,
      }),
    })
  } catch (error) {
    if (!isRetryableEvolutionShapeError(error)) {
      throw error
    }

    return evolutionRequest(pathName, {
      method: "POST",
      body: JSON.stringify({
        number,
        options: {
          delay: 1200,
          linkPreview: true,
          presence: "composing",
        },
        textMessage: {
          text,
        },
      }),
    })
  }
}

async function sendEvolutionMediaMessage({
  caption,
  fileName,
  instanceName,
  media,
  mediatype,
  mimetype,
  number,
}: {
  caption: string
  fileName: string
  instanceName: string
  media: string
  mediatype: string
  mimetype: string
  number: string
}) {
  const pathName = `/message/sendMedia/${encodeURIComponent(instanceName)}`

  try {
    return await evolutionRequest(pathName, {
      method: "POST",
      body: JSON.stringify({
        caption,
        delay: 1200,
        fileName,
        linkPreview: true,
        media,
        mediatype,
        mimetype,
        number,
      }),
    })
  } catch (error) {
    if (!isRetryableEvolutionShapeError(error)) {
      throw error
    }

    return evolutionRequest(pathName, {
      method: "POST",
      body: JSON.stringify({
        mediaMessage: {
          caption,
          fileName,
          media,
          mediaType: mediatype,
        },
        number,
        options: {
          delay: 1200,
          presence: "composing",
        },
      }),
    })
  }
}

async function reconcileCampaignStatus(campaignId: string, user: CurrentUser) {
  const [pending, sending, failed, sent] = await Promise.all([
    prisma.whatsAppCampaignJob.count({
      where: { campaignId, status: WhatsAppCampaignJobStatus.PENDING },
    }),
    prisma.whatsAppCampaignJob.count({
      where: { campaignId, status: WhatsAppCampaignJobStatus.SENDING },
    }),
    prisma.whatsAppCampaignJob.count({
      where: { campaignId, status: WhatsAppCampaignJobStatus.FAILED },
    }),
    prisma.whatsAppCampaignJob.count({
      where: { campaignId, status: WhatsAppCampaignJobStatus.SENT },
    }),
  ])
  const campaign = await prisma.whatsAppCampaign.findUnique({
    where: {
      id: campaignId,
    },
  })

  if (!campaign || campaign.status === WhatsAppCampaignStatus.PAUSED) {
    return
  }

  if (!pending && !sending) {
    if (campaign.recurring) {
      const nextDate = getNextRecurringDate(campaign, new Date())

      if (nextDate) {
        await createCampaignJobs({
          baseDateOverride: nextDate,
          campaignId,
          clearExisting: false,
          contactsSnapshot: await getEvolutionContactsSnapshot({
            userId: user.email,
          }),
          userId: user.id,
        })
        await writeCampaignEvent({
          campaignId,
          message: `Proxima recorrencia agendada para ${nextDate.toLocaleString("pt-BR")}.`,
          type: "campaign_recurring_scheduled",
        })
        return
      }
    }

    await prisma.whatsAppCampaign.update({
      data: {
        completedAt: new Date(),
        status: failed && !sent
          ? WhatsAppCampaignStatus.FAILED
          : WhatsAppCampaignStatus.COMPLETED,
      },
      where: {
        id: campaignId,
      },
    })
  } else if (failed >= campaign.safetyMaxErrors) {
    await prisma.whatsAppCampaign.update({
      data: {
        pausedAt: new Date(),
        status: WhatsAppCampaignStatus.PAUSED,
      },
      where: {
        id: campaignId,
      },
    })
    await writeCampaignEvent({
      campaignId,
      message: "Campanha pausada por excesso de falhas.",
      type: "campaign_safety_pause",
    })
  }
}

async function markJobSkipped(jobId: string, campaignId: string, reason: string) {
  await prisma.whatsAppCampaignJob.update({
    data: {
      lastError: reason,
      status: WhatsAppCampaignJobStatus.SKIPPED,
    },
    where: {
      id: jobId,
    },
  })
  await writeCampaignEvent({
    campaignId,
    jobId,
    message: reason,
    type: "message_skipped",
  })
}

async function markJobFailed(jobId: string, campaignId: string, reason: string) {
  await prisma.whatsAppCampaignJob.update({
    data: {
      lastError: reason,
      status: WhatsAppCampaignJobStatus.FAILED,
    },
    where: {
      id: jobId,
    },
  })
  await writeCampaignEvent({
    campaignId,
    jobId,
    message: reason,
    type: "message_failed",
  })
}

async function readUserCampaigns(userId: string) {
  return prisma.whatsAppCampaign.findMany({
    include: {
      events: {
        orderBy: {
          createdAt: "desc",
        },
        take: 8,
      },
      jobs: {
        orderBy: {
          scheduledAt: "desc",
        },
        take: 500,
      },
      messages: {
        orderBy: {
          position: "asc",
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    where: {
      userId,
    },
  })
}

async function requireCampaign(userId: string, campaignId: string) {
  const campaign = await prisma.whatsAppCampaign.findFirst({
    where: {
      id: campaignId,
      userId,
    },
  })

  if (!campaign) {
    throw new WhatsAppCampaignError("Campanha nao encontrada.", 404)
  }

  return campaign
}

async function writeCampaignEvent({
  campaignId,
  jobId,
  message,
  metadata,
  type,
}: {
  campaignId: string
  jobId?: string
  message: string
  metadata?: JsonRecord
  type: string
}) {
  await prisma.whatsAppCampaignEvent.create({
    data: {
      campaignId,
      jobId,
      message,
      metadata: metadata as never,
      type,
    },
  })
}

function toCampaignItem(campaign: CampaignWithRelations): WhatsAppCampaignItem {
  const jobSummary = summarizeJobs(campaign.jobs)

  return {
    audienceMode: campaign.audienceMode,
    completedAt: campaign.completedAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    dailyLimit: campaign.dailyLimit,
    events: campaign.events.map((event) => ({
      createdAt: event.createdAt.toISOString(),
      id: event.id,
      message: event.message,
      type: event.type,
    })),
    excludedLabels: campaign.excludedLabels,
    id: campaign.id,
    includedLabels: campaign.includedLabels,
    jobSummary,
    jobs: campaign.jobs.slice(0, 80).map(toJobItem),
    maxDelaySeconds: campaign.maxDelaySeconds,
    messages: campaign.messages.map((message) => ({
      attachments: normalizeStoredAttachments(message),
      caption: message.caption ?? undefined,
      fileName: message.fileName ?? undefined,
      id: message.id,
      media: message.media ?? undefined,
      mimetype: message.mimetype ?? undefined,
      text: message.text,
      textAfterMedia: message.textAfterMedia,
      type: message.type,
    })),
    minDelaySeconds: campaign.minDelaySeconds,
    name: campaign.name,
    optOutText: campaign.optOutText,
    pausedAt: campaign.pausedAt?.toISOString() ?? null,
    preparedAt: campaign.preparedAt?.toISOString() ?? null,
    recurrenceDays: campaign.recurrenceDays,
    recurrenceTime: campaign.recurrenceTime ?? null,
    recurring: campaign.recurring,
    safetyMaxErrors: campaign.safetyMaxErrors,
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    selectedContactIds: campaign.selectedContactIds,
    selectedInstanceNames: campaign.selectedInstanceNames,
    startedAt: campaign.startedAt?.toISOString() ?? null,
    status: campaign.status,
    timezone: campaign.timezone,
    updatedAt: campaign.updatedAt.toISOString(),
  }
}

function toJobItem(
  job: CampaignWithRelations["jobs"][number]
): WhatsAppCampaignJobItem {
  return {
    contactName: job.contactName,
    contactNumber: job.contactNumber,
    id: job.id,
    instanceDisplayName: job.instanceDisplayName,
    lastError: job.lastError,
    readAt: job.readAt?.toISOString() ?? null,
    scheduledAt: job.scheduledAt.toISOString(),
    sentAt: job.sentAt?.toISOString() ?? null,
    status: job.status as WhatsAppCampaignJobStatusCode,
  }
}

function summarizeJobs(jobs: CampaignWithRelations["jobs"]) {
  const summary = {
    canceled: 0,
    failed: 0,
    pending: 0,
    read: 0,
    sending: 0,
    sent: 0,
    skipped: 0,
    total: jobs.length,
  }

  for (const job of jobs) {
    if (job.status === WhatsAppCampaignJobStatus.CANCELED) {
      summary.canceled += 1
    } else if (job.status === WhatsAppCampaignJobStatus.FAILED) {
      summary.failed += 1
    } else if (job.status === WhatsAppCampaignJobStatus.PENDING) {
      summary.pending += 1
    } else if (job.status === WhatsAppCampaignJobStatus.SENDING) {
      summary.sending += 1
    } else if (job.status === WhatsAppCampaignJobStatus.SENT) {
      summary.sent += 1
    } else if (job.status === WhatsAppCampaignJobStatus.SKIPPED) {
      summary.skipped += 1
    }

    if (job.readAt) {
      summary.read += 1
    }
  }

  return summary
}

function normalizeCampaignInput(input: WhatsAppCampaignInput) {
  const name = input.name.trim()
  const minDelaySeconds = clampInteger(input.minDelaySeconds, 15, 3600)
  const maxDelaySeconds = clampInteger(input.maxDelaySeconds, minDelaySeconds, 7200)
  const dailyLimit = clampInteger(input.dailyLimit, 1, 1000)
  const safetyMaxErrors = clampInteger(input.safetyMaxErrors, 1, 100)
  const messages = input.messages
    .slice(0, 5)
    .map((message) => {
      const type = message.type in WhatsAppCampaignMessageType
        ? message.type
        : "TEXT"
      const attachments = type === "TEXT"
        ? []
        : normalizeDraftAttachments({ ...message, type })
      const firstAttachment = attachments[0]

      return {
        ...message,
        attachments,
        caption: message.caption?.trim(),
        fileName: firstAttachment?.fileName,
        media: firstAttachment?.media,
        mimetype: firstAttachment?.mimetype,
        text: message.text.trim(),
        textAfterMedia: type === "TEXT" ? false : Boolean(message.textAfterMedia),
        type,
      }
    })
    .filter((message) => message.text || message.attachments.length)

  if (!name) {
    throw new WhatsAppCampaignError("Informe o nome da campanha.")
  }

  if (!messages.length) {
    throw new WhatsAppCampaignError("Adicione pelo menos uma mensagem.")
  }

  for (const message of messages) {
    if (message.type !== "TEXT" && !message.attachments.length) {
      throw new WhatsAppCampaignError(
        "Mensagens com midia precisam de pelo menos um arquivo."
      )
    }

    if (message.attachments.length > MAX_MEDIA_ATTACHMENTS) {
      throw new WhatsAppCampaignError(
        `Cada variante aceita no maximo ${MAX_MEDIA_ATTACHMENTS} arquivos.`
      )
    }
  }

  return {
    ...input,
    audienceMode: input.audienceMode in WhatsAppCampaignAudienceMode
      ? input.audienceMode
      : "ALL",
    dailyLimit,
    excludedLabels: uniqueClean(input.excludedLabels),
    includedLabels: uniqueClean(input.includedLabels),
    maxDelaySeconds,
    messages,
    minDelaySeconds,
    name,
    optOutText: input.optOutText.trim(),
    recurrenceDays: uniqueClean(input.recurrenceDays),
    recurrenceTime: input.recurrenceTime?.trim() || null,
    safetyMaxErrors,
    scheduledAt: input.scheduledAt || null,
    selectedContactIds: uniqueClean(input.selectedContactIds),
    selectedInstanceNames: uniqueClean(input.selectedInstanceNames),
    timezone: input.timezone.trim() || DEFAULT_TIMEZONE,
  }
}

function normalizeDraftAttachments(message: {
  attachments?: WhatsAppCampaignMediaDraft[]
  fileName?: string
  media?: string
  mimetype?: string
  type: keyof typeof WhatsAppCampaignMessageType
}) {
  const type = WhatsAppCampaignMessageType[message.type]
  const attachments =
    Array.isArray(message.attachments) && message.attachments.length
      ? message.attachments
      : message.media
        ? [
            {
              fileName: message.fileName || defaultFileName(type),
              media: message.media,
              mimetype: message.mimetype || defaultMimeType(type),
            },
          ]
        : []

  return attachments
    .map((attachment) => ({
      fileName: attachment.fileName?.trim() || defaultFileName(type),
      media: attachment.media?.trim() ?? "",
      mimetype: attachment.mimetype?.trim() || defaultMimeType(type),
    }))
    .filter((attachment) => attachment.media)
}

function normalizeStoredAttachments(message: {
  attachments?: unknown
  fileName?: string | null
  media?: string | null
  mimetype?: string | null
  type: WhatsAppCampaignMessageType
}) {
  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : []
  const normalized = attachments
    .filter(isJsonRecord)
    .map((attachment) => ({
      fileName: readString(attachment, "fileName") || defaultFileName(message.type),
      media: readString(attachment, "media") ?? "",
      mimetype:
        readString(attachment, "mimetype") || defaultMimeType(message.type),
    }))
    .filter((attachment) => attachment.media)

  if (normalized.length) {
    return normalized
  }

  if (!message.media) {
    return []
  }

  return [
    {
      fileName: message.fileName || defaultFileName(message.type),
      media: message.media,
      mimetype: message.mimetype || defaultMimeType(message.type),
    },
  ]
}

function renderCampaignText(
  template: string,
  values: {
    name: string
    number: string
  }
) {
  return template
    .replace(/\{nome\}/gi, values.name)
    .replace(/\{name\}/gi, values.name)
    .replace(/\{numero\}/gi, values.number)
    .replace(/\{number\}/gi, values.number)
}

function defaultMimeType(type: WhatsAppCampaignMessageType) {
  if (type === WhatsAppCampaignMessageType.IMAGE) {
    return "image/jpeg"
  }

  if (type === WhatsAppCampaignMessageType.VIDEO) {
    return "video/mp4"
  }

  return "application/pdf"
}

function defaultFileName(type: WhatsAppCampaignMessageType) {
  if (type === WhatsAppCampaignMessageType.IMAGE) {
    return "imagem.jpg"
  }

  if (type === WhatsAppCampaignMessageType.VIDEO) {
    return "video.mp4"
  }

  return "documento.pdf"
}

function extractEvolutionMessageIds(response: unknown) {
  const ids = new Set<string>()
  const stack = [response]

  while (stack.length) {
    const current = stack.pop()

    if (Array.isArray(current)) {
      stack.push(...current)
      continue
    }

    if (!isJsonRecord(current)) {
      continue
    }

    const key = readRecord(current, "key")
    const keyId = key ? readString(key, "id") : null
    const directId =
      readString(current, "messageId") ??
      readString(current, "message_id") ??
      readString(current, "id")

    if (keyId) {
      ids.add(keyId)
    }

    if (directId && looksLikeWhatsAppMessageId(directId)) {
      ids.add(directId)
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value) || isJsonRecord(value)) {
        stack.push(value)
      }
    }
  }

  return [...ids]
}

function extractEvolutionStatusUpdates(payload: unknown) {
  return collectStatusUpdateCandidates(payload).map((candidate) => {
    const key = readRecord(candidate, "key")
    const update = readRecord(candidate, "update")
    const status =
      readValue(candidate, "status") ??
      readValue(candidate, "ack") ??
      readValue(candidate, "messageStatus") ??
      readValue(candidate, "message_status") ??
      readValue(update, "status") ??
      readValue(update, "ack")
    const messageId =
      (key ? readString(key, "id") : null) ??
      readString(candidate, "messageId") ??
      readString(candidate, "message_id") ??
      readString(candidate, "id")

    return {
      deliveryStatus: normalizeDeliveryStatus(status),
      instanceName:
        readString(candidate, "instance") ??
        readString(candidate, "instanceName") ??
        readString(candidate, "instance_name"),
      messageId,
      rawStatus: status,
    }
  })
}

function collectStatusUpdateCandidates(payload: unknown) {
  const records: JsonRecord[] = []
  const stack = [payload]

  while (stack.length) {
    const current = stack.pop()

    if (Array.isArray(current)) {
      stack.push(...current)
      continue
    }

    if (!isJsonRecord(current)) {
      continue
    }

    const key = readRecord(current, "key")
    const update = readRecord(current, "update")
    const hasMessageId = Boolean(
      (key && readString(key, "id")) ||
        readString(current, "messageId") ||
        readString(current, "message_id")
    )
    const hasStatus = Boolean(
      readValue(current, "status") ??
        readValue(current, "ack") ??
        readValue(current, "messageStatus") ??
        readValue(current, "message_status") ??
        readValue(update, "status") ??
        readValue(update, "ack")
    )

    if (hasMessageId && hasStatus) {
      records.push(current)
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value) || isJsonRecord(value)) {
        stack.push(value)
      }
    }
  }

  return records
}

function normalizeDeliveryStatus(value: unknown): "delivered" | "read" | "unknown" {
  if (typeof value === "number") {
    if (value >= 4) {
      return "read"
    }

    if (value >= 3) {
      return "delivered"
    }

    return "unknown"
  }

  if (typeof value !== "string") {
    return "unknown"
  }

  const normalized = value.trim().toUpperCase()

  if (
    normalized === "READ" ||
    normalized === "PLAYED" ||
    normalized === "READ_ACK" ||
    normalized === "MESSAGE_READ" ||
    normalized === "4" ||
    normalized === "5"
  ) {
    return "read"
  }

  if (
    normalized === "DELIVERED" ||
    normalized === "DELIVERY_ACK" ||
    normalized === "SERVER_ACK" ||
    normalized === "MESSAGE_DELIVERED" ||
    normalized === "3"
  ) {
    return "delivered"
  }

  return "unknown"
}

function looksLikeWhatsAppMessageId(value: string) {
  return /^[A-Z0-9._-]{8,}$/i.test(value)
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function readRecord(record: unknown, key: string) {
  if (!isJsonRecord(record)) {
    return null
  }

  const value = record[key]

  return isJsonRecord(value) ? value : null
}

function readString(record: unknown, key: string) {
  if (!isJsonRecord(record)) {
    return null
  }

  const value = record[key]

  return typeof value === "string" && value.trim() ? value.trim() : null
}

function readValue(record: unknown, key: string) {
  return isJsonRecord(record) ? record[key] : undefined
}

function normalizeMediaPayload(media: string) {
  if (!media.startsWith("data:")) {
    return media
  }

  return media.split(",")[1] ?? media
}

function getNextRecurringDate(
  campaign: {
    recurrenceDays: string[]
    recurrenceTime: string | null
    scheduledAt: Date | null
  },
  now: Date
) {
  const [hour, minute] = (
    campaign.recurrenceTime ||
    (campaign.scheduledAt
      ? `${String(campaign.scheduledAt.getHours()).padStart(2, "0")}:${String(
          campaign.scheduledAt.getMinutes()
        ).padStart(2, "0")}`
      : "09:00")
  )
    .split(":")
    .map((part) => Number(part))
  const allowedDays = new Set(campaign.recurrenceDays)

  for (let offset = 1; offset <= 14; offset += 1) {
    const next = new Date(now)
    next.setDate(now.getDate() + offset)
    next.setHours(hour || 9, minute || 0, 0, 0)

    if (!allowedDays.size || allowedDays.has(getWeekdayKey(next))) {
      return next
    }
  }

  return null
}

function getWeekdayKey(date: Date) {
  const keys = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ]

  return keys[date.getDay()]
}

async function evolutionRequest<T = unknown>(
  pathName: string,
  init: RequestInit = {}
) {
  const config = getEvolutionConfig()
  const headers = new Headers(init.headers)

  headers.set("apikey", config.apiKey)

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(`${config.baseUrl}${pathName}`, {
    ...init,
    headers,
    cache: "no-store",
  })
  const responseText = await response.text()

  if (!response.ok) {
    throw new WhatsAppCampaignError(
      `Evolution API retornou ${response.status}: ${responseText || "sem detalhes"}`,
      response.status || 502
    )
  }

  if (!responseText) {
    return undefined as T
  }

  return JSON.parse(responseText) as T
}

function getEvolutionConfig(): EvolutionConfig {
  const baseUrl = (
    process.env.EVOLUTION_API_URL ||
    process.env.NEXT_PRIVATE_EVOLUTION_API_URL ||
    "http://localhost:8080"
  ).replace(/\/+$/, "")
  const apiKey =
    process.env.EVOLUTION_API_KEY || process.env.AUTHENTICATION_API_KEY || ""

  if (!apiKey) {
    throw new WhatsAppCampaignError(
      "Configure EVOLUTION_API_KEY no .env.local.",
      500
    )
  }

  return {
    apiKey,
    baseUrl,
  }
}

function isRetryableEvolutionShapeError(error: unknown) {
  return error instanceof WhatsAppCampaignError && error.status >= 400
}

function statusToEventMessage(status: "PAUSED" | "RUNNING" | "CANCELED") {
  if (status === "PAUSED") {
    return "Campanha pausada."
  }

  if (status === "RUNNING") {
    return "Campanha retomada."
  }

  return "Campanha cancelada."
}

function randomInt(min: number, max: number) {
  const safeMin = Math.min(min, max)
  const safeMax = Math.max(min, max)

  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin
}

function clampInteger(value: number, min: number, max: number) {
  const parsed = Number.isFinite(value) ? Math.trunc(value) : min

  return Math.min(Math.max(parsed, min), max)
}

function uniqueClean(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Nao foi possivel enviar a mensagem."
}

export function isWhatsAppCampaignStatus(value: string): value is WhatsAppCampaignStatusCode {
  return value in WhatsAppCampaignStatus
}
