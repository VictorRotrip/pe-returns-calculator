"use client";

import { useState, useMemo } from "react";

// ── Types ───────────────────────────────────────────────────────────────────

interface Scenario {
  label: string;
  grossIRR: number; // as decimal, e.g. 0.30
}

interface FundParams {
  investmentYears: number;
  fundLife: number;
  fundCostsPA: number;
  mgmtFeePA: number;
  hurdleRate: number;
  perfFeeRate: number;
  hasCatchup: boolean;
  hasFoF: boolean;
  fofMgmtFeePA: number;
  fofPerfFeeRate: number;
  fofHasCatchup: boolean;
  taxRate: number;
}

interface EBITDAParams {
  entryMultiple: number;
  leverage: number;
  holdingPeriod: number;
}

interface WaterfallResult {
  grossIRR: number;
  effectiveFundCost: number;
  irrAfterFundCosts: number;
  effectiveMgmtFee: number;
  irrAfterMgmt: number;
  perfFee: number;
  irrAfterPerf: number;
  fofMgmtFee: number;
  irrAfterFofMgmt: number;
  fofPerfFee: number;
  irrBeforeTax: number;
  tax: number;
  netIRR: number;
  moneyMultiple: number;
}

// ── Calculations ────────────────────────────────────────────────────────────

function calcPerformanceFee(
  irr: number,
  hurdle: number,
  feeRate: number,
  catchup: boolean
): number {
  if (irr <= hurdle) return 0;
  if (!catchup) return feeRate * (irr - hurdle);
  const catchupThreshold = hurdle / (1 - feeRate);
  if (irr <= catchupThreshold) return irr - hurdle;
  return feeRate * irr;
}

function calcMgmtFeeTotal(
  annualRate: number,
  investmentYears: number,
  fundLife: number
): number {
  // Committed capital portion (first investmentYears)
  const committed = Math.pow(1 + annualRate, investmentYears) - 1;

  // Invested capital portion (linear decline after investment period)
  const declinePeriod = fundLife - investmentYears;
  let invested = 1;
  for (let k = 1; k <= declinePeriod; k++) {
    const fraction = 1 - k / declinePeriod;
    invested *= 1 + annualRate * fraction;
  }
  invested -= 1;

  return (1 + committed) * (1 + invested) - 1;
}

function calculateWaterfall(
  grossIRR: number,
  p: FundParams
): WaterfallResult {
  // 1. Fund costs: compound annual rate over fund life, spread over investment years
  const effectiveFundCost =
    Math.pow(1 + p.fundCostsPA, p.fundLife / p.investmentYears) - 1;
  const irrAfterFundCosts = grossIRR - effectiveFundCost;

  // 2. Management fee
  const totalMgmt = calcMgmtFeeTotal(
    p.mgmtFeePA,
    p.investmentYears,
    p.fundLife
  );
  const effectiveMgmtFee =
    Math.pow(1 + totalMgmt, 1 / p.investmentYears) - 1;
  const irrAfterMgmt = irrAfterFundCosts - effectiveMgmtFee;

  // 3. Performance fee (carried interest)
  const perfFee = calcPerformanceFee(
    irrAfterMgmt,
    p.hurdleRate,
    p.perfFeeRate,
    p.hasCatchup
  );
  const irrAfterPerf = irrAfterMgmt - perfFee;

  // 4. Fund of Fund layers
  let fofMgmtFee = 0;
  let irrAfterFofMgmt = irrAfterPerf;
  let fofPerfFee = 0;

  if (p.hasFoF) {
    const totalFofMgmt = calcMgmtFeeTotal(
      p.fofMgmtFeePA,
      p.investmentYears,
      p.fundLife
    );
    fofMgmtFee = Math.pow(1 + totalFofMgmt, 1 / p.investmentYears) - 1;
    irrAfterFofMgmt = irrAfterPerf - fofMgmtFee;

    fofPerfFee = calcPerformanceFee(
      irrAfterFofMgmt,
      p.hurdleRate,
      p.fofPerfFeeRate,
      p.fofHasCatchup
    );
  }

  const irrBeforeTax = irrAfterFofMgmt - fofPerfFee;
  const tax = p.taxRate * irrBeforeTax;
  const netIRR = irrBeforeTax - tax;
  const moneyMultiple = Math.pow(1 + netIRR, p.investmentYears);

  return {
    grossIRR,
    effectiveFundCost,
    irrAfterFundCosts,
    effectiveMgmtFee,
    irrAfterMgmt,
    perfFee,
    irrAfterPerf,
    fofMgmtFee,
    irrAfterFofMgmt,
    fofPerfFee,
    irrBeforeTax,
    tax,
    netIRR,
    moneyMultiple,
  };
}

