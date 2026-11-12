import { createGateway } from './server.js';
import { TokenManager } from './token.js';
import { firebaseOwnerVerifier } from './auth.js';
import { attachStream } from './stream.js';

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`missing env ${k}`); process.exit(1); } return v; };
const baseUrl = process.env.TOSS_BASE_URL || 'https://openapi.tossinvest.com';

const tokens = new TokenManager({ baseUrl, clientId: need('TOSS_CLIENT_ID'), clientSecret: need('TOSS_CLIENT_SECRET') });
const verify = firebaseOwnerVerifier({
    projectId: need('FIREBASE_PROJECT_ID'),
    ownerUid: process.env.OWNER_UID || '',
    ownerEmail: process.env.OWNER_UID ? '' : need('OWNER_EMAIL'),
});
const allowedOrigin = process.env.ALLOWED_ORIGIN || '';
const server = createGateway({ baseUrl, tokens, verify, allowedOrigin });
attachStream(server, {
  verify, tokens, allowedOrigin,
  upstreamUrl: process.env.TOSS_WS_URL || 'wss://openapi-ws.tossinvest.com/ws/v1',
});
const port = Number(process.env.PORT || 8787);
server.listen(port, '127.0.0.1', () => console.log(`toss-gateway listening on 127.0.0.1:${port}`));
