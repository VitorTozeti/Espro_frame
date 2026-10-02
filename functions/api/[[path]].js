import { handle } from '../_lib/api.js';
import { repoD1 } from '../_lib/d1.js';

/* Todas as rotas /api/* — login, sync, mídia, presença. Binding D1: DB. Segredos: TEAM_CODE, TOKEN_SECRET. */
export const onRequest = ({ request, env }) => handle(request, env, repoD1(env.DB));
