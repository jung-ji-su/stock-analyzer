import { createGateway } from './server.js';
import { TokenManager } from './token.js';
import { firebaseOwnerVerifier } from './auth.js';

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`missing env ${k}`); process.exit(1); } return v; };
const baseUrl = process.env.TOSS_BASE_URL || 'https://openapi.tossinvest.com';

const server = createGateway({
  baseUrl,
  tokens: new TokenManager({ baseUrl, clientId: need('TOSS_CLIENT_ID'), clientSecret: need('TOSS_CLIENT_SECRET') }),
  verify: firebaseOwnerVerifier({
    projectId: need('FIREBASE_PROJECT_ID'),
    ownerUid: process.env.OWNER_UID || '',
    ownerEmail: process.env.OWNER_UID ? '' : need('OWNER_EMAIL'),
  }),
  allowedOrigin: process.env.ALLOWED_ORIGIN || '',
});
const port = Number(process.env.PORT || 8787);
server.listen(port, '127.0.0.1', () => console.log(`toss-gateway listening on 127.0.0.1:${port}`));
