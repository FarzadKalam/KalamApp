import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertNotesWithFallback: vi.fn(async () => []),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
    },
  },
  supabasePublic: { from: vi.fn() },
  supabaseSignUpClient: { from: vi.fn() },
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test-key',
  SUPABASE_AUTH_STORAGE_KEY: 'sb-example-auth-token',
}));

vi.mock('../../utils/storageClient', () => ({
  FILE_STORAGE_BUCKET: 'images',
  FILE_STORAGE_URL: 'https://example.supabase.co',
  FILE_STORAGE_ANON_KEY: 'anon-test-key',
  fileStorageClient: {
    storage: {
      from: vi.fn(() => ({ remove: vi.fn(async () => ({ data: null, error: null })) })),
    },
  },
}));

vi.mock('../files/FileManagerPickerModal', () => ({
  default: () => null,
}));

vi.mock('../../utils/noteDispatch', () => ({
  insertNotesWithFallback: mocks.insertNotesWithFallback,
}));

import { detectStoryMediaKindFromInput } from './StoryMediaUploadTrigger';
import {
  collectDedicatedMediaPathsForStoryCleanup,
  extractDedicatedStoryStoragePath,
} from '../../utils/storyMediaCleanup';
import {
  buildStoryMentionSystemNotePayload,
  extractMentionUserIdsFromSlides,
  sendStoryMentionSystemNotifications,
} from '../../utils/storyMentions';
import { resolveStoryCreatorIdentity } from '../../utils/orgStories';
import { buildStoryTextLayerStyle, computeStoryRenderScale } from './storyLayerRenderers';
import {
  SAAS_STORY_AVATAR_URL,
  SAAS_STORY_CREATOR_NAME,
  type StorySlide,
} from './storyTypes';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const STORY_ID = '22222222-2222-4222-8222-222222222222';
const CREATOR_ID = '33333333-3333-4333-8333-333333333333';
const USER_A = '44444444-4444-4444-8444-444444444444';
const USER_B = '55555555-5555-4555-8555-555555555555';

describe('Story Studio media kind & safety checks', () => {
  beforeEach(() => {
    mocks.insertNotesWithFallback.mockClear();
  });

  it('never classifies image files as video or audio', () => {
    expect(detectStoryMediaKindFromInput({ name: 'banner.jpg', mimeType: 'image/jpeg' }, 'video')).toBe('image');
    expect(detectStoryMediaKindFromInput({ name: 'photo.png', mimeType: 'image/png' }, 'audio')).toBe('image');
    expect(detectStoryMediaKindFromInput({ url: 'https://cdn.example.com/a/b/poster.webp?v=1' }, 'visual')).toBe('image');
    expect(detectStoryMediaKindFromInput({ name: 'clip.mp4', mimeType: 'video/mp4' }, 'visual')).toBe('video');
    expect(detectStoryMediaKindFromInput({ name: 'voice.webm', mimeType: 'audio/webm' }, 'audio')).toBe('audio');
    expect(detectStoryMediaKindFromInput({ name: 'track.mp3', mimeType: 'audio/mpeg' }, 'audio')).toBe('audio');
  });

  it('collects only dedicated story media paths and preserves File Manager assets on expiry cleanup', () => {
    const dedicatedImageUrl = `https://storage.example.com/storage/v1/object/public/images/stories/${ORG_ID}/images/abc.jpg`;
    const dedicatedVideoUrl = `https://storage.example.com/storage/v1/object/public/images/stories/${ORG_ID}/videos/clip.mp4`;
    const dedicatedAudioUrl = `https://storage.example.com/storage/v1/object/public/images/stories/${ORG_ID}/audio/voice.webm`;
    const fileManagerImageUrl = `https://storage.example.com/storage/v1/object/public/images/org/${ORG_ID}/files/shared-product.jpg`;
    const fileManagerAudioEvenInStoryFolder = `https://storage.example.com/storage/v1/object/public/images/stories/${ORG_ID}/audio/reused.mp3`;

    expect(extractDedicatedStoryStoragePath(dedicatedImageUrl, ORG_ID, 'images')).toBe(
      `stories/${ORG_ID}/images/abc.jpg`,
    );
    expect(extractDedicatedStoryStoragePath(fileManagerImageUrl, ORG_ID, 'images')).toBeNull();
    // جلوگیری از حذف فایل سایر سازمان‌ها
    expect(
      extractDedicatedStoryStoragePath(
        `https://storage.example.com/storage/v1/object/public/images/stories/${USER_A}/images/other.jpg`,
        ORG_ID,
        'images',
      ),
    ).toBeNull();

    const slides: StorySlide[] = [
      {
        id: 's1',
        type: 'image',
        image_url: dedicatedImageUrl,
        text_layers: [],
        stickers: [
          {
            id: 'st-audio-dedicated',
            type: 'audio',
            x: 50,
            y: 60,
            audio_url: dedicatedAudioUrl,
          },
          {
            id: 'st-audio-shared',
            type: 'audio',
            x: 50,
            y: 75,
            file_id: 'asset-row-99',
            audio_url: fileManagerAudioEvenInStoryFolder,
          },
        ],
        duration_ms: 5000,
      },
      {
        id: 's2',
        type: 'video',
        video_url: dedicatedVideoUrl,
        text_layers: [],
        duration_ms: 12000,
      },
      {
        id: 's3',
        type: 'image',
        image_url: fileManagerImageUrl,
        file_id: 'asset-row-101',
        text_layers: [],
        duration_ms: 5000,
      },
    ];

    const result = collectDedicatedMediaPathsForStoryCleanup(slides, ORG_ID, 'images');
    expect(result.dedicatedPaths).toEqual([
      `stories/${ORG_ID}/images/abc.jpg`,
      `stories/${ORG_ID}/audio/voice.webm`,
      `stories/${ORG_ID}/videos/clip.mp4`,
    ]);
    expect(result.cleanedSlides[0].media_cleaned).toBe(true);
    expect(result.cleanedSlides[0].image_url).toBeUndefined();
    expect(result.cleanedSlides[0].stickers?.[0]?.audio_url).toBe('');
    expect(result.cleanedSlides[0].stickers?.[1]?.audio_url).toBe(fileManagerAudioEvenInStoryFolder);
    expect(result.cleanedSlides[2].image_url).toBe(fileManagerImageUrl);
    expect(result.cleanedSlides[2].media_cleaned).toBeUndefined();
  });
});

