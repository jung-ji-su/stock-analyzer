// 테스트용: '@/lib/x' 같은 경로 별칭(jsconfig)을 프로젝트 루트 기준 파일로 풀어준다
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) return next(new URL(`../${spec.slice(2)}${/\.\w+$/.test(spec) ? '' : '.js'}`, import.meta.url).href, ctx);
  return next(spec, ctx);
}
