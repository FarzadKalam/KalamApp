console.log('main function started');

const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true';
const DEFAULT_WORKER_TIMEOUT_MS = 60 * 1000;
// تولید تصویر ممکن است چند دقیقه زمان ببرد. این سقف فقط برای worker داخلی
// تصویر است و مسیرهای عادی Edge Function را کوتاه و محافظت‌شده نگه می‌دارد.
const AI_IMAGE_WORKER_TIMEOUT_MS = 15 * 60 * 1000;

function getAuthToken(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) throw new Error('Missing authorization header');
  const [bearer, token] = authHeader.split(' ');
  if (bearer !== 'Bearer') throw new Error("Auth header is not 'Bearer {token}'");
  return token;
}

function isTrustedAiImageWorkerRequest(req: Request, serviceName: string) {
  if (serviceName === 'ai-image-worker') return true;
  if (serviceName !== 'ai-assistant') return false;

  const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return token === serviceRoleKey
    && req.headers.get('x-kalam-internal') === 'ai-image-worker';
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'OPTIONS' && VERIFY_JWT) {
    try {
      getAuthToken(req);
    } catch (e) {
      return new Response(JSON.stringify({ msg: String(e) }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const serviceName = pathParts[1];

  if (!serviceName) {
    return new Response(JSON.stringify({ msg: 'missing function name in request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const servicePath = `/home/deno/functions/${serviceName}`;
  const envVarsObj = Deno.env.toObject();
  const envVars = Object.keys(envVarsObj).map((key) => [key, envVarsObj[key]]);
  const workerTimeoutMs = isTrustedAiImageWorkerRequest(req, serviceName)
    ? AI_IMAGE_WORKER_TIMEOUT_MS
    : DEFAULT_WORKER_TIMEOUT_MS;

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs,
      noModuleCache: false,
      importMapPath: null,
      envVars,
    });
    return await worker.fetch(req);
  } catch (e) {
    return new Response(JSON.stringify({ msg: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
