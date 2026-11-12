import { createRemoteJWKSet, jwtVerify } from 'jose';

// 주인 판정: OWNER_UID 가 있으면 uid 만 비교, 없으면 인증된 이메일을 비교한다.
export function checkOwner(payload, { ownerUid, ownerEmail }) {
  if (ownerUid) {
    if (payload.sub !== ownerUid) throw new Error(`not_owner (uid=${payload.sub}, email=${payload.email})`);
    return;
  }
  if (!payload.email_verified || String(payload.email).toLowerCase() !== String(ownerEmail).toLowerCase()) {
    throw new Error(`not_owner (uid=${payload.sub}, email=${payload.email}, verified=${payload.email_verified})`);
  }
}

// Firebase ID 토큰 검증 (서비스 계정 불필요)
export function firebaseOwnerVerifier({ projectId, ownerUid, ownerEmail }) {
  const jwks = createRemoteJWKSet(
    new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
  );
  return async (idToken) => {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`, audience: projectId,
    });
    checkOwner(payload, { ownerUid, ownerEmail });
    return payload;
  };
}
