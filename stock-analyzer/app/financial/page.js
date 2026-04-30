'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useFavorites } from '@/lib/FavoritesContext';
import { useToast } from '@/components/Toast';
import { useRouter } from 'next/navigation';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function FinancialPage() {
  const { user } = useAuth();
  const { toggleFavorite, isFavorite } = useFavorites();
  const { addToast } = useToast();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [topStocks, setTopStocks] = useState([]);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    fetchTopStocks();
  }, [user, router]);

  const fetchTopStocks = async () => {
    try {
      const res = await fetch('/api/top?type=volume');
      const data = await res.json();
      setTopStocks((data.stocks || []).slice(0, 30));
    } catch (error) {
      console.error(error);
    }
  };

  const fetchFinancial = async (query) => {
    if (!query.trim()) return;

    setLoading(true);
    setResult(null);
    setAiAnalysis(null);

    try {
      const res = await fetch(`/api/financial?query=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (res.ok) {
        setResult(data);
        addToast('재무제표를 불러왔습니다', 'success');
        analyzeWithAI(data);
      } else {
        addToast(data.error || '데이터를 가져올 수 없습니다', 'error');
      }
    } catch (error) {
      console.error(error);
      addToast('오류가 발생했습니다', 'error');
    } finally {
      setLoading(false);
    }
  };

  let score = 50;

  const analyzeWithAI = async (financialData) => {
    setAnalyzing(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const summary = financialData.summary;
      const latest = summary[0];
      const oldest = summary[summary.length - 1];
      const years = summary.length;

      // 1. 성장률 분석
      const revenueGrowth = oldest.revenue > 0
        ? ((latest.revenue - oldest.revenue) / oldest.revenue) * 100
        : 0;
      const profitGrowth = oldest.netIncome > 0
        ? ((latest.netIncome - oldest.netIncome) / oldest.netIncome) * 100
        : 0;

      const recent2Years = summary.slice(0, 2);
      const past3Years = summary.slice(2, 5);
      const recentAvgRevenue = recent2Years.reduce((a, b) => a + b.revenue, 0) / recent2Years.length;
      const pastAvgRevenue = past3Years.length > 0
        ? past3Years.reduce((a, b) => a + b.revenue, 0) / past3Years.length
        : recentAvgRevenue;
      const acceleration = pastAvgRevenue > 0
        ? ((recentAvgRevenue - pastAvgRevenue) / pastAvgRevenue) * 100
        : 0;

      // 2. 수익성 지표
      const operatingMargin = latest.revenue > 0
        ? (latest.operatingIncome / latest.revenue) * 100
        : 0;
      const netMargin = latest.revenue > 0
        ? (latest.netIncome / latest.revenue) * 100
        : 0;
      const roa = latest.totalAssets > 0
        ? (latest.netIncome / latest.totalAssets) * 100
        : 0;
      const roe = latest.totalEquity > 0
        ? (latest.netIncome / latest.totalEquity) * 100
        : 0;

      const oldOperatingMargin = oldest.revenue > 0
        ? (oldest.operatingIncome / oldest.revenue) * 100
        : 0;
      const marginTrend = operatingMargin - oldOperatingMargin;

      // 3. 안정성 지표
      const debtRatio = latest.totalEquity > 0
        ? (latest.totalLiabilities / latest.totalEquity) * 100
        : 0;
      const oldDebtRatio = oldest.totalEquity > 0
        ? (oldest.totalLiabilities / oldest.totalEquity) * 100
        : 0;
      const debtTrend = debtRatio - oldDebtRatio;

      // 4. 효율성 지표
      const assetTurnover = latest.totalAssets > 0
        ? latest.revenue / latest.totalAssets
        : 0;

      // ✅ 5. 현금흐름 분석 (더 엄격한 조건)
      const operatingCF = latest.operatingCF || 0;
      const cfRatio = latest.netIncome > 0 && operatingCF !== 0
        ? (operatingCF / latest.netIncome) * 100
        : 0;

      // 현금흐름 건전성 체크 (데이터가 있을 때만)
      const hasCashFlowData = operatingCF !== 0 && latest.netIncome !== 0;
      const cashHealthy = hasCashFlowData && operatingCF > 0 && cfRatio > 80;
      const possibleAccountingFraud = hasCashFlowData &&
        latest.netIncome > latest.revenue * 0.05 && // 순이익이 매출의 5% 이상일 때만 (의미있는 이익)
        operatingCF > 0 && // 영업현금흐름이 양수인데
        cfRatio < 50; // 현금전환율이 50% 미만이면 의심

      const fcf = operatingCF; // 간단화: 실제로는 capex 빼야함

      // 6. 위험 신호 감지
      // 6. 위험 신호 감지
      const risks = [];

      const consecutiveLoss = summary.filter(s => s.netIncome < 0).length;
      if (consecutiveLoss >= 2) {
        risks.push(`최근 ${consecutiveLoss}년 연속 적자 상태`);
      }

      if (years >= 2 && latest.revenue < summary[1].revenue * 0.8) {
        risks.push('전년 대비 매출 20% 이상 급감');
      }

      if (debtTrend > 50) {
        risks.push(`부채비율 ${debtTrend.toFixed(0)}%p 급증`);
      }

      if (latest.netIncome < 0 && oldest.netIncome > 0) {
        risks.push('흑자에서 적자로 전환');
      }

      // ✅ 현금흐름 데이터가 있고, 의심스러울 때만 경고
      if (possibleAccountingFraud) {
        risks.push('이익 대비 현금창출력 낮음 (현금흐름 점검 필요)');
      }

      // 7. 점수 계산
      if (hasCashFlowData) {
        if (cashHealthy) score += 10;
        else if (cfRatio > 50) score += 5;
        else if (possibleAccountingFraud) score -= 5; // -10에서 -5로 완화
      }

      // 성장성 (25점)
      if (revenueGrowth > 100) score += 15;
      else if (revenueGrowth > 50) score += 12;
      else if (revenueGrowth > 20) score += 8;
      else if (revenueGrowth > 0) score += 4;
      else if (revenueGrowth < -20) score -= 10;

      if (acceleration > 20) score += 10;
      else if (acceleration > 0) score += 5;
      else if (acceleration < -10) score -= 5;

      // 수익성 (30점)
      if (operatingMargin > 25) score += 12;
      else if (operatingMargin > 15) score += 8;
      else if (operatingMargin > 10) score += 5;
      else if (operatingMargin > 5) score += 2;
      else if (operatingMargin < 0) score -= 8;

      if (roe > 20) score += 10;
      else if (roe > 15) score += 7;
      else if (roe > 10) score += 4;
      else if (roe < 0) score -= 8;

      if (marginTrend > 5) score += 8;
      else if (marginTrend < -5) score -= 8;

      // 안정성 (25점)
      if (debtRatio < 50) score += 12;
      else if (debtRatio < 100) score += 8;
      else if (debtRatio < 150) score += 3;
      else if (debtRatio > 300) score -= 10;

      if (debtTrend < -20) score += 8;
      else if (debtTrend > 50) score -= 10;

      if (latest.netIncome > 0 && latest.operatingIncome > 0) score += 5;

      // 효율성 (10점)
      if (assetTurnover > 1.5) score += 10;
      else if (assetTurnover > 1.0) score += 6;
      else if (assetTurnover > 0.5) score += 3;

      // 현금흐름 (10점)
      if (cashHealthy) score += 10;
      else if (cfRatio > 50) score += 5;
      else if (possibleAccountingFraud) score -= 10;

      // 위험 페널티
      score -= risks.length * 5;

      score = Math.min(100, Math.max(0, score));

      // 8. 등급
      let grade = 'D';
      if (score >= 90) grade = 'A+';
      else if (score >= 85) grade = 'A';
      else if (score >= 75) grade = 'B+';
      else if (score >= 65) grade = 'B';
      else if (score >= 55) grade = 'C+';
      else if (score >= 45) grade = 'C';

      // 9. 강점/약점
      const strengths = [];
      const weaknesses = [];

      if (revenueGrowth > 50) {
        strengths.push(`${years}년간 매출 ${revenueGrowth.toFixed(1)}% 폭발적 성장`);
      } else if (revenueGrowth > 20) {
        strengths.push(`${years}년간 매출 ${revenueGrowth.toFixed(1)}% 꾸준한 성장`);
      } else if (revenueGrowth < -20) {
        weaknesses.push(`${years}년간 매출 ${Math.abs(revenueGrowth).toFixed(1)}% 급감`);
      }

      if (acceleration > 20) {
        strengths.push('최근 성장세가 가속화되고 있음');
      } else if (acceleration < -10) {
        weaknesses.push('최근 성장세가 둔화되고 있음');
      }

      if (roe > 20) {
        strengths.push(`ROE ${roe.toFixed(1)}%로 자본 효율성 매우 우수`);
      } else if (roe > 15) {
        strengths.push(`ROE ${roe.toFixed(1)}%로 자본 효율성 양호`);
      } else if (roe < 5 && roe > 0) {
        weaknesses.push(`ROE ${roe.toFixed(1)}%로 자본 효율성 낮음`);
      }

      if (operatingMargin > 20) {
        strengths.push(`영업이익률 ${operatingMargin.toFixed(1)}%로 매우 높은 수익성`);
      } else if (operatingMargin > 15) {
        strengths.push(`영업이익률 ${operatingMargin.toFixed(1)}%로 우수한 수익성`);
      } else if (operatingMargin < 5) {
        weaknesses.push(`영업이익률 ${operatingMargin.toFixed(1)}%로 수익성 개선 필요`);
      }

      if (marginTrend > 5) {
        strengths.push(`영업이익률이 ${marginTrend.toFixed(1)}%p 개선되며 수익성 향상 중`);
      } else if (marginTrend < -5) {
        weaknesses.push(`영업이익률이 ${Math.abs(marginTrend).toFixed(1)}%p 악화`);
      }

      if (debtRatio < 50) {
        strengths.push(`부채비율 ${debtRatio.toFixed(1)}%로 재무 안정성 매우 우수`);
      } else if (debtRatio < 100) {
        strengths.push(`부채비율 ${debtRatio.toFixed(1)}%로 재무 안정성 양호`);
      } else if (debtRatio > 200) {
        weaknesses.push(`부채비율 ${debtRatio.toFixed(1)}%로 재무 부담 매우 높음`);
      } else if (debtRatio > 150) {
        weaknesses.push(`부채비율 ${debtRatio.toFixed(1)}%로 재무 부담 높음`);
      }

      if (assetTurnover > 1.5) {
        strengths.push(`자산회전율 ${assetTurnover.toFixed(2)}로 자산 활용 효율 우수`);
      }

      if (cashHealthy) {
        strengths.push(`영업현금흐름 ${(operatingCF / 100000000).toLocaleString()}억원으로 현금창출력 우수`);
      } else if (possibleAccountingFraud) {
        weaknesses.push('이익 대비 현금창출력이 낮아 주의 필요');
      }

      // 10. 인사이트
      const insights = [];

      if (revenueGrowth > 0 && profitGrowth > revenueGrowth * 1.5) {
        insights.push(`이익 증가율(${profitGrowth.toFixed(1)}%)이 매출 증가율(${revenueGrowth.toFixed(1)}%)보다 높아 수익 구조 개선 중`);
      } else if (revenueGrowth > 0 && profitGrowth < revenueGrowth * 0.5) {
        insights.push('매출은 늘었으나 이익 증가율이 낮아 수익성 관리 필요');
      }

      if (latest.netIncome > 0 && netMargin > 10 && debtRatio < 100) {
        insights.push('높은 수익성과 안정적 재무구조로 배당 여력 충분');
      }

      if (operatingMargin > 15 && roe > 15) {
        insights.push('영업이익률과 ROE 모두 우수해 질적 성장 중');
      }

      if (debtRatio < oldDebtRatio * 0.8) {
        insights.push(`부채비율이 ${oldDebtRatio.toFixed(1)}%에서 ${debtRatio.toFixed(1)}%로 크게 개선됨`);
      }

      if (acceleration > 10 && operatingMargin > 10) {
        insights.push('성장 가속화와 견고한 수익성으로 향후 실적 기대');
      } else if (acceleration < -10 && marginTrend < -3) {
        insights.push('성장 둔화와 수익성 악화로 구조 개선 필요');
      }

      if (roa > 10) {
        insights.push(`ROA ${roa.toFixed(1)}%로 자산 대비 높은 수익 창출`);
      }

      if (cashHealthy && roe > 15) {
        insights.push('현금창출력과 자본효율성 모두 우수해 지속가능한 성장 가능');
      }

      // 11. 투자 의견
      let recommendation = '';

      if (score >= 85) {
        recommendation = `강한 성장성(매출 ${revenueGrowth > 0 ? '+' : ''}${revenueGrowth.toFixed(1)}%)과 우수한 수익성(ROE ${roe.toFixed(1)}%)을 바탕으로 장기 투자 관점에서 매우 매력적입니다. 재무 안정성도 우수해 안정적인 성장이 기대됩니다.`;
      } else if (score >= 75) {
        recommendation = `양호한 재무 지표를 보이고 있으나, ${weaknesses.length > 0 ? weaknesses[0] + '에 ' : ''}주의가 필요합니다. 중장기 투자 관점에서 접근하되, 분기 실적을 지켜보며 추가 매수 시점을 고려하세요.`;
      } else if (score >= 65) {
        recommendation = `평균 수준의 재무 지표를 보이며, 업황 변화와 경영진의 대응 전략이 중요합니다. 분할 매수 전략으로 접근하고, 실적 개선 여부를 면밀히 관찰하세요.`;
      } else if (score >= 50) {
        recommendation = `일부 개선이 필요한 영역이 있습니다. ${risks.length > 0 ? '특히 ' + risks[0] + '는 주의 신호입니다. ' : ''}단기 투자보다는 구조 개선 후 재평가를 권장합니다.`;
      } else {
        recommendation = `재무 지표가 전반적으로 부진합니다. ${risks.length > 0 ? risks.join(', ') + ' 등 ' : ''}위험 요소가 있어 신중한 접근이 필요합니다. 현 시점에서는 투자를 보류하고 상황 개선을 지켜보는 것이 바람직합니다.`;
      }

      setAiAnalysis({
        score: Math.round(score),
        grade,
        summary: `${financialData.corpName}는 최근 ${years}년간 ${revenueGrowth > 0 ? '성장' : '감소'}세(${revenueGrowth > 0 ? '+' : ''}${revenueGrowth.toFixed(1)}%)를 보이며, ROE ${roe.toFixed(1)}%, 부채비율 ${debtRatio.toFixed(1)}%로 ${grade}등급을 받았습니다.`,
        strengths,
        weaknesses,
        insights,
        risks,
        recommendation,
        metrics: {
          revenueGrowth,
          profitGrowth,
          operatingMargin,
          netMargin,
          roa,
          roe,
          debtRatio,
          assetTurnover,
          cfRatio,
          operatingCF,
        },
      });

    } catch (error) {
      console.error('분석 오류:', error);
      addToast('분석 중 오류가 발생했습니다', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const formatNumber = (num) => {
    if (num === 0) return '-';

    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    const trillion = absNum / 1000000000000;
    if (trillion >= 1) return `${sign}${trillion.toFixed(1)}조`;

    const billion = absNum / 100000000;
    return `${sign}${billion.toLocaleString()}억`;
  };

  // ✅ YoY, QoQ 계산
  const calculateYoY = (current, yearAgo) => {
    if (!yearAgo || yearAgo.revenue === 0) return null;
    return ((current.revenue - yearAgo.revenue) / yearAgo.revenue * 100).toFixed(1);
  };

  const calculateQoQ = (current, prevQuarter) => {
    if (!prevQuarter || prevQuarter.revenue === 0) return null;
    return ((current.revenue - prevQuarter.revenue) / prevQuarter.revenue * 100).toFixed(1);
  };

  if (!user) return null;

  const isLargeCorp = result && result.summary[0].revenue > 1000000000000;
  const chartUnit = isLargeCorp ? 1000000000000 : 100000000;
  const chartUnitLabel = isLargeCorp ? '조원' : '억원';

  const chartData = result?.summary.map(s => ({
    year: s.year.toString(),
    매출액: Math.round(s.revenue / chartUnit * 10) / 10,
    영업이익: Math.round(s.operatingIncome / chartUnit * 10) / 10,
    당기순이익: Math.round(s.netIncome / chartUnit * 10) / 10,
  })).reverse();

  const ratioData = result?.summary.map(s => ({
    year: s.year.toString(),
    'ROE(%)': s.totalEquity > 0 ? Math.round((s.netIncome / s.totalEquity) * 1000) / 10 : 0,
    '영업이익률(%)': s.revenue > 0 ? Math.round((s.operatingIncome / s.revenue) * 1000) / 10 : 0,
    '순이익률(%)': s.revenue > 0 ? Math.round((s.netIncome / s.revenue) * 1000) / 10 : 0,
  })).reverse();

  // ✅ 분기 차트 데이터
  const quarterChartData = result?.quarterData?.slice(0, 8).map(q => ({
    period: `${q.year} ${q.quarter}`,
    매출액: Math.round(q.revenue / chartUnit * 10) / 10,
    영업이익: Math.round(q.operatingIncome / chartUnit * 10) / 10,
  })).reverse();

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">📊 AI 재무분석</h1>
          <p className="text-sm text-gray-500">DART 공시 데이터 기반 AI 분석</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <span className="text-xl">📊</span>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900">종목 검색</label>
              <p className="text-xs text-gray-500">종목명 또는 코드 입력</p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && fetchFinancial(searchQuery)}
                placeholder="예: 삼성전자, 005930"
                disabled={loading}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 text-gray-900 placeholder-gray-400 disabled:bg-gray-100 transition-colors"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                🔍
              </div>
            </div>
            <button
              onClick={() => fetchFinancial(searchQuery)}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-bold hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 whitespace-nowrap shadow-md transition-all">
              분석
            </button>
          </div>

          {loading && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className="h-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
              <p className="text-xs text-gray-500 text-center mt-1">재무제표 조회 중...</p>
            </div>
          )}
        </div>

        {topStocks.length > 0 && !result && !loading && (
          <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white mb-1">📈 실시간 거래량 TOP30</h2>
                <p className="text-xs text-blue-100">클릭하여 즉시 분석 시작</p>
              </div>
              <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-full px-3 py-1">
                <span className="text-xs font-bold text-white">실시간</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
              {topStocks.map((stock, idx) => (
                <button
                  key={stock.code}
                  onClick={() => fetchFinancial(stock.name)}
                  className="text-left p-3 rounded-xl bg-white bg-opacity-90 backdrop-blur-sm hover:bg-opacity-100 hover:shadow-lg transition-all duration-200 transform hover:scale-105">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${idx < 3 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white' :
                      idx < 10 ? 'bg-gradient-to-br from-blue-400 to-blue-600 text-white' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                      {idx + 1}
                    </div>
                    <span className="text-sm font-bold text-gray-900 truncate flex-1">{stock.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">{stock.code}</p>
                    {stock.changeRate != null && typeof stock.changeRate === 'number' && (
                      <span className={`text-xs font-bold ${stock.changeRate > 0 ? 'text-red-500' :
                          stock.changeRate < 0 ? 'text-blue-500' : 'text-gray-500'
                        }`}>
                        {stock.changeRate > 0 ? '+' : ''}{stock.changeRate.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ✅ 데이터 기준일 + 관심종목 버튼 */}
        {result && result.summary && result.summary.length > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                    <span className="text-white text-sm">📅</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">재무제표 기준일</p>
                </div>

                <div className="space-y-2 ml-10">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-xs text-gray-700">
                      <span className="font-bold">연간:</span> {result.summary[0].year}년 사업보고서 ({result.summary[0].year}.12.31)
                    </span>
                  </div>

                  {result.latestQuarter && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-green-700 font-bold">
                        최신: {result.latestQuarter.reportDate} (분기보고서)
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 ml-10 bg-white bg-opacity-60 rounded-lg p-2">
                  <p className="text-xs text-gray-600">
                    💡 분기보고서는 제출 후 1-2주 내 반영됩니다
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  toggleFavorite({ code: result.stockCode, name: result.corpName });
                  addToast(
                    isFavorite(result.stockCode) ? '관심종목에서 제거했습니다' : '관심종목에 추가했습니다',
                    'success'
                  );
                }}
                className={`ml-2 p-3 rounded-xl transition-all ${isFavorite(result.stockCode)
                  ? 'bg-yellow-400 text-white shadow-lg transform scale-110'
                  : 'bg-white text-gray-400 hover:bg-yellow-50'
                  }`}>
                <span className="text-2xl">⭐</span>
              </button>
            </div>
          </div>
        )}

        {/* ✅ 최신 분기 실적 카드 */}
        {result?.latestQuarter && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3">
              🆕 최신 분기 실적 ({result.latestQuarter.reportDate})
            </h3>

            {/* YoY, QoQ */}
            {result.quarterData && result.quarterData.length >= 2 && (
              <div className="flex gap-2 mb-3">
                {(() => {
                  const currentQ = result.quarterData[0];
                  const yearAgo = result.quarterData.find(q =>
                    q.year === currentQ.year - 1 && q.quarter === currentQ.quarter
                  );
                  const prevQ = result.quarterData[1];

                  const yoy = calculateYoY(currentQ, yearAgo);
                  const qoq = calculateQoQ(currentQ, prevQ);

                  return (
                    <>
                      {yoy && (
                        <div className="bg-white rounded-lg px-3 py-1">
                          <p className="text-xs text-gray-500">YoY</p>
                          <p className={`text-sm font-bold ${parseFloat(yoy) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {parseFloat(yoy) > 0 ? '+' : ''}{yoy}%
                          </p>
                        </div>
                      )}
                      {qoq && (
                        <div className="bg-white rounded-lg px-3 py-1">
                          <p className="text-xs text-gray-500">QoQ</p>
                          <p className={`text-sm font-bold ${parseFloat(qoq) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {parseFloat(qoq) > 0 ? '+' : ''}{qoq}%
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">매출액</p>
                <p className="text-lg font-bold text-gray-900">
                  {formatNumber(result.latestQuarter.revenue)}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">영업이익</p>
                <p className={`text-lg font-bold ${result.latestQuarter.operatingIncome < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatNumber(result.latestQuarter.operatingIncome)}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">당기순이익</p>
                <p className={`text-lg font-bold ${result.latestQuarter.netIncome < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatNumber(result.latestQuarter.netIncome)}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">부채비율</p>
                <p className="text-lg font-bold text-blue-600">
                  {result.latestQuarter.totalEquity > 0
                    ? ((result.latestQuarter.totalLiabilities / result.latestQuarter.totalEquity) * 100).toFixed(1) + '%'
                    : '-'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ✅ 분기 추이 차트 */}
        {quarterChartData && quarterChartData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-4">📊 분기별 실적 추이 (단위: {chartUnitLabel})</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={quarterChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="매출액" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="영업이익" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {result && aiAnalysis && (
          <>
            <div className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 rounded-2xl border-2 border-purple-200 p-6 mb-4 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md">
                    <span className="text-2xl">🤖</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">AI 종합 분석</h2>
                    <p className="text-xs text-gray-500">5년 재무 데이터 기반</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    {aiAnalysis.grade}
                  </div>
                  <div className="text-xs text-gray-600">{aiAnalysis.score}점</div>
                </div>
              </div>

              <p className="text-sm text-gray-700 mb-4 leading-relaxed">{aiAnalysis.summary}</p>

              {/* 주요 지표 */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-white rounded-lg p-2">
                  <p className="text-xs text-gray-500">ROE</p>
                  <p className="text-lg font-bold text-gray-900">{aiAnalysis.metrics.roe.toFixed(1)}%</p>
                </div>
                <div className="bg-white rounded-lg p-2">
                  <p className="text-xs text-gray-500">영업이익률</p>
                  <p className="text-lg font-bold text-gray-900">{aiAnalysis.metrics.operatingMargin.toFixed(1)}%</p>
                </div>
                <div className="bg-white rounded-lg p-2">
                  <p className="text-xs text-gray-500">부채비율</p>
                  <p className="text-lg font-bold text-gray-900">{aiAnalysis.metrics.debtRatio.toFixed(1)}%</p>
                </div>
                <div className="bg-white rounded-lg p-2">
                  <p className="text-xs text-gray-500">현금전환율</p>
                  <p className="text-lg font-bold text-gray-900">{aiAnalysis.metrics.cfRatio.toFixed(0)}%</p>
                </div>
              </div>

              {/* 페이지 연동 버튼 */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => {
                    const url = new URLSearchParams();
                    url.set('stock', result.stockCode);
                    url.set('name', result.corpName);
                    router.push(`/?${url.toString()}`);
                  }}
                  className="flex-1 bg-blue-500 text-white py-2 px-3 rounded-lg text-xs font-bold hover:bg-blue-600 transition-colors">
                  📈 차트 보기
                </button>
                <button
                  onClick={() => router.push(`/scanner`)}
                  className="flex-1 bg-white border border-green-300 text-green-600 py-2 px-3 rounded-lg text-xs font-bold hover:bg-green-50">
                  🔍 스캐너
                </button>
              </div>

              <div className="space-y-3">
                {aiAnalysis.strengths.length > 0 && (
                  <div className="bg-white rounded-xl p-3">
                    <p className="text-xs font-bold text-green-700 mb-2">💪 강점</p>
                    {aiAnalysis.strengths.map((s, i) => (
                      <p key={i} className="text-xs text-gray-700 mb-1 leading-relaxed">• {s}</p>
                    ))}
                  </div>
                )}

                {aiAnalysis.weaknesses.length > 0 && (
                  <div className="bg-white rounded-xl p-3">
                    <p className="text-xs font-bold text-orange-700 mb-2">⚠️ 약점</p>
                    {aiAnalysis.weaknesses.map((w, i) => (
                      <p key={i} className="text-xs text-gray-700 mb-1 leading-relaxed">• {w}</p>
                    ))}
                  </div>
                )}

                {aiAnalysis.risks.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-xs font-bold text-red-700 mb-2">🚨 위험 신호</p>
                    {aiAnalysis.risks.map((r, i) => (
                      <p key={i} className="text-xs text-red-700 mb-1 leading-relaxed">• {r}</p>
                    ))}
                  </div>
                )}

                {aiAnalysis.insights.length > 0 && (
                  <div className="bg-white rounded-xl p-3">
                    <p className="text-xs font-bold text-blue-700 mb-2">💡 핵심 인사이트</p>
                    {aiAnalysis.insights.map((insight, i) => (
                      <p key={i} className="text-xs text-gray-700 mb-1 leading-relaxed">• {insight}</p>
                    ))}
                  </div>
                )}

                <div className="bg-blue-600 text-white rounded-xl p-3">
                  <p className="text-xs font-bold mb-1">📌 투자 의견</p>
                  <p className="text-sm leading-relaxed">{aiAnalysis.recommendation}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
              <h2 className="text-sm font-bold text-gray-900 mb-4">📊 수익성 지표 추이</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ratioData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="ROE(%)" fill="#3b82f6" />
                  <Bar dataKey="영업이익률(%)" fill="#10b981" />
                  <Bar dataKey="순이익률(%)" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {analyzing && (
          <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl border border-blue-200 p-8 text-center mb-4">
            <div className="animate-spin text-4xl mb-4">🤖</div>
            <p className="text-gray-700 font-medium">AI가 재무제표를 심층 분석하고 있습니다...</p>
            <p className="text-xs text-gray-500 mt-2">성장성, 수익성, 안정성, 현금흐름 종합 평가 중</p>
            <div className="w-full bg-white rounded-full h-2 overflow-hidden mt-4">
              <div className="h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse" style={{ width: '100%' }} />
            </div>
          </div>
        )}

        {result && chartData && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-4">📈 재무 추이 (단위: {chartUnitLabel})</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="매출액" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="영업이익" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="당기순이익" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {result && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{result.corpName}</h2>
                <p className="text-sm text-gray-600">{result.stockCode}</p>
              </div>
              <button
                onClick={() => setShowGuide(!showGuide)}
                className="text-xs text-blue-600 underline">
                {showGuide ? '지표 설명 닫기' : '지표 설명 보기'}
              </button>
            </div>

            {showGuide && (
              <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
                <h3 className="text-sm font-bold text-gray-900 mb-2">📚 재무지표 가이드</h3>

                <div className="text-xs space-y-2">
                  <div className="border-l-4 border-green-500 pl-3">
                    <p className="font-bold text-gray-900">ROE (자기자본이익률)</p>
                    <p className="text-gray-600">= 당기순이익 ÷ 자본총계 × 100</p>
                    <p className="text-gray-600">✅ 높을수록 좋음 (15% 이상 우수, 20% 이상 매우 우수)</p>
                    <p className="text-gray-600">투자한 자본 대비 수익 창출 능력</p>
                  </div>

                  <div className="border-l-4 border-green-500 pl-3">
                    <p className="font-bold text-gray-900">ROA (총자산이익률)</p>
                    <p className="text-gray-600">= 당기순이익 ÷ 총자산 × 100</p>
                    <p className="text-gray-600">✅ 높을수록 좋음 (5% 이상 양호)</p>
                    <p className="text-gray-600">보유 자산 대비 수익 창출 효율</p>
                  </div>

                  <div className="border-l-4 border-green-500 pl-3">
                    <p className="font-bold text-gray-900">영업이익률</p>
                    <p className="text-gray-600">= 영업이익 ÷ 매출액 × 100</p>
                    <p className="text-gray-600">✅ 높을수록 좋음 (10% 이상 양호)</p>
                    <p className="text-gray-600">본업에서의 수익성</p>
                  </div>

                  <div className="border-l-4 border-green-500 pl-3">
                    <p className="font-bold text-gray-900">순이익률</p>
                    <p className="text-gray-600">= 당기순이익 ÷ 매출액 × 100</p>
                    <p className="text-gray-600">✅ 높을수록 좋음 (5% 이상 양호)</p>
                    <p className="text-gray-600">최종적인 수익성</p>
                  </div>

                  <div className="border-l-4 border-red-500 pl-3">
                    <p className="font-bold text-gray-900">부채비율</p>
                    <p className="text-gray-600">= 부채총계 ÷ 자본총계 × 100</p>
                    <p className="text-gray-600">⚠️ 낮을수록 좋음 (100% 미만 안정, 200% 이상 위험)</p>
                    <p className="text-gray-600">재무 안정성 지표</p>
                  </div>

                  <div className="border-l-4 border-green-500 pl-3">
                    <p className="font-bold text-gray-900">자산회전율</p>
                    <p className="text-gray-600">= 매출액 ÷ 총자산</p>
                    <p className="text-gray-600">✅ 높을수록 좋음 (1.0 이상 양호)</p>
                    <p className="text-gray-600">자산 활용 효율성</p>
                  </div>

                  <div className="border-l-4 border-green-500 pl-3">
                    <p className="font-bold text-gray-900">현금전환율</p>
                    <p className="text-gray-600">= 영업현금흐름 ÷ 당기순이익 × 100</p>
                    <p className="text-gray-600">✅ 높을수록 좋음 (80% 이상 우수)</p>
                    <p className="text-gray-600">이익의 현금 실현도 (분식회계 탐지)</p>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm min-w-max">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-3 px-2 sticky left-0 bg-white font-bold text-gray-900 z-10">구분</th>
                    {result.summary.map(s => (
                      <th key={s.year} className="text-right py-3 px-2 whitespace-nowrap font-bold text-gray-900">
                        {s.year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-gray-900">
                  <tr className="border-b border-gray-200">
                    <td className="py-3 px-2 font-semibold sticky left-0 bg-white z-10">매출액</td>
                    {result.summary.map(s => (
                      <td key={s.year} className="text-right py-3 px-2 whitespace-nowrap font-medium">
                        {formatNumber(s.revenue)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-3 px-2 font-semibold sticky left-0 bg-white z-10">영업이익</td>
                    {result.summary.map(s => (
                      <td key={s.year} className={`text-right py-3 px-2 whitespace-nowrap font-medium ${s.operatingIncome < 0 ? 'text-red-600' : ''}`}>
                        {formatNumber(s.operatingIncome)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-3 px-2 font-semibold sticky left-0 bg-white z-10">당기순이익</td>
                    {result.summary.map(s => (
                      <td key={s.year} className={`text-right py-3 px-2 whitespace-nowrap font-medium ${s.netIncome < 0 ? 'text-red-600' : ''}`}>
                        {formatNumber(s.netIncome)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-3 px-2 font-semibold sticky left-0 bg-white z-10">총자산</td>
                    {result.summary.map(s => (
                      <td key={s.year} className="text-right py-3 px-2 whitespace-nowrap font-medium">
                        {formatNumber(s.totalAssets)}
                      </td>
                    ))}
                  </tr>

                  <tr className="border-b border-gray-200 bg-green-50">
                    <td className="py-3 px-2 font-semibold sticky left-0 bg-green-50 z-10">ROE</td>
                    {result.summary.map(s => (
                      <td key={s.year} className="text-right py-3 px-2 whitespace-nowrap font-bold text-green-700">
                        {s.totalEquity > 0 ? ((s.netIncome / s.totalEquity) * 100).toFixed(1) + '%' : '-'}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-200 bg-green-50">
                    <td className="py-3 px-2 font-semibold sticky left-0 bg-green-50 z-10">ROA</td>
                    {result.summary.map(s => (
                      <td key={s.year} className="text-right py-3 px-2 whitespace-nowrap font-bold text-green-700">
                        {s.totalAssets > 0 ? ((s.netIncome / s.totalAssets) * 100).toFixed(1) + '%' : '-'}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-200 bg-green-50">
                    <td className="py-3 px-2 font-semibold sticky left-0 bg-green-50 z-10">영업이익률</td>
                    {result.summary.map(s => (
                      <td key={s.year} className="text-right py-3 px-2 whitespace-nowrap font-bold text-green-700">
                        {s.revenue > 0 ? ((s.operatingIncome / s.revenue) * 100).toFixed(1) + '%' : '-'}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-200 bg-green-50">
                    <td className="py-3 px-2 font-semibold sticky left-0 bg-green-50 z-10">순이익률</td>
                    {result.summary.map(s => (
                      <td key={s.year} className="text-right py-3 px-2 whitespace-nowrap font-bold text-green-700">
                        {s.revenue > 0 ? ((s.netIncome / s.revenue) * 100).toFixed(1) + '%' : '-'}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-200 bg-blue-50">
                    <td className="py-3 px-2 font-semibold sticky left-0 bg-blue-50 z-10">부채비율</td>
                    {result.summary.map(s => (
                      <td key={s.year} className="text-right py-3 px-2 whitespace-nowrap font-bold text-blue-600">
                        {s.totalEquity > 0 ? ((s.totalLiabilities / s.totalEquity) * 100).toFixed(1) + '%' : '-'}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-200 bg-green-50">
                    <td className="py-3 px-2 font-semibold sticky left-0 bg-green-50 z-10">자산회전율</td>
                    {result.summary.map(s => (
                      <td key={s.year} className="text-right py-3 px-2 whitespace-nowrap font-bold text-green-700">
                        {s.totalAssets > 0 ? (s.revenue / s.totalAssets).toFixed(2) : '-'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}