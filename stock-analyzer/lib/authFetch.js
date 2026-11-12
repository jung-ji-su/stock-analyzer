import { auth } from '@/lib/firebase';

// fetch에 현재 로그인 사용자의 Firebase ID 토큰을 붙여서 보낸다.
export async function authFetch(url, options = {}) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    ...options,
    headers: { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}
