import { createRemoteJWKSet, jwtVerify } from 'jose';

// Firebase ID 토큰 검증 (서비스 계정 불필요). 주인 이메일만 통과.
export function firebaseOwnerVerifier({ projectId, ownerEmail }) {
  const jwks = createRemoteJWKSet(
    new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
  );
  return async (idToken) => {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`, audience: projectId,
    });
    if (!payload.email_verified || String(payload.email).toLowerCase() !== ownerEmail.toLowerCase()) {
      throw new Error(`not_owner (token email=${payload.email}, verified=${payload.email_verified})`);
    }
    return payload;
  };
}
