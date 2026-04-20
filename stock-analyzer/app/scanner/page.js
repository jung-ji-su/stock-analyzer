'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';

// ============================
// 퀀트 계산 함수
// ============================
function calcSMA(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  const recent = closes.slice(-(period + 1));
  const changes = recent.slice(1).map((c, i) => c - recent[i]);
  const gains = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
  const losses = Math.abs(changes.filter(c => c < 0).reduce((a, b) => a + b, 0)) / period;
  if (losses === 0) return 100;
  return 100 - (100 / (1 + gains / losses));
}

function calcZScore(closes, period = 20) {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  if (std === 0) return 0;
  return (closes[closes.length - 1] - mean) / std;
}

function calcMomentum(closes) {
  const current = closes[closes.length - 1];
  const month1 = closes.length >= 20 ? (current - closes[closes.length - 20]) / closes[closes.length - 20] * 100 : 0;
  const month3 = closes.length >= 60 ? (current - closes[closes.length - 60]) / closes[closes.length - 60] * 100 : month1;
  return month1 * 0.4 + month3 * 0.6;
}

function calcVWAP(chartData) {
  const recent = chartData.slice(-20);
  const totalVol = recent.reduce((a, d) => a + d.volume, 0);
  if (totalVol === 0) return chartData[chartData.length - 1].close;
  return recent.reduce((a, d) => a + ((d.high + d.low + d.close) / 3) * d.volume, 0) / totalVol;
}

function calcStochRSI(closes, period = 14) {
  if (closes.length < period * 2) return 0.5;
  const rsiValues = [];
  for (let i = period; i < closes.length; i++) {
    const slice = closes.slice(i - period, i + 1);
    const changes = slice.slice(1).map((c, j) => c - slice[j]);
    const gains = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
    const losses = Math.abs(changes.filter(c => c < 0).reduce((a, b) => a + b, 0)) / period;
    rsiValues.push(losses === 0 ? 100 : 100 - (100 / (1 + gains / losses)));
  }
  if (rsiValues.length < period) return 0.5;
  const recentRSI = rsiValues.slice(-period);
  const minRSI = Math.min(...recentRSI);
  const maxRSI = Math.max(...recentRSI);
  if (maxRSI === minRSI) return 0.5;
  return (rsiValues[rsiValues.length - 1] - minRSI) / (maxRSI - minRSI);
}