// EBITDA reverse-engineering

function requiredEBITDAGrowth(
  grossIRR: number,
  ep: EBITDAParams,
  exitMultipleOverride?: number
): number | null {
  const equityMoM = Math.pow(1 + grossIRR, ep.holdingPeriod);
  const exitMult = exitMultipleOverride ?? ep.entryMultiple;

  // (1+g)^h = (equityMoM * entryMult * (1-lev) + entryMult * lev) / exitMult
  const numerator =
    equityMoM * ep.entryMultiple * (1 - ep.leverage) +
    ep.entryMultiple * ep.leverage;
  const compound = numerator / exitMult;
  if (compound <= 0) return null;
  return Math.pow(compound, 1 / ep.holdingPeriod) - 1;
}

function requiredExitMultiple(
  grossIRR: number,
  ep: EBITDAParams,
  ebitdaGrowth: number
): number {
  const equityMoM = Math.pow(1 + grossIRR, ep.holdingPeriod);
  const numerator =
    equityMoM * ep.entryMultiple * (1 - ep.leverage) +
    ep.entryMultiple * ep.leverage;
  return numerator / Math.pow(1 + ebitdaGrowth, ep.holdingPeriod);
}

// ── Formatting ──────────────────────────────────────────────────────────────

const pct = (v: number) => (v * 100).toFixed(2) + "%";
const pct1 = (v: number) => (v * 100).toFixed(1) + "%";
const mult = (v: number) => v.toFixed(2) + "x";

// ── Component ───────────────────────────────────────────────────────────────

