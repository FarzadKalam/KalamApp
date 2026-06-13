export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.replace(/^data:[^;]+;base64,/, ''));
    };
    reader.onerror = () => reject(reader.error || new Error('خواندن فایل ناموفق بود.'));
    reader.readAsDataURL(blob);
  });
