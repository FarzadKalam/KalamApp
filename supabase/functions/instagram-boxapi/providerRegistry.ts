export type InstagramProviderOperation = {
  method: 'GET' | 'POST';
  path: string;
};

export type InstagramProviderDefinition = {
  key: string;
  label: string;
  defaultBaseUrl: string;
  apiBaseUrlRequired: boolean;
  apiBaseUrlPlaceholder: string;
  apiKeyHeader: string;
  apiKeyLabel: string;
  operations: Record<'sync_accounts' | 'list_posts' | 'send_message' | 'send_generic_template' | 'reply_comment' | 'get_connect_url' | 'show_profile' | 'follow_status', InstagramProviderOperation>;
};

// هر سرویس‌دهندهٔ جدید فقط با یک adapter مستقل به این رجیستری افزوده می‌شود؛
// مدل داده و رابط کاربری به نام یک سرویس‌دهنده وابسته نیستند.
export const instagramProviderRegistry: Record<string, InstagramProviderDefinition> = {
  boxapi: {
    key: 'boxapi',
    label: 'اتصال رسمی اینستاگرام',
    defaultBaseUrl: 'https://api.sendbox.chat/api/v1',
    apiBaseUrlRequired: true,
    apiBaseUrlPlaceholder: 'https://api.sendbox.chat/api/v1',
    apiKeyHeader: 'X-Api-Key',
    apiKeyLabel: 'کلید API اتصال اینستاگرام',
    operations: {
      sync_accounts: { method: 'GET', path: '/service/accounts' },
      list_posts: { method: 'POST', path: '/service/actions/list_posts' },
      send_message: { method: 'POST', path: '/service/actions/send_message' },
      send_generic_template: { method: 'POST', path: '/service/actions/send_generic_template' },
      reply_comment: { method: 'POST', path: '/service/actions/reply_comment' },
      get_connect_url: { method: 'GET', path: '/service/info' },
      show_profile: { method: 'POST', path: '/service/actions/show_profile' },
      follow_status: { method: 'POST', path: '/service/actions/follow_status' },
    },
  },
};

export const listInstagramProviders = () => Object.values(instagramProviderRegistry).map(({ key, label, defaultBaseUrl, apiKeyLabel, apiBaseUrlRequired, apiBaseUrlPlaceholder }) => ({ key, label, defaultBaseUrl, apiKeyLabel, apiBaseUrlRequired, apiBaseUrlPlaceholder }));

export const getInstagramProvider = (key: string) => instagramProviderRegistry[String(key || '').trim()];