export default function PEReturnsCalculator() {
  // Scenarios
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { label: "Best Case", grossIRR: 0.3 },
    { label: "Second Best", grossIRR: 0.25 },
    { label: "Base Case", grossIRR: 0.18 },
    { label: "Second Worst", grossIRR: 0.15 },
    { label: "Worst Case", grossIRR: 0.13 },
  ]);

  // Fund parameters
  const [params, setParams] = useState<FundParams>({
    investmentYears: 5,
    fundLife: 10,
    fundCostsPA: 0.005,
    mgmtFeePA: 0.02,
    hurdleRate: 0.08,
    perfFeeRate: 0.2,
    hasCatchup: true,
    hasFoF: true,
    fofMgmtFeePA: 0.007,
    fofPerfFeeRate: 0.05,
    fofHasCatchup: true,
    taxRate: 0.2,
  });

  // EBITDA parameters
  const [ebitda, setEBITDA] = useState<EBITDAParams>({
    entryMultiple: 10,
    leverage: 0.5,
    holdingPeriod: 5,
  });

  // Calculate waterfalls
  const results = useMemo(
    () => scenarios.map((s) => calculateWaterfall(s.grossIRR, params)),
    [scenarios, params]
  );

  // Helper to update a single scenario
  const updateScenario = (idx: number, grossIRR: number) => {
    setScenarios((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, grossIRR } : s))
    );
  };

  const updateParam = <K extends keyof FundParams>(
    key: K,
    value: FundParams[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const updateEBITDA = <K extends keyof EBITDAParams>(
    key: K,
    value: EBITDAParams[K]
  ) => {
    setEBITDA((prev) => ({ ...prev, [key]: value }));
  };

  // Waterfall rows
  const waterfallRows: {
    label: string;
    key: keyof WaterfallResult;
    isSubtotal?: boolean;
    isCost?: boolean;
    isTotal?: boolean;
    isMult?: boolean;
  }[] = [
    { label: "Bruto IRR", key: "grossIRR", isSubtotal: true },
    { label: "Af: fondskosten", key: "effectiveFundCost", isCost: true },
    { label: "IRR na fondskosten", key: "irrAfterFundCosts", isSubtotal: true },
    { label: "Af: management fee", key: "effectiveMgmtFee", isCost: true },
    {
      label: "IRR na fondskosten & mgmt fee",
      key: "irrAfterMgmt",
      isSubtotal: true,
    },
    { label: "Af: performance fee (carry)", key: "perfFee", isCost: true },
    { label: "IRR na fondskosten & fees", key: "irrAfterPerf", isSubtotal: true },
    ...(params.hasFoF
      ? [
          {
            label: "Af: FoF management fee",
            key: "fofMgmtFee" as keyof WaterfallResult,
            isCost: true,
          },
          {
            label: "IRR na FoF mgmt fee",
            key: "irrAfterFofMgmt" as keyof WaterfallResult,
            isSubtotal: true,
          },
          {
            label: "Af: FoF performance fee",
            key: "fofPerfFee" as keyof WaterfallResult,
            isCost: true,
          },
        ]
      : []),
    { label: "Netto IRR voor VPB", key: "irrBeforeTax", isSubtotal: true },
    { label: `Af: VPB (${(params.taxRate * 100).toFixed(0)}%)`, key: "tax", isCost: true },
    { label: "Netto IRR na VPB", key: "netIRR", isTotal: true },
    { label: "Money Multiple", key: "moneyMultiple", isMult: true },
  ];

  // Input component
  const PctInput = ({
    value,
    onChange,
    label,
    step = 0.1,
  }: {
    value: number;
    onChange: (v: number) => void;
    label: string;
    step?: number;
  }) => (
    <div className="flex items-center justify-between gap-2">
      <label className="text-sm text-gray-600 whitespace-nowrap">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          value={parseFloat((value * 100).toFixed(4))}
          onChange={(e) => onChange(parseFloat(e.target.value) / 100 || 0)}
          className="w-20 px-2 py-1 text-right text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-500">%</span>
      </div>
    </div>
  );

  const NumInput = ({
    value,
    onChange,
    label,
    suffix,
    step = 1,
  }: {
    value: number;
    onChange: (v: number) => void;
    label: string;
    suffix?: string;
    step?: number;
  }) => (
    <div className="flex items-center justify-between gap-2">
      <label className="text-sm text-gray-600 whitespace-nowrap">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-20 px-2 py-1 text-right text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            PE Returns Calculator
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Bruto IRR vs Netto IRR &mdash; Fee Waterfall & Implied Portfolio
            Performance
          </p>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Fund Parameters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
              Fondsparameters
            </h2>
            <div className="space-y-3">
              <NumInput
                label="Investeringsperiode"
                value={params.investmentYears}
                onChange={(v) => updateParam("investmentYears", v)}
                suffix="jr"
              />
              <NumInput
                label="Looptijd fonds"
                value={params.fundLife}
                onChange={(v) => updateParam("fundLife", v)}
                suffix="jr"
              />
              <PctInput
                label="Fondskosten p.j."
                value={params.fundCostsPA}
                onChange={(v) => updateParam("fundCostsPA", v)}
                step={0.05}
              />
              <PctInput
                label="Management fee p.j."
                value={params.mgmtFeePA}
                onChange={(v) => updateParam("mgmtFeePA", v)}
              />
              <PctInput
                label="Hurdle rate"
                value={params.hurdleRate}
                onChange={(v) => updateParam("hurdleRate", v)}
              />
              <PctInput
                label="Performance fee"
                value={params.perfFeeRate}
                onChange={(v) => updateParam("perfFeeRate", v)}
              />
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">Catchup</label>
                <input
                  type="checkbox"
                  checked={params.hasCatchup}
                  onChange={(e) => updateParam("hasCatchup", e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
              <PctInput
                label="VPB"
                value={params.taxRate}
                onChange={(v) => updateParam("taxRate", v)}
              />
            </div>
          </div>

          {/* Fund of Fund */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Fund of Fund
              </h2>
              <input
                type="checkbox"
                checked={params.hasFoF}
                onChange={(e) => updateParam("hasFoF", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            {params.hasFoF && (
              <div className="space-y-3">
                <PctInput
                  label="FoF management fee p.j."
                  value={params.fofMgmtFeePA}
                  onChange={(v) => updateParam("fofMgmtFeePA", v)}
                  step={0.05}
                />
                <PctInput
                  label="FoF performance fee"
                  value={params.fofPerfFeeRate}
                  onChange={(v) => updateParam("fofPerfFeeRate", v)}
                />
                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-600">FoF Catchup</label>
                  <input
                    type="checkbox"
                    checked={params.fofHasCatchup}
                    onChange={(e) =>
                      updateParam("fofHasCatchup", e.target.checked)
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Scenario IRRs */}
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mt-6 mb-4">
              Bruto IRR Scenario&apos;s
            </h2>
            <div className="space-y-2">
              {scenarios.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-28 truncate">
                    {s.label}
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step={1}
                      value={parseFloat((s.grossIRR * 100).toFixed(2))}
                      onChange={(e) =>
                        updateScenario(i, parseFloat(e.target.value) / 100 || 0)
                      }
                      className="w-16 px-2 py-1 text-right text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* EBITDA Parameters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
              Portfolio Analyse (EBITDA)
            </h2>
            <div className="space-y-3">
              <NumInput
                label="Entry EV/EBITDA"
                value={ebitda.entryMultiple}
                onChange={(v) => updateEBITDA("entryMultiple", v)}
                suffix="x"
                step={0.5}
              />
              <PctInput
                label="Leverage"
                value={ebitda.leverage}
                onChange={(v) => updateEBITDA("leverage", v)}
                step={5}
              />
              <NumInput
                label="Holding period"
                value={ebitda.holdingPeriod}
                onChange={(v) => updateEBITDA("holdingPeriod", v)}
                suffix="jr"
              />
            </div>

            <div className="mt-4 p-3 bg-gray-50 rounded text-xs text-gray-500 leading-relaxed">
              Berekent welke EBITDA-groei of exit-multiple nodig is om de bruto
              IRR te realiseren, gegeven entry-multiple en leverage.
            </div>
          </div>
        </div>

        {/* ── Waterfall Table ───────────────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto mb-8">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Fee Waterfall
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-5 text-gray-500 font-medium w-72">
                  &nbsp;
                </th>
                {scenarios.map((s, i) => (
                  <th
                    key={i}
                    className="text-right py-3 px-4 text-gray-700 font-semibold whitespace-nowrap"
                  >
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {waterfallRows.map((row, ri) => (
                <tr
                  key={ri}
                  className={`border-b border-gray-50 ${
                    row.isTotal
                      ? "bg-blue-50 font-bold"
                      : row.isMult
                      ? "bg-gray-50"
                      : row.isSubtotal
                      ? "font-medium"
                      : ""
                  }`}
                >
                  <td
                    className={`py-2.5 px-5 ${
                      row.isCost ? "text-gray-500 pl-8" : "text-gray-800"
                    }`}
                  >
                    {row.label}
                  </td>
                  {results.map((r, ci) => {
                    const val = r[row.key] as number;
                    return (
                      <td
                        key={ci}
                        className={`py-2.5 px-4 text-right tabular-nums ${
                          row.isCost
                            ? "text-red-600"
                            : row.isTotal
                            ? "text-blue-900"
                            : row.isMult
                            ? "text-gray-700"
                            : "text-gray-900"
                        }`}
                      >
                        {row.isMult
                          ? mult(val)
                          : row.isCost
                          ? "-" + pct(val)
                          : pct(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Fee Drag Summary ──────────────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto mb-8">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Fee Drag (Bruto vs Netto)
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-5 text-gray-500 font-medium w-72">
                  &nbsp;
                </th>
                {scenarios.map((s, i) => (
                  <th
                    key={i}
                    className="text-right py-3 px-4 text-gray-700 font-semibold"
                  >
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="py-2.5 px-5 text-gray-800">Bruto IRR</td>
                {results.map((r, i) => (
                  <td
                    key={i}
                    className="py-2.5 px-4 text-right tabular-nums text-gray-900"
                  >
                    {pct(r.grossIRR)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-2.5 px-5 text-gray-800">Netto IRR na VPB</td>
                {results.map((r, i) => (
                  <td
                    key={i}
                    className="py-2.5 px-4 text-right tabular-nums text-gray-900"
                  >
                    {pct(r.netIRR)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-50 bg-orange-50">
                <td className="py-2.5 px-5 text-gray-800 font-medium">
                  Totale fee drag
                </td>
                {results.map((r, i) => (
                  <td
                    key={i}
                    className="py-2.5 px-4 text-right tabular-nums text-orange-700 font-semibold"
                  >
                    {pct(r.grossIRR - r.netIRR)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-50 bg-orange-50">
                <td className="py-2.5 px-5 text-gray-800 font-medium">
                  Fee drag als % van bruto
                </td>
                {results.map((r, i) => (
                  <td
                    key={i}
                    className="py-2.5 px-4 text-right tabular-nums text-orange-700 font-semibold"
                  >
                    {r.grossIRR > 0
                      ? pct1((r.grossIRR - r.netIRR) / r.grossIRR)
                      : "n/a"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── EBITDA Reverse Engineering ────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto mb-8">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Implied Portfolio Performance
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Entry {ebitda.entryMultiple}x EV/EBITDA
              &middot; {(ebitda.leverage * 100).toFixed(0)}% leverage
              &middot; {ebitda.holdingPeriod} jaar holding
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-5 text-gray-500 font-medium w-72">
                  &nbsp;
                </th>
                {scenarios.map((s, i) => (
                  <th
                    key={i}
                    className="text-right py-3 px-4 text-gray-700 font-semibold"
                  >
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="py-2.5 px-5 text-gray-800 font-medium">
                  Bruto IRR
                </td>
                {scenarios.map((s, i) => (
                  <td
                    key={i}
                    className="py-2.5 px-4 text-right tabular-nums text-gray-900"
                  >
                    {pct(s.grossIRR)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-2.5 px-5 text-gray-800">
                  Gross Equity MoM
                </td>
                {scenarios.map((s, i) => (
                  <td
                    key={i}
                    className="py-2.5 px-4 text-right tabular-nums text-gray-900"
                  >
                    {mult(Math.pow(1 + s.grossIRR, ebitda.holdingPeriod))}
                  </td>
                ))}
              </tr>

              {/* Required EBITDA growth at same multiple */}
              <tr className="border-b border-gray-50 bg-emerald-50">
                <td className="py-2.5 px-5 text-gray-800 font-medium">
                  Benodigde EBITDA CAGR
                  <span className="block text-xs text-gray-500 font-normal">
                    (zelfde exit-multiple)
                  </span>
                </td>
                {scenarios.map((s, i) => {
                  const g = requiredEBITDAGrowth(s.grossIRR, ebitda);
                  return (
                    <td
                      key={i}
                      className="py-2.5 px-4 text-right tabular-nums text-emerald-800 font-semibold"
                    >
                      {g !== null ? pct(g) : "n/a"}
                    </td>
                  );
                })}
              </tr>

              {/* Required exit multiple at 0% growth */}
              <tr className="border-b border-gray-50 bg-violet-50">
                <td className="py-2.5 px-5 text-gray-800 font-medium">
                  Benodigde exit-multiple
                  <span className="block text-xs text-gray-500 font-normal">
                    (0% EBITDA-groei)
                  </span>
                </td>
                {scenarios.map((s, i) => {
                  const m = requiredExitMultiple(s.grossIRR, ebitda, 0);
                  return (
                    <td
                      key={i}
                      className="py-2.5 px-4 text-right tabular-nums text-violet-800 font-semibold"
                    >
                      {mult(m)}
                    </td>
                  );
                })}
              </tr>

              {/* Required exit multiple at 5% growth */}
              <tr className="border-b border-gray-50 bg-violet-50/50">
                <td className="py-2.5 px-5 text-gray-800">
                  Benodigde exit-multiple
                  <span className="block text-xs text-gray-500 font-normal">
                    (5% EBITDA-groei)
                  </span>
                </td>
                {scenarios.map((s, i) => {
                  const m = requiredExitMultiple(s.grossIRR, ebitda, 0.05);
                  return (
                    <td
                      key={i}
                      className="py-2.5 px-4 text-right tabular-nums text-violet-700"
                    >
                      {mult(m)}
                    </td>
                  );
                })}
              </tr>

              {/* Required exit multiple at 10% growth */}
              <tr className="border-b border-gray-50 bg-violet-50/30">
                <td className="py-2.5 px-5 text-gray-800">
                  Benodigde exit-multiple
                  <span className="block text-xs text-gray-500 font-normal">
                    (10% EBITDA-groei)
                  </span>
                </td>
                {scenarios.map((s, i) => {
                  const m = requiredExitMultiple(s.grossIRR, ebitda, 0.1);
                  return (
                    <td
                      key={i}
                      className="py-2.5 px-4 text-right tabular-nums text-violet-700"
                    >
                      {mult(m)}
                    </td>
                  );
                })}
              </tr>

              {/* Required EBITDA growth for 1x multiple expansion */}
              <tr className="border-b border-gray-50 bg-emerald-50/50">
                <td className="py-2.5 px-5 text-gray-800">
                  Benodigde EBITDA CAGR
                  <span className="block text-xs text-gray-500 font-normal">
                    (exit {ebitda.entryMultiple + 2}x, +2x expansie)
                  </span>
                </td>
                {scenarios.map((s, i) => {
                  const g = requiredEBITDAGrowth(
                    s.grossIRR,
                    ebitda,
                    ebitda.entryMultiple + 2
                  );
                  return (
                    <td
                      key={i}
                      className="py-2.5 px-4 text-right tabular-nums text-emerald-700"
                    >
                      {g !== null ? pct(g) : "n/a"}
                    </td>
                  );
                })}
              </tr>

              {/* Required EBITDA growth for 2x multiple compression */}
              <tr className="border-b border-gray-50 bg-amber-50/50">
                <td className="py-2.5 px-5 text-gray-800">
                  Benodigde EBITDA CAGR
                  <span className="block text-xs text-gray-500 font-normal">
                    (exit {Math.max(ebitda.entryMultiple - 2, 1)}x, -2x
                    compressie)
                  </span>
                </td>
                {scenarios.map((s, i) => {
                  const g = requiredEBITDAGrowth(
                    s.grossIRR,
                    ebitda,
                    Math.max(ebitda.entryMultiple - 2, 1)
                  );
                  return (
                    <td
                      key={i}
                      className="py-2.5 px-4 text-right tabular-nums text-amber-700"
                    >
                      {g !== null ? pct(g) : "n/a"}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pb-8">
          PE Returns Calculator &middot; Gebaseerd op standaard PE fee structuur
          met lineaire afbouw na investeringsperiode
        </div>
      </div>
    </div>
  );
}
