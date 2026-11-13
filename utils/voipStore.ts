import { useSyncExternalStore } from 'react';
import {
  Invitation,
  Inviter,
  Registerer,
  RegistererState,
  Session,
  SessionState,
  URI,
  UserAgent,
} from 'sip.js';
import { supabase } from '../supabaseClient';
import { normalizePhoneForStorage } from './phoneNumber';
import { getRecordTitle } from './recordTitle';
import { MODULES } from '../moduleRegistry';

export type WebPhoneRegistrationStatus =
  | 'disabled'
  | 'idle'
  | 'connecting'
  | 'registered'
  | 'error';

export type WebPhoneCallDirection = 'incoming' | 'outgoing';

export type WebPhoneMatchedContact = {
  moduleId: string;
  recordId: string;
  title: string;
};

export type WebPhoneCallSnapshot = {
  callId: string;
  direction: WebPhoneCallDirection;
  state: 'ringing' | 'connecting' | 'active';
  remoteNumber: string;
  remoteDisplayName: string;
  startedAtMs: number;
  answeredAtMs: number | null;
  muted: boolean;
  held: boolean;
  matchedContact: WebPhoneMatchedContact | null;
  contextModuleId?: string | null;
  contextRecordId?: string | null;
};

export type WebPhoneSessionConfig = {
  enabled: boolean;
  reason?: string | null;
  message?: string | null;
  dialMode?: string;
  provider?: string;
  wssUrl?: string;
  sipDomain?: string;
  iceServers?: RTCIceServer[];
  endpoint?: {
    extension: string;
    displayName: string;
    pjsipId: string;
    sipUri: string;
    sipSecret: string;
    transport: string;
  };
};

export type VoipWebPhoneSnapshot = {
  available: boolean;
  status: WebPhoneRegistrationStatus;
  errorMessage: string | null;
  panelOpen: boolean;
  extension: string | null;
  displayName: string | null;
  provider: string | null;
  activeCall: WebPhoneCallSnapshot | null;
};

const listeners = new Set<() => void>();
let snapshot: VoipWebPhoneSnapshot = {
  available: false,
  status: 'idle',
  errorMessage: null,
  panelOpen: false,
  extension: null,
  displayName: null,
  provider: null,
  activeCall: null,
};

let userAgent: UserAgent | null = null;
let registerer: Registerer | null = null;
let activeSession: Session | null = null;
let currentConfig: WebPhoneSessionConfig | null = null;
let remoteAudioElement: HTMLAudioElement | null = null;
let connectPromise: Promise<boolean> | null = null;

const emit = () => {
  listeners.forEach((listener) => listener());
};

const updateSnapshot = (patch: Partial<VoipWebPhoneSnapshot>) => {
  snapshot = { ...snapshot, ...patch };
  emit();
};

const ensureRemoteAudioElement = () => {
  if (typeof document === 'undefined') return null;
  if (!remoteAudioElement) {
    remoteAudioElement = document.createElement('audio');
    remoteAudioElement.autoplay = true;
    remoteAudioElement.setAttribute('playsinline', 'true');
    remoteAudioElement.style.display = 'none';
    document.body.appendChild(remoteAudioElement);
  }
  return remoteAudioElement;
};

const attachRemoteAudio = (session: Session) => {
  const sdh: any = session.sessionDescriptionHandler;
  if (!sdh) return;
  const audioEl = ensureRemoteAudioElement();
  if (!audioEl) return;

  const stream: MediaStream | undefined = sdh.remoteMediaStream;
  if (stream && audioEl.srcObject !== stream) {
    audioEl.srcObject = stream;
    void audioEl.play().catch(() => undefined);
  }
};

const setSessionAudioTrackMuted = (session: Session, muted: boolean) => {
  const sdh: any = session.sessionDescriptionHandler;
  const pc: RTCPeerConnection | undefined = sdh?.peerConnection || sdh?._peerConnection;
  if (!pc) return;
  pc.getSenders().forEach((sender) => {
    if (sender.track && sender.track.kind === 'audio') {
      sender.track.enabled = !muted;
    }
  });
};