// ============================
// 자동 근거 생성 (AI 없이)
// ============================
function generateReason(stock) {
  const { rsi, zScore, momentum, vwapDiff, stochRSI, ma20, ma60, currentPrice, score } = stock;
  const reasons = [];

  // RSI 설명
  if (rsi < 30) reasons.push(`RSI가 ${rsi}로 극도로 낮아요. 이 정도면 너무 많이 떨어진 상태라 곧 반등할 가능성이 높아요`);
  else if (rsi < 40) reasons.push(`RSI ${rsi}로 꽤 많이 내려온 상태예요. 저점에서 반등을 노려볼 수 있어요`);
  else if (rsi > 70) reasons.push(`RSI가 ${rsi}로 매우 높아요. 단기적으로 너무 많이 올랐기 때문에 잠깐 쉬어갈 수 있어요`);
  else if (rsi > 60) reasons.push(`RSI ${rsi}로 고점 근처예요. 상승 모멘텀은 있지만 과열 주의가 필요해요`);

  // Z-Score 설명
  if (zScore < -2) reasons.push(`통계적으로 최근 20일 중 가장 낮은 수준이에요 (Z-Score ${zScore.toFixed(2)}). 평균으로 돌아오는 힘이 작동할 수 있어요`);
  else if (zScore < -1) reasons.push(`현재 가격이 평균보다 낮은 구간에 있어요 (Z-Score ${zScore.toFixed(2)}). 통계적으로 저평가 구간이에요`);
  else if (zScore > 2) reasons.push(`통계적으로 최근 20일 중 가장 높은 수준이에요 (Z-Score ${zScore.toFixed(2)}). 평균으로 되돌아올 가능성이 있어요`);
  else if (zScore > 1) reasons.push(`현재 가격이 평균보다 높은 구간에 있어요 (Z-Score ${zScore.toFixed(2)}). 단기 고점 가능성을 고려하세요`);

  // 이동평균 설명
  if (ma20 && ma60 && currentPrice) {
    if (currentPrice > ma20 && currentPrice > ma60 && ma20 > ma60) {
      reasons.push(`20일·60일 평균 가격이 모두 현재가 아래에 있어요. 이걸 "정배열"이라고 하는데 꾸준한 상승 흐름의 증거예요`);
    } else if (currentPrice < ma20 && currentPrice < ma60 && ma20 < ma60) {
      reasons.push(`20일·60일 평균 가격이 모두 현재가 위에 있어요. 이걸 "역배열"이라고 하는데 하락 흐름이 강하다는 신호예요`);
    }
  }

  // 모멘텀 설명
  const momentumRounded = Math.round(momentum * 10) / 10;
  if (momentum > 15) reasons.push(`최근 1~3개월 동안 ${momentumRounded}%나 올랐어요. 강한 상승 흐름이 이어지고 있어요`);
  else if (momentum > 5) reasons.push(`최근 ${momentumRounded}% 상승했어요. 꾸준한 오름세를 보이고 있어요`);
  else if (momentum < -15) reasons.push(`최근 1~3개월 동안 ${Math.abs(momentumRounded)}%나 내려왔어요. 하락 흐름이 상당히 강해요`);
  else if (momentum < -5) reasons.push(`최근 ${Math.abs(momentumRounded)}% 하락했어요. 내리막 흐름이 계속되고 있어요`);

  // VWAP 설명
  const vwapRounded = Math.round(vwapDiff * 10) / 10;
  if (vwapDiff < -3) reasons.push(`기관투자자들이 평균적으로 산 가격보다 ${Math.abs(vwapRounded)}% 낮은 위치예요. 기관이 다시 살 가능성이 있어요`);
  else if (vwapDiff > 3) reasons.push(`기관투자자들의 평균 매수가보다 ${vwapRounded}% 높게 올라와 있어요. 기관이 차익실현할 수 있는 구간이에요`);

  // StochRSI 설명
  if (stochRSI < 0.2) reasons.push(`RSI를 더 세밀하게 분석한 지표(StochRSI)도 과매도 신호예요. 반등 가능성이 더 높아져요`);
  else if (stochRSI > 0.8) reasons.push(`RSI를 더 세밀하게 분석한 지표(StochRSI)도 과매수 신호예요. 단기 조정 가능성이 높아요`);

  // 점수 종합 설명
  if (score >= 8) {
    reasons.unshift(`여러 퀀트 지표가 동시에 강한 매수 신호를 보내고 있어요. 분석한 지표 대부분이 지금이 좋은 진입 타이밍이라고 말하고 있어요`);
  } else if (score <= -8) {
    reasons.unshift(`여러 퀀트 지표가 동시에 강한 위험 신호를 보내고 있어요. 지금은 매수보다 관망이나 매도를 고려하는 게 좋아요`);
  }

  // 최대 2개만 반환
  return reasons.slice(0, 2);
}

