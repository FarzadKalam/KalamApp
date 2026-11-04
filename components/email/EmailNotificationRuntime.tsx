import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { listEmailMessages } from '../../utils/organizationEmail';
import { setUiNotificationOverlayItems } from '../../utils/uiNotificationOverlayStore';
export default function EmailNotificationRuntime({ orgId, userId }: { orgId: string | null; userId: string | null }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!orgId || !userId) return; let alive = true; let pending = false;
    const source = `email:${orgId}:${userId}`;
    const refresh = async () => { if (pending) return; pending = true; try { const mails = await listEmailMessages('unread'); if (alive) setUiNotificationOverlayItems(mails.map(mail => ({ id: `email:${mail.id}`, kind: 'email', channel: 'email', kindLabel: 'ایمیل', title: mail.subject || 'بدون موضوع', subtitle: mail.from_name || mail.from_address, body: mail.body_text.slice(0, 1000), createdAt: mail.message_at, hasAttachments: mail.attachments.length > 0, onOpen: () => navigate(`/messages?tab=email_messages&email=${encodeURIComponent(mail.id)}`) })), source); } catch { if (alive) setUiNotificationOverlayItems([], source); } finally { pending = false; } };
    void refresh();
    const channel = supabase.channel(`email-overlay-${orgId}-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'email_messages', filter: `org_id=eq.${orgId}` }, refresh).on('postgres_changes', { event: '*', schema: 'public', table: 'email_message_receipts', filter: `org_id=eq.${orgId}` }, refresh).subscribe();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60000);
    window.addEventListener('organization-email-changed', refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('organization-email-changed', refresh); void supabase.removeChannel(channel); setUiNotificationOverlayItems([], source); };
  }, [navigate, orgId, userId]);
  return null;
}