const lookupCrmContactByPhone = async (rawPhone: string): Promise<WebPhoneMatchedContact | null> => {
  const normalized = normalizePhoneForStorage(rawPhone) || String(rawPhone || '').replace(/\D/g, '');
  if (!normalized || normalized.length < 5) return null;
  const suffix = normalized.slice(-9);
  try {
    const { data: phoneRows } = await supabase
      .from('phone_numbers')
      .select('id')
      .or(`normalized_number.eq.${normalized},normalized_number.ilike.%${suffix}`)
      .limit(3);

    if (Array.isArray(phoneRows) && phoneRows.length > 0) {
      const ids = phoneRows.map((r: any) => r.id).filter(Boolean);
      const { data: linkRows } = await supabase
        .from('phone_number_links')
        .select('entity_type, entity_id')
        .in('phone_number_id', ids)
        .limit(1);
      const firstLink = Array.isArray(linkRows) ? linkRows[0] : null;
      if (firstLink?.entity_type && firstLink?.entity_id) {
        const modCfg = MODULES[firstLink.entity_type];
        const table = modCfg?.table || firstLink.entity_type;
        const { data: rec } = await supabase
          .from(table)
          .select('*')
          .eq('id', firstLink.entity_id)
          .limit(1)
          .maybeSingle();
        if (rec) {
          return {
            moduleId: firstLink.entity_type,
            recordId: String(firstLink.entity_id),
            title: getRecordTitle(rec, modCfg, { fallback: normalized }),
          };
        }
      }
    }
  } catch {
    // Non-blocking lookup
  }
  return null;
};

const logWebRtcCall = async (payload: Record<string, any>) => {
  try {
    await supabase.functions.invoke('voip-session', {
      body: { action: 'log_webrtc_call', ...payload },
    });
  } catch {
    // Do not interrupt active audio call on telemetry failure
  }
};

const bindSessionLifecycle = (
  session: Session,
  meta: {
    callId: string;
    direction: WebPhoneCallDirection;
    remoteNumber: string;
    remoteDisplayName: string;
    contextModuleId?: string | null;
    contextRecordId?: string | null;
  },
) => {
  activeSession = session;
  const startedAtMs = Date.now();
  updateSnapshot({
    panelOpen: true,
    activeCall: {
      callId: meta.callId,
      direction: meta.direction,
      state: meta.direction === 'incoming' ? 'ringing' : 'connecting',
      remoteNumber: meta.remoteNumber,
      remoteDisplayName: meta.remoteDisplayName || meta.remoteNumber,
      startedAtMs,
      answeredAtMs: null,
      muted: false,
      held: false,
      matchedContact: null,
      contextModuleId: meta.contextModuleId || null,
      contextRecordId: meta.contextRecordId || null,
    },
  });

  void lookupCrmContactByPhone(meta.remoteNumber).then((matched) => {
    if (!matched || snapshot.activeCall?.callId !== meta.callId) return;
    updateSnapshot({
      activeCall: {
        ...snapshot.activeCall,
        matchedContact: matched,
        remoteDisplayName: matched.title || snapshot.activeCall.remoteDisplayName,
      },
    });
  });

  void logWebRtcCall({
    callId: meta.callId,
    direction: meta.direction,
    status: 'ringing',
    sourceNumber: meta.direction === 'incoming' ? meta.remoteNumber : snapshot.extension,
    destinationNumber: meta.direction === 'outgoing' ? meta.remoteNumber : snapshot.extension,
    extension: snapshot.extension,
    moduleId: meta.contextModuleId,
    recordId: meta.contextRecordId,
  });

  session.stateChange.addListener((newState) => {
    if (activeSession !== session) return;
    if (newState === SessionState.Established) {
      attachRemoteAudio(session);
      const currentCall = snapshot.activeCall;
      if (currentCall && currentCall.callId === meta.callId) {
        updateSnapshot({
          activeCall: {
            ...currentCall,
            state: 'active',
            answeredAtMs: Date.now(),
          },
        });
      }
      void logWebRtcCall({
        callId: meta.callId,
        direction: meta.direction,
        status: 'answered',
        sourceNumber: meta.direction === 'incoming' ? meta.remoteNumber : snapshot.extension,
        destinationNumber: meta.direction === 'outgoing' ? meta.remoteNumber : snapshot.extension,
        extension: snapshot.extension,
      });
    } else if (newState === SessionState.Terminated) {
      const currentCall = snapshot.activeCall;
      const wasAnswered = Boolean(currentCall?.answeredAtMs);
      const talkSeconds = currentCall?.answeredAtMs
        ? Math.max(0, Math.round((Date.now() - currentCall.answeredAtMs) / 1000))
        : 0;
      activeSession = null;
      if (remoteAudioElement) {
        remoteAudioElement.srcObject = null;
      }
      updateSnapshot({ activeCall: null });
      void logWebRtcCall({
        callId: meta.callId,
        direction: meta.direction,
        status: wasAnswered ? 'completed' : 'missed',
        talkSeconds,
        sourceNumber: meta.direction === 'incoming' ? meta.remoteNumber : snapshot.extension,
        destinationNumber: meta.direction === 'outgoing' ? meta.remoteNumber : snapshot.extension,
        extension: snapshot.extension,
      });
    }
  });
};

