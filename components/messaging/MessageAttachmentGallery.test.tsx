import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MessageAttachmentGallery from './MessageAttachmentGallery';

describe('MessageAttachmentGallery', () => {
  it('makes attachments after the fourth image reachable and never falls back to the heavy original', () => {
    const attachments = Array.from({ length: 7 }, (_, i) => ({ name: `photo-${i}.jpg`, url: `https://api.test/storage/v1/object/public/images/${i}.jpg` }));
    render(<MessageAttachmentGallery attachments={attachments} />);
    fireEvent.click(screen.getByRole('button', { name: 'نمایش تصویر photo-3.jpg' }));
    expect(screen.getByRole('button', { name: 'نمایش تصویر photo-6.jpg' })).toBeVisible();
    fireEvent.error(screen.getByRole('img', { name: 'photo-0.jpg' }));
    expect(screen.queryByRole('img', { name: 'photo-0.jpg' })).not.toBeInTheDocument();
    expect(document.querySelector(`img[src="${attachments[0].url}"]`)).toBeNull();
  });
  it('تصویر بندانگشتی را کم‌حجم و lazy بارگذاری می‌کند', () => {
    render(<MessageAttachmentGallery attachments={[{
      name: 'نمونه.jpg',
      url: 'https://api.example.test/storage/v1/object/public/images/messages/sample.jpg',
      mimeType: 'image/jpeg',
    }]} />);

    const image = screen.getByRole('img', { name: 'نمونه.jpg' });
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image.getAttribute('src')).toContain('/storage/v1/render/image/public/');
    expect(image.getAttribute('src')).toContain('width=260');
  });
});
