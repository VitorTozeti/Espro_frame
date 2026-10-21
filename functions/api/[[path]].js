import { handle } from '../_lib/api.js';
import { repoD1 } from '../_lib/d1.js';

/* Todas as rotas /api/* — login, sync, mídia, presença. Binding D1: DB. Opcionais: TOKEN_SECRET, ADMIN_EMAIL, RESEND_API_KEY + EMAIL_FROM (e-mail automático), SITE_URL. */
export const onRequest = ({ request, env, waitUntil }) => handle(request, env, repoD1(env.DB), p => waitUntil(p));