export const disconnectVoipWebPhone = async () => {
  try {
    if (activeSession) {
      if (activeSession.state === SessionState.Established) {
        await activeSession.bye().catch(() => undefined);
      } else if (activeSession instanceof Inviter) {
        await activeSession.cancel().catch(() => undefined);
      } else if (activeSession instanceof Invitation) {
        await activeSession.reject().catch(() => undefined);
      }
      activeSession = null;
    }
    if (registerer) {
      await registerer.unregister().catch(() => undefined);
      registerer = null;
    }
    if (userAgent) {
      await userAgent.stop().catch(() => undefined);
      userAgent = null;
    }
  } finally {
    currentConfig = null;
    updateSnapshot({
      status: 'idle',
      activeCall: null,
    });
  }
};

export const connectVoipWebPhone = async (options?: { force?: boolean }): Promise<boolean> => {
  if (connectPromise && !options?.force) return connectPromise;
  if (snapshot.status === 'registered' && userAgent && !options?.force) return true;

  connectPromise = (async () => {
    try {
      if (options?.force) {
        await disconnectVoipWebPhone();
      }
      updateSnapshot({ status: 'connecting', errorMessage: null });

      const { data, error } = await supabase.functions.invoke('voip-session', {
        body: { action: 'get_webphone_session' },
      });
      if (error) throw new Error(error.message || 'دریافت نشست تلفن زنده ناموفق بود.');
      const cfg = (data || {}) as WebPhoneSessionConfig;
      currentConfig = cfg;

      if (!cfg.enabled || !cfg.endpoint || !cfg.wssUrl) {
        updateSnapshot({
          available: cfg.reason !== 'plan_disabled' && cfg.reason !== 'user_disabled',
          status: 'disabled',
          extension: cfg.endpoint?.extension || null,
          displayName: cfg.endpoint?.displayName || null,
          provider: cfg.provider || null,
          errorMessage: cfg.message || null,
        });
        return false;
      }

      const uri = UserAgent.makeURI(cfg.endpoint.sipUri);
      if (!uri) throw new Error('آدرس SIP داخلی معتبر نیست.');

      const ua = new UserAgent({
        uri,
        authorizationUsername: cfg.endpoint.pjsipId,
        authorizationPassword: cfg.endpoint.sipSecret,
        displayName: cfg.endpoint.displayName,
        transportOptions: {
          server: cfg.wssUrl,
        },
        sessionDescriptionHandlerFactoryOptions: {
          peerConnectionConfiguration: {
            iceServers: Array.isArray(cfg.iceServers) ? cfg.iceServers : [],
          },
        },
        delegate: {
          onInvite: (invitation: Invitation) => {
            if (activeSession) {
              void invitation.reject().catch(() => undefined);
              return;
            }
            const fromUri = invitation.remoteIdentity?.uri;
            const callerNum = String(fromUri?.user || 'ناشناس').trim();
            const callerName = String(invitation.remoteIdentity?.displayName || callerNum).trim();
            bindSessionLifecycle(invitation, {
              callId: invitation.request.callId || `in_${Date.now()}`,
              direction: 'incoming',
              remoteNumber: callerNum,
              remoteDisplayName: callerName,
            });
          },
        },
      });

      const reg = new Registerer(ua, { expires: 300 });
      reg.stateChange.addListener((state) => {
        if (registerer !== reg) return;
        if (state === RegistererState.Registered) {
          updateSnapshot({
            available: true,
            status: 'registered',
            errorMessage: null,
            extension: cfg.endpoint?.extension || null,
            displayName: cfg.endpoint?.displayName || null,
            provider: cfg.provider || null,
          });
        } else if (state === RegistererState.Unregistered && snapshot.status !== 'idle') {
          updateSnapshot({ status: 'idle' });
        }
      });

      await ua.start();
      await reg.register();
      userAgent = ua;
      registerer = reg;

      updateSnapshot({
        available: true,
        extension: cfg.endpoint.extension,
        displayName: cfg.endpoint.displayName,
        provider: cfg.provider || null,
      });
      return true;
    } catch (err: any) {
      updateSnapshot({
        available: true,
        status: 'error',
        errorMessage: String(err?.message || 'اتصال تلفن زنده تحت وب برقرار نشد.'),
      });
      return false;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
};

export const dialWebPhone = async (
  rawTarget: string,
  context?: { moduleId?: string | null; recordId?: string | null; title?: string | null },
): Promise<boolean> => {
  const cleanTarget = String(rawTarget || '').trim();
  if (!cleanTarget) throw new Error('شماره مقصد وارد نشده است.');
  if (activeSession) throw new Error('در حال حاضر یک تماس فعال وجود دارد.');

  const connected = snapshot.status === 'registered' && userAgent ? true : await connectVoipWebPhone();
  if (!connected || !userAgent || !currentConfig?.sipDomain) {
    throw new Error(snapshot.errorMessage || 'تلفن زنده تحت وب متصل نیست.');
  }

  const targetUri: URI | undefined = UserAgent.makeURI(`sip:${cleanTarget}@${currentConfig.sipDomain}`);
  if (!targetUri) throw new Error('شماره یا داخلی مقصد معتبر نیست.');

  const inviter = new Inviter(userAgent, targetUri, {
    sessionDescriptionHandlerOptions: {
      constraints: { audio: true, video: false },
    },
  });

  bindSessionLifecycle(inviter, {
    callId: inviter.request.callId || `out_${Date.now()}`,
    direction: 'outgoing',
    remoteNumber: cleanTarget,
    remoteDisplayName: String(context?.title || cleanTarget).trim(),
    contextModuleId: context?.moduleId || null,
    contextRecordId: context?.recordId || null,
  });

  await inviter.invite();
  return true;
};

export const answerWebPhoneCall = async () => {
  if (!(activeSession instanceof Invitation)) return;
  await activeSession.accept({
    sessionDescriptionHandlerOptions: {
      constraints: { audio: true, video: false },
    },
  });
};

export const rejectOrHangupWebPhoneCall = async () => {
  const session = activeSession;
  if (!session) return;
  if (session.state === SessionState.Established) {
    await session.bye();
    return;
  }
  if (session instanceof Inviter) {
    await session.cancel();
    return;
  }
  if (session instanceof Invitation) {
    await session.reject();
  }
};

export const toggleMuteWebPhone = () => {
  if (!activeSession || !snapshot.activeCall) return;
  const nextMuted = !snapshot.activeCall.muted;
  setSessionAudioTrackMuted(activeSession, nextMuted);
  updateSnapshot({
    activeCall: { ...snapshot.activeCall, muted: nextMuted },
  });
};

export const toggleHoldWebPhone = async () => {
  if (!activeSession || !snapshot.activeCall) return;
  const nextHeld = !snapshot.activeCall.held;
  const options = {
    requestDelegate: undefined,
    sessionDescriptionHandlerModifiers: [
      (description: RTCSessionDescriptionInit) => {
        if (!description.sdp) return Promise.resolve(description);
        const sdp = nextHeld
          ? description.sdp.replace(/a=sendrecv/g, 'a=sendonly').replace(/a=recvonly/g, 'a=inactive')
          : description.sdp.replace(/a=sendonly/g, 'a=sendrecv').replace(/a=inactive/g, 'a=recvonly');
        return Promise.resolve({ ...description, sdp });
      },
    ],
  };
  await activeSession.invite(options);
  updateSnapshot({
    activeCall: { ...snapshot.activeCall, held: nextHeld },
  });
};

export const sendDtmfWebPhone = async (digit: string) => {
  if (!activeSession || activeSession.state !== SessionState.Established) return;
  const clean = String(digit || '').trim().slice(0, 1);
  if (!/^[0-9*#A-D]$/.test(clean)) return;
  await activeSession.info({
    requestOptions: {
      body: {
        contentDisposition: 'render',
        contentType: 'application/dtmf-relay',
        content: `Signal=${clean}\r\nDuration=160`,
      },
    },
  });
};

export const transferWebPhoneCall = async (targetExtension: string) => {
  if (!activeSession || activeSession.state !== SessionState.Established || !currentConfig?.sipDomain) return;
  const cleanTarget = String(targetExtension || '').replace(/[^\w*#+]/g, '').trim();
  if (!cleanTarget) throw new Error('شماره داخلی مقصد انتقال معتبر نیست.');
  const targetUri = UserAgent.makeURI(`sip:${cleanTarget}@${currentConfig.sipDomain}`);
  if (!targetUri) throw new Error('آدرس انتقال معتبر نیست.');
  await activeSession.refer(targetUri);
};

export const setVoipPanelOpen = (panelOpen: boolean) => {
  updateSnapshot({ panelOpen });
};

export const getVoipSnapshot = () => snapshot;

export const useVoipState = (): VoipWebPhoneSnapshot =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => snapshot,
    () => snapshot,
  );