// ============================
// 퀀트 스코어 계산
// ============================
function calcQuantScore(chartData) {
  const closes = chartData.map(d => d.close);
  const currentPrice = closes[closes.length - 1];
  let score = 0;
  const signals = [];

  const rsi = Math.round(calcRSI(closes) * 10) / 10;
  if (rsi < 30) { score += 4; signals.push({ label: `RSI ${rsi} 과매도`, type: 'bullish' }); }
  else if (rsi < 40) { score += 2; signals.push({ label: `RSI ${rsi} 저점`, type: 'bullish' }); }
  else if (rsi > 70) { score -= 4; signals.push({ label: `RSI ${rsi} 과매수`, type: 'bearish' }); }
  else if (rsi > 60) { score -= 2; signals.push({ label: `RSI ${rsi} 고점`, type: 'bearish' }); }

  const zScore = Math.round(calcZScore(closes) * 100) / 100;
  if (zScore < -2) { score += 4; signals.push({ label: `Z-Score ${zScore} 통계적 저점`, type: 'bullish' }); }
  else if (zScore < -1) { score += 2; signals.push({ label: `Z-Score ${zScore} 하단`, type: 'bullish' }); }
  else if (zScore > 2) { score -= 4; signals.push({ label: `Z-Score ${zScore} 통계적 고점`, type: 'bearish' }); }
  else if (zScore > 1) { score -= 2; signals.push({ label: `Z-Score ${zScore} 상단`, type: 'bearish' }); }

  const ma20 = calcSMA(closes, 20);
  const ma60 = calcSMA(closes, 60);
  if (ma20 && ma60) {
    if (currentPrice > ma20 && currentPrice > ma60 && ma20 > ma60) { score += 4; signals.push({ label: '완전 정배열', type: 'bullish' }); }
    else if (currentPrice > ma20 && currentPrice > ma60) { score += 2; signals.push({ label: '이평선 위', type: 'bullish' }); }
    else if (currentPrice < ma20 && currentPrice < ma60 && ma20 < ma60) { score -= 4; signals.push({ label: '완전 역배열', type: 'bearish' }); }
    else if (currentPrice < ma20 && currentPrice < ma60) { score -= 2; signals.push({ label: '이평선 아래', type: 'bearish' }); }
  }

  const momentum = Math.round(calcMomentum(closes) * 10) / 10;
  if (momentum > 15) { score += 3; signals.push({ label: `모멘텀 +${momentum}%`, type: 'bullish' }); }
  else if (momentum > 5) { score += 1; signals.push({ label: `모멘텀 +${momentum}%`, type: 'bullish' }); }
  else if (momentum < -15) { score -= 3; signals.push({ label: `모멘텀 ${momentum}%`, type: 'bearish' }); }
  else if (momentum < -5) { score -= 1; signals.push({ label: `모멘텀 ${momentum}%`, type: 'bearish' }); }

  const vwap = calcVWAP(chartData);
  const vwapDiff = Math.round(((currentPrice - vwap) / vwap) * 1000) / 10;
  if (vwapDiff < -3) { score += 2; signals.push({ label: `VWAP 대비 ${vwapDiff}% 저평가`, type: 'bullish' }); }
  else if (vwapDiff > 3) { score -= 2; signals.push({ label: `VWAP 대비 +${vwapDiff}% 고평가`, type: 'bearish' }); }

  const stochRSI = Math.round(calcStochRSI(closes) * 100) / 100;
  if (stochRSI < 0.2) { score += 3; signals.push({ label: `StochRSI ${stochRSI} 강한 과매도`, type: 'bullish' }); }
  else if (stochRSI > 0.8) { score -= 3; signals.push({ label: `StochRSI ${stochRSI} 강한 과매수`, type: 'bearish' }); }

  // 5단계 등급
  let grade, gradeColor, gradeBg, gradeEmoji;
  if (score >= 8) { grade = '강력매수'; gradeColor = 'text-red-700'; gradeBg = 'bg-red-50 border-red-300'; gradeEmoji = '🔥'; }
  else if (score >= 4) { grade = '매수고려'; gradeColor = 'text-red-500'; gradeBg = 'bg-red-50 border-red-200'; gradeEmoji = '📈'; }
  else if (score >= -3) { grade = '관망'; gradeColor = 'text-gray-500'; gradeBg = 'bg-gray-50 border-gray-200'; gradeEmoji = '➡️'; }
  else if (score >= -7) { grade = '매도주의'; gradeColor = 'text-blue-500'; gradeBg = 'bg-blue-50 border-blue-200'; gradeEmoji = '📉'; }
  else { grade = '강력주의'; gradeColor = 'text-blue-700'; gradeBg = 'bg-blue-50 border-blue-300'; gradeEmoji = '❄️'; }

  return { score, grade, gradeColor, gradeBg, gradeEmoji, signals, rsi, zScore, momentum, vwapDiff, stochRSI, ma20, ma60, currentPrice };
}

