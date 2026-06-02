import React, { useEffect, useMemo, useState } from 'react';
import { Button, Carousel, Grid, Modal } from 'antd';
import type { ActiveUserAnnouncement, AnnouncementMediaItem } from '../../utils/userAnnouncements';
import ResilientImage from '../common/ResilientImage';

type UserAnnouncementsPopupHostProps = {
  items: ActiveUserAnnouncement[];
  onDismiss: (item: ActiveUserAnnouncement) => void | Promise<void>;
};

const normalizeText = (value: unknown) => String(value ?? '').trim();

const isDirectVideoUrl = (url: string) => /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url);

const resolveEmbedUrl = (url: string) => {
  const normalized = normalizeText(url);
  if (!normalized) return '';
  const youtubeMatch = normalized.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/i);
  if (youtubeMatch?.[1]) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }
  const aparatMatch = normalized.match(/aparat\.com\/(?:v|video\/video\/embed\/vcode)\/([a-zA-Z0-9]+)/i);
  if (aparatMatch?.[1]) {
    return `https://www.aparat.com/video/video/embed/videohash/${aparatMatch[1]}/vt/frame`;
  }
  return '';
};

const renderMediaItem = (item: AnnouncementMediaItem, index: number) => {
  const mediaType = normalizeText(item.media_type || 'image').toLowerCase();
  const attachment = normalizeText(item.attachment);
  const videoUrl = normalizeText(item.video_url);
  const caption = normalizeText(item.caption);

  if (mediaType === 'video') {
    if (videoUrl && isDirectVideoUrl(videoUrl)) {
      return (
        <div key={`video-${index}`} className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black/95 shadow-sm">
          <div className="min-h-[84px] md:min-h-[180px] max-h-[18vh] md:max-h-[34vh] flex items-center justify-center bg-black">
            <video controls preload="metadata" className="max-h-[18vh] md:max-h-[34vh] w-auto max-w-[90%] object-contain" src={videoUrl} />
          </div>
          {caption ? <div className="px-4 py-3 text-xs md:text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-dark-surface">{caption}</div> : null}
        </div>
      );
    }

    const embedUrl = resolveEmbedUrl(videoUrl);
    if (embedUrl) {
      return (
        <div key={`embed-${index}`} className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black/95 shadow-sm">
          <iframe
            src={embedUrl}
            title={caption || 'video'}
            className="w-full h-[92px] md:h-[210px]"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          {caption ? <div className="px-4 py-3 text-xs md:text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-dark-surface">{caption}</div> : null}
        </div>
      );
    }

    if (videoUrl) {
      return (
        <div key={`video-link-${index}`} className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs">
          <a href={videoUrl} target="_blank" rel="noreferrer" className="text-leather-600 dark:text-leather-300 underline break-all">
            {caption || 'مشاهده ویدیو'}
          </a>
        </div>
      );
    }
  }

  if (attachment) {
    return (
      <div key={`image-${index}`} className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface shadow-sm">
        <div className="min-h-[84px] md:min-h-[180px] max-h-[18vh] md:max-h-[34vh] flex items-center justify-center bg-gray-50 dark:bg-black/30 p-2">
          <ResilientImage
            src={attachment}
            preset="gallery"
            alt={caption || 'announcement'}
            className="max-h-[18vh] md:max-h-[34vh] w-auto max-w-[90%] object-contain"
            loading="lazy"
            decoding="async"
          />
        </div>
        {caption ? <div className="px-4 py-3 text-xs md:text-sm text-gray-600 dark:text-gray-300">{caption}</div> : null}
      </div>
    );
  }

  return null;
};

const UserAnnouncementsPopupHost: React.FC<UserAnnouncementsPopupHostProps> = ({ items, onDismiss }) => {
  const screens = Grid.useBreakpoint();
  const isMobileViewport = !screens.md;
  const [activeId, setActiveId] = useState<string | null>(null);

  const current = useMemo(() => {
    if (!activeId) return items[0] || null;
    return items.find((item) => item.id === activeId) || items[0] || null;
  }, [activeId, items]);

  useEffect(() => {
    if (!items.length) {
      setActiveId(null);
      return;
    }
    if (!activeId || !items.some((item) => item.id === activeId)) {
      setActiveId(items[0].id);
    }
  }, [activeId, items]);

  if (!current) return null;

  const mediaNodes = (current.media_items || []).map((item, index) => renderMediaItem(item, index)).filter(Boolean);

  return (
    <Modal
      open={Boolean(current)}
      onCancel={() => void onDismiss(current)}
      footer={[
        <Button
          key="dismiss"
          type="primary"
          className={`!rounded-xl ${isMobileViewport ? '!w-full !h-9 !px-3' : '!h-10 !px-5'}`}
          onClick={() => void onDismiss(current)}
        >
          {current.allow_dismiss ? 'متوجه شدم، دیگر نشان نده' : 'بستن'}
        </Button>,
      ]}
      width={isMobileViewport ? 'min(340px, calc(100vw - 52px))' : 680}
      destroyOnHidden
      title={null}
      zIndex={13250}
      styles={{
        body: {
          padding: isMobileViewport ? 10 : 24,
          maxHeight: isMobileViewport ? 'calc(var(--app-viewport-height, 100vh) - 210px)' : '76vh',
          overflowY: 'auto',
        },
      }}
    >
      <div className={`mx-auto w-full ${isMobileViewport ? 'max-w-full' : 'max-w-[560px]'}`}>
        <div className={`border-b border-gray-100 dark:border-gray-800 ${isMobileViewport ? 'mb-3 pb-2' : 'mb-4 pb-3'}`}>
          <h3 className={`m-0 font-extrabold text-gray-900 dark:text-gray-100 ${isMobileViewport ? 'text-xl leading-8' : 'text-2xl md:text-3xl leading-9'}`}>
            {current.title || 'اعلان'}
          </h3>
        </div>

        <div className={isMobileViewport ? 'space-y-3' : 'space-y-5'}>
          {current.body ? (
            <p className={`m-0 whitespace-pre-wrap text-gray-700 dark:text-gray-200 ${isMobileViewport ? 'text-sm leading-7' : 'text-base md:text-lg leading-8'}`}>
              {current.body}
            </p>
          ) : null}

          {mediaNodes.length > 1 ? (
            <Carousel dots className="[&_.slick-dots]:!bottom-[-8px]">
              {mediaNodes.map((node, index) => (
                <div key={`slide-${index}`} className="px-1 pb-4">{node}</div>
              ))}
            </Carousel>
          ) : mediaNodes.length === 1 ? (
            <div className="pb-1">{mediaNodes[0]}</div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};

export default UserAnnouncementsPopupHost;
