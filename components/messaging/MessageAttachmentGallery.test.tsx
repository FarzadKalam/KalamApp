import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MessageAttachmentGallery from './MessageAttachmentGallery';

describe('MessageAttachmentGallery', () => {
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
