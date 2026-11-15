import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './worker/index';
import { createSqliteD1 } from './server/sqlite-d1';
import { analyzeProductWithGemini, generateScriptsWithGemini } from './server/gemini';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

function readRawBody(req: express.Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function startServer() {
  const db = await createSqliteD1();

  const env: Env = {
    DB: db,
    BOOTSTRAP_ADMIN_KEY: process.env.BOOTSTRAP_ADMIN_KEY,
    APP_ORIGIN: process.env.APP_ORIGIN,
    SESSION_DAYS: process.env.SESSION_DAYS || '7',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    IMAGEKIT_PUBLIC_KEY: process.env.IMAGEKIT_PUBLIC_KEY,
    IMAGEKIT_PRIVATE_KEY: process.env.IMAGEKIT_PRIVATE_KEY,
    IMAGEKIT_URL_ENDPOINT: process.env.IMAGEKIT_URL_ENDPOINT,
    KOKORO_TTS_URL: process.env.KOKORO_TTS_URL,
    COMFYUI_API_URL: process.env.COMFYUI_API_URL,
    AI_CALLER: {
      analyzeProduct: analyzeProductWithGemini,
      generateScripts: generateScriptsWithGemini,
    },
  };

  const app = express();
  app.set('trust proxy', true);

  app.use('/api', async (req, res) => {
    try {
      const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || req.protocol || 'http';
      const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() || req.headers.host || `localhost:${PORT}`;
      const url = `${proto}://${host}${req.originalUrl}`;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) headers.append(key, item);
        } else {
          headers.set(key, value);
        }
      }

      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const rawBody = hasBody ? await readRawBody(req) : undefined;
      const webRequest = new Request(url, {
        method: req.method,
        headers,
        body: hasBody && rawBody && rawBody.length > 0 ? new Uint8Array(rawBody) : undefined,
      });

      const webResponse = await worker.fetch(webRequest, env);
      res.status(webResponse.status);

      const setCookies = typeof webResponse.headers.getSetCookie === 'function'
        ? webResponse.headers.getSetCookie()
        : [];
      for (const cookieVal of setCookies) {
        res.append('set-cookie', cookieVal);
      }

      webResponse.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') return;
        res.setHeader(key, value);
      });

      const buffer = Buffer.from(await webResponse.arrayBuffer());
      res.send(buffer);
    } catch (error) {
      console.error('[AI Studio Server] API error:', error);
      res.status(500).json({ error: 'Đã xảy ra lỗi máy chủ.' });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.use((_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, HOST, () => {
    console.log(`AI Product Video Studio listening on http://${HOST}:${PORT}`);
  });
}

startServer();
