import { supabase } from '../supabaseClient';
import type { OutboundChannelType } from './channelSettings';

export type OutboundMessageStatus =
  | 'pending'
  | 'provider_accepted'
  | 'sent'
  | 'delivered'
  | 'not_delivered'
  | 'operator_failed'
  | 'filtered'
  | 'blacklisted'
  | 'unknown_delivery'
  | 'failed'
  | 'skipped'
  | 'received'
  | 'processed'
  | 'ignored';

export type OutboundMessagePayload = {
  channelType: OutboundChannelType;
  provider?: string;
  moduleId?: string;
  recordId?: string;
  customerId?: string;
  recipient?: string;
  title?: string;
  messageText: string;
  metadata?: Record<string, any>;
};

const normalizePayload = (payload: OutboundMessagePayload) => ({
  channel_type: payload.channelType,
  provider: payload.provider || null,
  module_id: payload.moduleId || null,
  record_id: payload.recordId || null,
  customer_id: payload.customerId || null,
  recipient: payload.recipient || null,
  title: payload.title || null,
  message_text: String(payload.messageText || ''),
  metadata: payload.metadata || {},
});

export const createOutboundMessageLog = async (payload: OutboundMessagePayload) => {
  const { data, error } = await supabase
    .from('outbound_messages')
    .insert({
      ...normalizePayload(payload),
      status: 'pending',
    })
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

export const updateOutboundMessageStatus = async (
  id: string,
  status: OutboundMessageStatus,
  patch?: {
    providerMessageId?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, any>;
    sentAt?: string | null;
  }
) => {
  const nextPatch: Record<string, any> = {
    status,
  };

  if (patch?.providerMessageId !== undefined) {
    nextPatch.provider_message_id = patch.providerMessageId;
  }
  if (patch?.errorMessage !== undefined) {
    nextPatch.error_message = patch.errorMessage;
  }
  if (patch?.metadata !== undefined) {
    nextPatch.metadata = patch.metadata;
  }
  if (patch?.sentAt !== undefined) {
    nextPatch.sent_at = patch.sentAt;
  } else if (status === 'sent' || status === 'provider_accepted' || status === 'delivered') {
    nextPatch.sent_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('outbound_messages')
    .update(nextPatch)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data || null;
};