// ============================
// 메인 컴포넌트
// ============================
export default function ScannerPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [filter, setFilter] = useState('all');
  const [scanType, setScanType] = useState('volume');
  const [progress, setProgress] = useState(0);
  const [scannedAt, setScannedAt] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    // localStorage에서 이전 결과 복원
    try {
      const saved = localStorage.getItem('scanner_results');
      const savedAt = localStorage.getItem('scanner_scannedAt');
      const savedType = localStorage.getItem('scanner_type');
      if (saved) {
        setResults(JSON.parse(saved));
        setScannedAt(savedAt);
        if (savedType) setScanType(savedType);
      }
    } catch (e) {}
  }, [user]);

  const startScan = async () => {
    setScanning(true);
    setResults([]);
    setProgress(0);

    try {
      const topRes = await fetch(`/api/top?type=${scanType}`);
      const topData = await topRes.json();
      const stocks = topData.stocks || [];

      const scanResults = [];
      for (let i = 0; i < Math.min(stocks.length, 30); i++) {
        const stock = stocks[i];
        setProgress(Math.round(((i + 1) / 30) * 100));

        try {
          const chartRes = await fetch(`/api/stock?symbol=${stock.code}&timeframe=daily`);
          const chartData = await chartRes.json();
          if (!chartData.chartData || chartData.chartData.length < 30) continue;

          const quant = calcQuantScore(chartData.chartData);
          const reasonList = generateReason({ ...quant, currentPrice: chartData.currentPrice });

          scanResults.push({
            code: stock.code,
            name: stock.name,
            price: chartData.currentPrice,
            change: chartData.change,
            changePercent: chartData.changePercent,
            reasons: reasonList,
            ...quant,
          });
        } catch (e) {
          console.error(`${stock.name} 스캔 실패:`, e.message);
        }
        await new Promise(r => setTimeout(r, 150));
      }

      scanResults.sort((a, b) => b.score - a.score);
      setResults(scanResults);

      const now = new Date().toLocaleTimeString('ko-KR');
      setScannedAt(now);

      // localStorage 저장
      try {
        localStorage.setItem('scanner_results', JSON.stringify(scanResults));
        localStorage.setItem('scanner_scannedAt', now);
        localStorage.setItem('scanner_type', scanType);
      } catch (e) {}

    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
      setProgress(100);
    }
  };

  const gradeFilters = [
    { key: 'all', label: '전체' },
    { key: 'strong_buy', label: '🔥 강력매수' },
    { key: 'buy', label: '📈 매수고려' },
    { key: 'watch', label: '➡️ 관망' },
    { key: 'caution', label: '📉 매도주의' },
    { key: 'strong_caution', label: '❄️ 강력주의' },
  ];

  const getFilteredResults = () => {
    switch (filter) {
      case 'strong_buy': return results.filter(r => r.score >= 8);
      case 'buy': return results.filter(r => r.score >= 4 && r.score < 8);
      case 'watch': return results.filter(r => r.score >= -3 && r.score < 4);
      case 'caution': return results.filter(r => r.score >= -7 && r.score < -3);
      case 'strong_caution': return results.filter(r => r.score < -7);
      default: return results;
    }
  };

  const filtered = getFilteredResults();

  const gradeCounts = {
    strong_buy: results.filter(r => r.score >= 8).length,
    buy: results.filter(r => r.score >= 4 && r.score < 8).length,
    watch: results.filter(r => r.score >= -3 && r.score < 4).length,
    caution: results.filter(r => r.score >= -7 && r.score < -3).length,
    strong_caution: results.filter(r => r.score < -7).length,
  };

  return (
    <main className="min-h-screen bg-gray-50 p-3 pb-24">
      <div className="max-w-2xl mx-auto">

        {/* 헤더 */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900 mb-0.5">🔍 종목 스캐너</h1>
          <p className="text-xs text-gray-400">퀀트 분석으로 매수/매도 종목 자동 탐색</p>
        </div>

        {/* 스캔 설정 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">스캔 대상</p>
          <div className="flex gap-2 mb-4">
            {[
              { key: 'volume', label: '거래량 TOP30' },
              { key: 'amount', label: '거래대금 TOP30' },
              { key: 'marcap', label: '시가총액 TOP30' },
            ].map(t => (
              <button key={t.key} onClick={() => setScanType(t.key)}
                className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${scanType === t.key ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <button onClick={startScan} disabled={scanning}
            className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl font-bold text-sm disabled:opacity-60">
            {scanning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                스캔 중... {progress}%
              </span>
            ) : results.length > 0 ? '🔄 재스캔' : '🚀 퀀트 스캔 시작'}
          </button>

          {scanning && (
            <div className="mt-3">
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-gray-400 text-center mt-1">{progress}/100 분석 중...</p>
            </div>
          )}
        </div>

        {/* 결과 요약 */}
        {results.length > 0 && (
          <>
            <div className="bg-gray-900 rounded-2xl p-4 mb-4 text-white">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-bold">📊 스캔 결과 ({results.length}종목)</p>
                {scannedAt && <p className="text-xs text-gray-400">{scannedAt} 기준</p>}
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { key: 'strong_buy', emoji: '🔥', label: '강력매수', color: 'text-red-400', bg: 'bg-red-500' },
                  { key: 'buy', emoji: '📈', label: '매수고려', color: 'text-orange-400', bg: 'bg-orange-500' },
                  { key: 'watch', emoji: '➡️', label: '관망', color: 'text-gray-300', bg: 'bg-gray-500' },
                  { key: 'caution', emoji: '📉', label: '매도주의', color: 'text-blue-400', bg: 'bg-blue-500' },
                  { key: 'strong_caution', emoji: '❄️', label: '강력주의', color: 'text-blue-300', bg: 'bg-blue-700' },
                ].map(({ key, emoji, label, color, bg }) => (
                  <div key={key} className="bg-white bg-opacity-10 rounded-xl p-2 text-center">
                    <p className="text-lg">{emoji}</p>
                    <p className={`text-xl font-bold ${color}`}>{gradeCounts[key]}</p>
                    <p className="text-gray-400 mt-0.5" style={{ fontSize: '9px' }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 필터 - 가로 스크롤 */}
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
              {gradeFilters.map(f => {
                const count = f.key === 'all' ? results.length : gradeCounts[f.key];
                return (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${filter === f.key ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                    {f.label} {count}
                  </button>
                );
              })}
            </div>

            {/* 종목 리스트 */}
            <div className="space-y-2">
              {filtered.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">해당 등급의 종목이 없습니다</div>
              ) : (
                filtered.map((stock) => (
                  <div key={stock.code} className={`rounded-2xl border ${stock.gradeBg} overflow-hidden`}>
                    {/* 메인 정보 */}
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-lg">{stock.gradeEmoji}</span>
                            <p className="font-bold text-gray-900 text-sm">{stock.name}</p>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white border ${stock.gradeColor}`}>
                              {stock.grade}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 ml-7">{stock.code}</p>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="font-bold text-gray-900 text-sm">{stock.price?.toLocaleString()}원</p>
                          <p className={`text-xs font-medium ${stock.change >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                            {stock.change >= 0 ? '+' : ''}{stock.changePercent?.toFixed(2)}%
                          </p>
                        </div>
                      </div>

                      {/* 퀀트 점수 바 */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs text-gray-500 shrink-0 w-14">퀀트점수</span>
                        <div className="flex-1 bg-white rounded-full h-2 overflow-hidden">
                          <div className={`h-2 rounded-full ${stock.score >= 0 ? 'bg-red-400' : 'bg-blue-400'}`}
                            style={{ width: `${Math.min(Math.abs(stock.score) / 15 * 100, 100)}%` }} />
                        </div>
                        <span className={`text-xs font-bold shrink-0 w-8 text-right ${stock.score >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {stock.score >= 0 ? '+' : ''}{stock.score}
                        </span>
                      </div>

                      {/* 근거 설명 */}
                      {stock.reasons && stock.reasons.length > 0 && (
                        <div className="bg-white bg-opacity-70 rounded-xl p-3 mb-3">
                          <p className="text-xs font-bold text-gray-700 mb-1.5">💡 분석 근거</p>
                          {stock.reasons.map((reason, i) => (
                            <p key={i} className="text-xs text-gray-600 leading-relaxed mb-1 last:mb-0">
                              {i + 1}. {reason}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* 지표 태그 */}
                      <div className="flex gap-1.5 flex-wrap mb-3">
                        {[
                          { label: `RSI ${stock.rsi}`, good: stock.rsi < 50 },
                          { label: `Z ${stock.zScore}`, good: stock.zScore < 0 },
                          { label: `모멘텀 ${stock.momentum > 0 ? '+' : ''}${stock.momentum}%`, good: stock.momentum > 0 },
                          { label: `VWAP ${stock.vwapDiff > 0 ? '+' : ''}${stock.vwapDiff}%`, good: stock.vwapDiff < 0 },
                          { label: `StochRSI ${stock.stochRSI}`, good: stock.stochRSI < 0.5 },
                        ].map(({ label, good }, j) => (
                          <span key={j} className={`text-xs px-2 py-0.5 rounded-full ${good ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                            {label}
                          </span>
                        ))}
                      </div>

                      {/* 상세 신호 토글 */}
                      <button
                        onClick={() => setExpandedId(expandedId === stock.code ? null : stock.code)}
                        className="w-full text-xs text-gray-400 text-center py-1">
                        {expandedId === stock.code ? '▲ 신호 닫기' : '▼ 세부 신호 보기'}
                      </button>

                      {expandedId === stock.code && (
                        <div className="mt-2 space-y-1">
                          {stock.signals.map((sig, j) => (
                            <div key={j} className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sig.type === 'bullish' ? 'bg-red-400' : 'bg-blue-400'}`} />
                              <span className="text-xs text-gray-600">{sig.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 차트 보기 버튼 */}
                    <button
                      onClick={() => router.push(`/?stock=${stock.code}&name=${encodeURIComponent(stock.name)}`)}
                      className={`w-full py-2.5 text-xs font-bold border-t ${
                        stock.score >= 4 ? 'bg-red-500 text-white border-red-400' :
                        stock.score < -3 ? 'bg-blue-500 text-white border-blue-400' :
                        'bg-gray-100 text-gray-600 border-gray-200'
                      }`}>
                      차트 보러가기 →
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* 빈 상태 */}
        {!scanning && results.length === 0 && (
          <div className="text-center py-12">
            <p className="text-5xl mb-4">🔍</p>
            <p className="text-gray-600 font-bold mb-1">퀀트 스캐너</p>
            <p className="text-gray-400 text-sm mb-6">스캔 대상을 선택하고 시작하세요</p>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 text-left">
              <p className="text-xs font-bold text-gray-700 mb-3">📐 분석 지표 6가지</p>
              {[
                { icon: '📊', label: 'RSI', desc: '30 이하면 너무 많이 떨어진 것, 70 이상이면 너무 많이 오른 것' },
                { icon: '📈', label: 'Z-Score', desc: '최근 가격이 통계적으로 얼마나 극단적인 위치에 있는지' },
                { icon: '🏦', label: 'VWAP', desc: '기관투자자들이 평균적으로 산 가격과 비교' },
                { icon: '⚡', label: 'StochRSI', desc: 'RSI보다 더 민감하게 과매수/과매도를 잡아냄' },
                { icon: '🚀', label: '모멘텀', desc: '최근 1~3개월 동안 얼마나 올랐거나 내렸는지' },
                { icon: '📉', label: '이동평균', desc: '단기/중기 평균 가격과의 관계로 추세 판단' },
              ].map(({ icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-lg shrink-0">{icon}</span>
                  <div>
                    <p className="text-xs font-bold text-gray-700">{label}</p>
                    <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}