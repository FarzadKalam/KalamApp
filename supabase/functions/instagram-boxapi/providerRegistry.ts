export type InstagramProviderOperation = {
  method: 'GET' | 'POST';
  path: string;
};

export type InstagramProviderDefinition = {
  key: string;
  label: string;
  defaultBaseUrl: string;
  apiKeyHeader: string;
  apiKeyLabel: string;
  operations: Record<'sync_accounts' | 'list_posts' | 'send_message' | 'reply_comment' | 'get_connect_url', InstagramProviderOperation>;
};

// هر سرویس‌دهندهٔ جدید فقط با یک adapter مستقل به این رجیستری افزوده می‌شود؛
// مدل داده و رابط کاربری به نام یک سرویس‌دهنده وابسته نیستند.
export const instagramProviderRegistry: Record<string, InstagramProviderDefinition> = {
  boxapi: {
    key: 'boxapi',
    label: 'BoxAPI',
    defaultBaseUrl: 'https://boxapi.ir',
    apiKeyHeader: 'X-Api-Key',
    apiKeyLabel: 'کلید API BoxAPI',
    operations: {
      sync_accounts: { method: 'GET', path: '/service/accounts' },
      list_posts: { method: 'POST', path: '/service/actions/list_posts' },
      send_message: { method: 'POST', path: '/service/actions/send_message' },
      reply_comment: { method: 'POST', path: '/service/actions/reply_comment' },
      get_connect_url: { method: 'GET', path: '/service/info' },
    },
  },
};

export const listInstagramProviders = () => Object.values(instagramProviderRegistry).map(({ key, label, apiKeyLabel }) => ({ key, label, apiKeyLabel }));

export const getInstagramProvider = (key: string) => instagramProviderRegistry[String(key || '').trim()];