describe('Story mention system inbox notifications & SaaS identity', () => {
  beforeEach(() => {
    mocks.insertNotesWithFallback.mockClear();
  });

  it('builds a system inbox note payload with deduplicated new mentions', () => {
    const slides: StorySlide[] = [
      {
        id: 's1',
        type: 'gradient',
        gradient_key: 'brand_indigo',
        text_layers: [],
        stickers: [
          { id: 'm1', type: 'mention', x: 50, y: 40, user_id: USER_A, user_name: 'سارا' },
          { id: 'm2', type: 'mention', x: 50, y: 55, user_id: CREATOR_ID, user_name: 'خودم' },
          { id: 'm3', type: 'mention', x: 50, y: 70, user_id: USER_B, user_name: 'امیر' },
        ],
        duration_ms: 5000,
      },
    ];

    const extracted = extractMentionUserIdsFromSlides(slides);
    expect(extracted).toEqual([USER_A, CREATOR_ID, USER_B]);

    const notePayload = buildStoryMentionSystemNotePayload({
      orgId: ORG_ID,
      storyId: STORY_ID,
      creatorId: CREATOR_ID,
      creatorName: 'المیرا دباغ',
      mentionUserIds: extracted,
      previousMentionUserIds: [USER_A],
      appOrigin: 'https://app.tazesystem.ir/',
    });

    expect(notePayload).not.toBeNull();
    expect(notePayload?.source_type).toBe('system');
    expect(notePayload?.author_id).toBeNull();
    expect(notePayload?.mention_user_ids).toEqual([USER_B]);
    expect(notePayload?.metadata?.conversation_key).toBe('system');
    expect(notePayload?.metadata?.action_url).toBe(`/dashboard?storyId=${STORY_ID}`);
  });

  it('dispatches story mention system notifications with minimal returning so recipient guard RLS never blocks creator', async () => {
    await sendStoryMentionSystemNotifications({
      orgId: ORG_ID,
      storyId: STORY_ID,
      creatorId: CREATOR_ID,
      creatorName: 'المیرا دباغ',
      mentionUserIds: [USER_A, CREATOR_ID],
    });

    expect(mocks.insertNotesWithFallback).toHaveBeenCalledTimes(1);
    expect(mocks.insertNotesWithFallback).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          org_id: ORG_ID,
          source_type: 'system',
          author_id: null,
          mention_user_ids: [USER_A],
        }),
      ],
      { returning: 'minimal' },
    );
  });

  it('always enforces TazeSystem Persian identity and logo on saas-wide stories', () => {
    const saasIdentity = resolveStoryCreatorIdentity({
      is_saas_wide: true,
      creator_name: 'Some Operator',
      creator_avatar: 'https://example.com/old-avatar.png',
    });
    expect(saasIdentity.creatorName).toBe(SAAS_STORY_CREATOR_NAME);
    expect(saasIdentity.creatorAvatar).toBe(SAAS_STORY_AVATAR_URL);

    const orgIdentity = resolveStoryCreatorIdentity({
      is_saas_wide: false,
      creator_name: 'نازنین کریمی',
      creator_avatar: '/avatar.jpg',
    });
    expect(orgIdentity.creatorName).toBe('نازنین کریمی');
  });

  it('computes non-rotated WYSIWYG text styles proportionally', () => {
    const scale = computeStoryRenderScale(340);
    expect(scale).toBe(1);
    const style = buildStoryTextLayerStyle(
      {
        id: 't1',
        content: 'سلام',
        x: 50,
        y: 50,
        font_size: 24,
        color: '#FFFFFF',
        align: 'center',
        bold: true,
        style_variant: 'pill_brand',
      },
      scale,
    );
    expect(style.fontSize).toBe(24);
    expect(style.transform).toBeUndefined();
    expect(style.fontWeight).toBe(700);
  });
});
