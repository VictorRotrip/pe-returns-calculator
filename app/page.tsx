"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";

// ── Types ───────────────────────────────────────────────────────────────────

interface Scenario { label: string; grossIRR: number }
interface FundParams {
  investmentYears: number; fundLife: number; fundCostsPA: number;
  mgmtFeePA: number; hurdleRate: number; perfFeeRate: number;
  hasCatchup: boolean; hasFoF: boolean; fofMgmtFeePA: number;
  fofPerfFeeRate: number; fofHasCatchup: boolean; taxRate: number;
}
interface EBITDAParams { entryMultiple: number; leverage: number; holdingPeriod: number }
interface WaterfallResult {
  grossIRR: number; effectiveFundCost: number; irrAfterFundCosts: number;
  effectiveMgmtFee: number; irrAfterMgmt: number; perfFee: number;
  irrAfterPerf: number; fofMgmtFee: number; irrAfterFofMgmt: number;
  fofPerfFee: number; irrBeforeTax: number; tax: number;
  netIRR: number; moneyMultiple: number;
}

// ── Calculations ────────────────────────────────────────────────────────────

function calcPerformanceFee(irr: number, hurdle: number, feeRate: number, catchup: boolean): number {
  if (irr <= hurdle) return 0;
  if (!catchup) return feeRate * (irr - hurdle);
  const t = hurdle / (1 - feeRate);
  if (irr <= t) return irr - hurdle;
  return feeRate * irr;
}

function calcMgmtFeeTotal(rate: number, invYears: number, fundLife: number): number {
  const committed = Math.pow(1 + rate, invYears) - 1;
  const dp = fundLife - invYears;
  let invested = 1;
  for (let k = 1; k <= dp; k++) invested *= 1 + rate * (1 - k / dp);
  invested -= 1;
  return (1 + committed) * (1 + invested) - 1;
}

function calculateWaterfall(grossIRR: number, p: FundParams): WaterfallResult {
  const effectiveFundCost = Math.pow(1 + p.fundCostsPA, p.fundLife / p.investmentYears) - 1;
  const irrAfterFundCosts = grossIRR - effectiveFundCost;
  const effectiveMgmtFee = Math.pow(1 + calcMgmtFeeTotal(p.mgmtFeePA, p.investmentYears, p.fundLife), 1 / p.investmentYears) - 1;
  const irrAfterMgmt = irrAfterFundCosts - effectiveMgmtFee;
  const perfFee = calcPerformanceFee(irrAfterMgmt, p.hurdleRate, p.perfFeeRate, p.hasCatchup);
  const irrAfterPerf = irrAfterMgmt - perfFee;
  let fofMgmtFee = 0, irrAfterFofMgmt = irrAfterPerf, fofPerfFee = 0;
  if (p.hasFoF) {
    fofMgmtFee = Math.pow(1 + calcMgmtFeeTotal(p.fofMgmtFeePA, p.investmentYears, p.fundLife), 1 / p.investmentYears) - 1;
    irrAfterFofMgmt = irrAfterPerf - fofMgmtFee;
    fofPerfFee = calcPerformanceFee(irrAfterFofMgmt, p.hurdleRate, p.fofPerfFeeRate, p.fofHasCatchup);
  }
  const irrBeforeTax = irrAfterFofMgmt - fofPerfFee;
  const tax = p.taxRate * irrBeforeTax;
  const netIRR = irrBeforeTax - tax;
  const moneyMultiple = Math.pow(1 + netIRR, p.investmentYears);
  return { grossIRR, effectiveFundCost, irrAfterFundCosts, effectiveMgmtFee, irrAfterMgmt, perfFee, irrAfterPerf, fofMgmtFee, irrAfterFofMgmt, fofPerfFee, irrBeforeTax, tax, netIRR, moneyMultiple };
}

function requiredEBITDAGrowth(grossIRR: number, ep: EBITDAParams, exitMult?: number): number | null {
  const mom = Math.pow(1 + grossIRR, ep.holdingPeriod);
  const em = exitMult ?? ep.entryMultiple;
  const c = (mom * ep.entryMultiple * (1 - ep.leverage) + ep.entryMultiple * ep.leverage) / em;
  if (c <= 0) return null;
  return Math.pow(c, 1 / ep.holdingPeriod) - 1;
}

function requiredExitMultiple(grossIRR: number, ep: EBITDAParams, g: number): number {
  const mom = Math.pow(1 + grossIRR, ep.holdingPeriod);
  return (mom * ep.entryMultiple * (1 - ep.leverage) + ep.entryMultiple * ep.leverage) / Math.pow(1 + g, ep.holdingPeriod);
}

// ── Formatting ──────────────────────────────────────────────────────────────

const pct = (v: number) => (v * 100).toFixed(2) + "%";
const pct1 = (v: number) => (v * 100).toFixed(1) + "%";
const pct0 = (v: number) => (v * 100).toFixed(0) + "%";
const m = (v: number) => v.toFixed(2) + "x";

// ── Reusable components ─────────────────────────────────────────────────────

function Slider({ label, hint, value, onChange, min, max, step, format }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; format: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-sm font-semibold text-gray-900 tabular-nums">{format(value)}</span>
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600" />
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{format(min)}</span><span>{format(max)}</span>
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 cursor-pointer group" onClick={() => onChange(!checked)}>
      <div>
        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</span>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
      <div className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-gray-300"}`}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
    </div>
  );
}

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>{children}</div>;
}

// ── Section icons ────────────────────────────────────────────────────────────

const IconCompany = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
  </svg>
);
const IconFund = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  </svg>
);
const IconInvestor = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);
const IconChevron = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

// ── Charts ───────────────────────────────────────────────────────────────────

const COLORS = {
  net: "#2563eb", fundExp: "#f97316", mgmt: "#ef4444",
  carry: "#8b5cf6", fofMgmt: "#ec4899", fofCarry: "#f43f5e", tax: "#6b7280",
};

function StackedChart({ results, scenarios, hasFoF }: {
  results: WaterfallResult[]; scenarios: Scenario[]; hasFoF: boolean;
}) {
  const data = results.map((r, i) => ({
    name: scenarios[i].label,
    "Net IRR": +(r.netIRR * 100).toFixed(2),
    "Tax": +(r.tax * 100).toFixed(2),
    ...(hasFoF ? { "FoF Carry": +(r.fofPerfFee * 100).toFixed(2), "FoF Mgmt": +(r.fofMgmtFee * 100).toFixed(2) } : {}),
    "Carry": +(r.perfFee * 100).toFixed(2),
    "Mgmt Fee": +(r.effectiveMgmtFee * 100).toFixed(2),
    "Fund Exp.": +(r.effectiveFundCost * 100).toFixed(2),
  }));
  const keys = ["Net IRR", "Tax", ...(hasFoF ? ["FoF Carry", "FoF Mgmt"] : []), "Carry", "Mgmt Fee", "Fund Exp."];
  const colors = [COLORS.net, COLORS.tax, ...(hasFoF ? [COLORS.fofCarry, COLORS.fofMgmt] : []), COLORS.carry, COLORS.mgmt, COLORS.fundExp];
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => v + "%"} />
        <Tooltip formatter={(value: number) => value.toFixed(2) + "%"} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {keys.map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={colors[i]} radius={i === keys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

function FeePie({ result, hasFoF }: { result: WaterfallResult; hasFoF: boolean }) {
  const drag = result.grossIRR - result.netIRR;
  if (drag <= 0) return null;
  const slices = [
    { name: "Fund Exp.", value: +(result.effectiveFundCost / drag * 100).toFixed(1), color: COLORS.fundExp },
    { name: "Mgmt Fee", value: +(result.effectiveMgmtFee / drag * 100).toFixed(1), color: COLORS.mgmt },
    { name: "Carry", value: +(result.perfFee / drag * 100).toFixed(1), color: COLORS.carry },
    ...(hasFoF ? [
      { name: "FoF Mgmt", value: +(result.fofMgmtFee / drag * 100).toFixed(1), color: COLORS.fofMgmt },
      { name: "FoF Carry", value: +(result.fofPerfFee / drag * 100).toFixed(1), color: COLORS.fofCarry },
    ] : []),
    { name: "Tax", value: +(result.tax / drag * 100).toFixed(1), color: COLORS.tax },
  ].filter(s => s.value > 0);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={slices} cx="50%" cy="50%" innerRadius={50} outerRadius={82}
          paddingAngle={2} dataKey="value" label={({ name, value }) => `${name} ${value}%`}
          labelLine={{ strokeWidth: 1 }} style={{ fontSize: 10 }}>
          {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
        </Pie>
        <Tooltip formatter={(value: number) => value.toFixed(1) + "%"} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Methodology ──────────────────────────────────────────────────────────────

function Methodology({ params }: { params: FundParams }) {
  const [open, setOpen] = useState(false);
  return (
    <SectionCard>
      <button className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors" onClick={() => setOpen(!open)}>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">How are these calculated?</h2>
          <p className="text-xs text-gray-400 mt-0.5">Click to {open ? "hide" : "view"} methodology and formulas</p>
        </div>
        <svg className={`w-5 h-5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-6 text-sm text-gray-600 border-t border-gray-100 pt-4">
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">1. Fund Expenses</h3>
            <p className="mb-2">Annual fund expense rate ({pct1(params.fundCostsPA)}) is charged over the full {params.fundLife}-year fund life, compressed to the {params.investmentYears}-year investment period:</p>
            <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs">
              Effective cost = (1 + {pct1(params.fundCostsPA)})^({params.fundLife}/{params.investmentYears}) − 1 = {pct(Math.pow(1 + params.fundCostsPA, params.fundLife / params.investmentYears) - 1)}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">2. Management Fee</h3>
            <p className="mb-2">{pct1(params.mgmtFeePA)} on committed capital during years 1–{params.investmentYears}, then declining linearly as companies are exited (years {params.investmentYears + 1}–{params.fundLife}).</p>
            <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs space-y-1">
              <div>Committed portion = (1 + {pct1(params.mgmtFeePA)})^{params.investmentYears} − 1</div>
              <div>Invested portion = &prod;(1 + {pct1(params.mgmtFeePA)} &times; declining fraction) − 1</div>
              <div>Effective annual = (1 + total)^(1/{params.investmentYears}) − 1 = {pct(Math.pow(1 + calcMgmtFeeTotal(params.mgmtFeePA, params.investmentYears, params.fundLife), 1 / params.investmentYears) - 1)}</div>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">3. Carried Interest</h3>
            <p className="mb-2">{pct0(params.perfFeeRate)} carry with {pct0(params.hurdleRate)} hurdle{params.hasCatchup ? " and GP catchup" : ""}:</p>
            {params.hasCatchup ? (
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
                <div>IRR &le; {pct0(params.hurdleRate)}: No carry — 100% to LP</div>
                <div>{pct0(params.hurdleRate)} &lt; IRR &le; {pct1(params.hurdleRate / (1 - params.perfFeeRate))}: Catchup — 100% to GP</div>
                <div>IRR &gt; {pct1(params.hurdleRate / (1 - params.perfFeeRate))}: {pct0(params.perfFeeRate)} &times; full IRR after costs</div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
                <div>IRR &le; {pct0(params.hurdleRate)}: No carry</div>
                <div>IRR &gt; {pct0(params.hurdleRate)}: {pct0(params.perfFeeRate)} &times; (IRR − {pct0(params.hurdleRate)})</div>
              </div>
            )}
          </div>
          {params.hasFoF && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-2">4. Fund of Fund Fees</h3>
              <p>Same structure as fund-level fees but at FoF rates ({pct1(params.fofMgmtFeePA)} mgmt, {pct0(params.fofPerfFeeRate)} carry). Applied after the underlying fund&apos;s fees.</p>
            </div>
          )}
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">{params.hasFoF ? "5" : "4"}. Corporate Tax & Money Multiple</h3>
            <p>{pct0(params.taxRate)} flat rate on pre-tax IRR. Money Multiple = (1 + net IRR)^{params.investmentYears}.</p>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <h3 className="font-semibold text-gray-800 mb-2">EBITDA Reverse-Engineering</h3>
            <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs space-y-1">
              <div>Equity MoM = (1 + Gross IRR)^hold period</div>
              <div>Required (1+g)^h = (Equity MoM &times; Equity + Debt) / Exit Multiple</div>
            </div>
            <p className="mt-2 text-xs text-gray-400">Assumes no interim cash flows, no debt paydown.</p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── Flow indicator ──────────────────────────────────────────────────────────

type Section = "companies" | "fund" | "investor";

function FlowNav({ active, onChange }: { active: Section; onChange: (s: Section) => void }) {
  const steps: { id: Section; label: string; sub: string; icon: React.ReactNode; color: string; activeColor: string }[] = [
    { id: "companies", label: "Portfolio Companies", sub: "What growth & multiples are needed?", icon: <IconCompany />, color: "text-emerald-600", activeColor: "bg-emerald-50 border-emerald-200 ring-emerald-100" },
    { id: "fund", label: "Fund Gross Return", sub: "Target IRR across scenarios", icon: <IconFund />, color: "text-blue-600", activeColor: "bg-blue-50 border-blue-200 ring-blue-100" },
    { id: "investor", label: "LP Net Return", sub: "What does the investor receive?", icon: <IconInvestor />, color: "text-violet-600", activeColor: "bg-violet-50 border-violet-200 ring-violet-100" },
  ];

  return (
    <div className="flex items-stretch gap-0">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <button
            onClick={() => onChange(step.id)}
            className={`relative flex items-center gap-3 px-5 py-3 rounded-xl border transition-all ${
              active === step.id
                ? `${step.activeColor} ring-2 shadow-sm`
                : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
            }`}
          >
            <div className={`${active === step.id ? step.color : "text-gray-400"} transition-colors`}>
              {step.icon}
            </div>
            <div className="text-left">
              <div className={`text-sm font-semibold ${active === step.id ? step.color : "text-gray-700"}`}>
                {step.label}
              </div>
              <div className="text-[11px] text-gray-400">{step.sub}</div>
            </div>
          </button>
          {i < steps.length - 1 && (
            <div className="px-2 text-gray-300"><IconChevron /></div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function PEReturnsCalculator() {
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { label: "Best Case", grossIRR: 0.3 },
    { label: "Strong", grossIRR: 0.25 },
    { label: "Base Case", grossIRR: 0.18 },
    { label: "Weak", grossIRR: 0.15 },
    { label: "Worst Case", grossIRR: 0.13 },
  ]);
  const [params, setParams] = useState<FundParams>({
    investmentYears: 5, fundLife: 10, fundCostsPA: 0.005, mgmtFeePA: 0.02,
    hurdleRate: 0.08, perfFeeRate: 0.2, hasCatchup: true, hasFoF: true,
    fofMgmtFeePA: 0.007, fofPerfFeeRate: 0.05, fofHasCatchup: true, taxRate: 0.2,
  });
  const [ebitda, setEBITDA] = useState<EBITDAParams>({ entryMultiple: 10, leverage: 0.5, holdingPeriod: 5 });
  const [section, setSection] = useState<Section>("investor");

  const results = useMemo(() => scenarios.map((s) => calculateWaterfall(s.grossIRR, params)), [scenarios, params]);

  const up = (idx: number, v: number) => setScenarios((p) => p.map((s, i) => (i === idx ? { ...s, grossIRR: v } : s)));
  const sp = <K extends keyof FundParams>(k: K, v: FundParams[K]) => setParams((p) => ({ ...p, [k]: v }));
  const ep = <K extends keyof EBITDAParams>(k: K, v: EBITDAParams[K]) => setEBITDA((p) => ({ ...p, [k]: v }));

  const waterfallRows: { label: string; key: keyof WaterfallResult; type: "subtotal" | "cost" | "total" | "mult" }[] = [
    { label: "Gross IRR", key: "grossIRR", type: "subtotal" },
    { label: "Fund expenses", key: "effectiveFundCost", type: "cost" },
    { label: "After fund expenses", key: "irrAfterFundCosts", type: "subtotal" },
    { label: "Management fee", key: "effectiveMgmtFee", type: "cost" },
    { label: "After management fee", key: "irrAfterMgmt", type: "subtotal" },
    { label: "Carried interest", key: "perfFee", type: "cost" },
    { label: "After carry", key: "irrAfterPerf", type: "subtotal" },
    ...(params.hasFoF ? [
      { label: "FoF management fee", key: "fofMgmtFee" as keyof WaterfallResult, type: "cost" as const },
      { label: "After FoF mgmt fee", key: "irrAfterFofMgmt" as keyof WaterfallResult, type: "subtotal" as const },
      { label: "FoF carried interest", key: "fofPerfFee" as keyof WaterfallResult, type: "cost" as const },
    ] : []),
    { label: "Net IRR (pre-tax)", key: "irrBeforeTax", type: "subtotal" },
    { label: `Corporate tax (${pct0(params.taxRate)})`, key: "tax", type: "cost" },
    { label: "Net IRR (after tax)", key: "netIRR", type: "total" },
    { label: "Money Multiple", key: "moneyMultiple", type: "mult" },
  ];

  // Section accent colors
  const accent = section === "companies" ? "emerald" : section === "fund" ? "blue" : "violet";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">PE Returns Calculator</h1>
              <p className="text-xs text-gray-400 mt-0.5">From portfolio company performance to LP net returns</p>
            </div>
          </div>
          <div className="hidden lg:block"><FlowNav active={section} onChange={setSection} /></div>
          {/* Mobile nav */}
          <div className="flex lg:hidden bg-gray-100 rounded-lg p-0.5 text-sm">
            {([["companies", "Companies"], ["fund", "Gross IRR"], ["investor", "LP Returns"]] as [Section, string][]).map(([id, lbl]) => (
              <button key={id} onClick={() => setSection(id)}
                className={`flex-1 px-3 py-2 rounded-md font-medium transition-colors text-xs ${section === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">

          {/* ── Sidebar ──────────────────────────────────────────── */}
          <aside className="space-y-5">

            {/* Gross IRR Scenarios — always visible since they link all sections */}
            <SectionCard className="p-5">
              <h2 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Gross IRR Scenarios</h2>
              <p className="text-[11px] text-gray-400 mb-4">The fund&apos;s return before any fees to the investor</p>
              <div className="space-y-3">
                {scenarios.map((s, i) => (
                  <Slider key={i} label={s.label} value={s.grossIRR} onChange={(v) => up(i, v)}
                    min={0} max={0.5} step={0.01} format={(v) => pct0(v)} />
                ))}
              </div>
            </SectionCard>

            {/* Company-level inputs */}
            {section === "companies" && (
              <SectionCard className="p-5 border-emerald-200">
                <h2 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Deal Assumptions</h2>
                <p className="text-[11px] text-gray-400 mb-4">How the PE fund buys and finances its companies</p>
                <div className="space-y-4">
                  <Slider label="Entry EV/EBITDA" hint="Purchase price as multiple of EBITDA" value={ebitda.entryMultiple}
                    onChange={(v) => ep("entryMultiple", v)} min={4} max={20} step={0.5} format={(v) => v.toFixed(1) + "x"} />
                  <Slider label="Leverage" hint="Debt as % of enterprise value at entry" value={ebitda.leverage}
                    onChange={(v) => ep("leverage", v)} min={0} max={0.8} step={0.05} format={pct0} />
                  <Slider label="Holding period" hint="Years until exit" value={ebitda.holdingPeriod}
                    onChange={(v) => ep("holdingPeriod", v)} min={2} max={10} step={1} format={(v) => v + " yr"} />
                </div>
              </SectionCard>
            )}

            {/* Fund-level inputs */}
            {section === "fund" && (
              <SectionCard className="p-5 border-blue-200">
                <h2 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Fund Timing</h2>
                <p className="text-[11px] text-gray-400 mb-4">Investment period and fund life affect fee calculations</p>
                <div className="space-y-4">
                  <Slider label="Investment period" hint="Years actively deploying capital" value={params.investmentYears}
                    onChange={(v) => sp("investmentYears", v)} min={1} max={10} step={1} format={(v) => v + " yr"} />
                  <Slider label="Fund life" hint="Total duration including harvest period" value={params.fundLife}
                    onChange={(v) => sp("fundLife", v)} min={5} max={15} step={1} format={(v) => v + " yr"} />
                </div>
              </SectionCard>
            )}

            {/* Investor-level inputs */}
            {section === "investor" && (
              <>
                <SectionCard className="p-5 border-violet-200">
                  <h2 className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-1">Fund Fees</h2>
                  <p className="text-[11px] text-gray-400 mb-4">Costs charged by the GP to manage the fund</p>
                  <div className="space-y-4">
                    <Slider label="Investment period" value={params.investmentYears}
                      onChange={(v) => sp("investmentYears", v)} min={1} max={10} step={1} format={(v) => v + " yr"} />
                    <Slider label="Fund life" value={params.fundLife}
                      onChange={(v) => sp("fundLife", v)} min={5} max={15} step={1} format={(v) => v + " yr"} />
                    <Slider label="Fund expenses p.a." hint="Legal, admin, reporting" value={params.fundCostsPA}
                      onChange={(v) => sp("fundCostsPA", v)} min={0} max={0.02} step={0.001} format={(v) => pct1(v)} />
                    <Slider label="Management fee p.a." hint="On committed capital, declining after investment period" value={params.mgmtFeePA}
                      onChange={(v) => sp("mgmtFeePA", v)} min={0} max={0.04} step={0.001} format={pct1} />
                  </div>
                </SectionCard>

                <SectionCard className="p-5 border-violet-200">
                  <h2 className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-1">Carry & Hurdle</h2>
                  <p className="text-[11px] text-gray-400 mb-4">GP&apos;s share of profits above the preferred return</p>
                  <div className="space-y-4">
                    <Slider label="Hurdle rate" hint="LP preferred return before GP participates" value={params.hurdleRate}
                      onChange={(v) => sp("hurdleRate", v)} min={0} max={0.15} step={0.01} format={pct0} />
                    <Slider label="Carried interest" value={params.perfFeeRate}
                      onChange={(v) => sp("perfFeeRate", v)} min={0} max={0.3} step={0.01} format={pct0} />
                    <Toggle label="GP catchup" hint="GP gets 100% of profits in catchup zone" checked={params.hasCatchup} onChange={(v) => sp("hasCatchup", v)} />
                  </div>
                </SectionCard>

                <SectionCard className="p-5 border-violet-200">
                  <Toggle label="Fund of Fund layer" hint="Extra fee layer when investing through a FoF" checked={params.hasFoF} onChange={(v) => sp("hasFoF", v)} />
                  {params.hasFoF && (
                    <div className="space-y-4 pt-3 mt-3 border-t border-gray-100">
                      <Slider label="FoF management fee" value={params.fofMgmtFeePA} onChange={(v) => sp("fofMgmtFeePA", v)}
                        min={0} max={0.02} step={0.001} format={pct1} />
                      <Slider label="FoF carry" value={params.fofPerfFeeRate} onChange={(v) => sp("fofPerfFeeRate", v)}
                        min={0} max={0.15} step={0.01} format={pct0} />
                      <Toggle label="FoF catchup" checked={params.fofHasCatchup} onChange={(v) => sp("fofHasCatchup", v)} />
                    </div>
                  )}
                </SectionCard>

                <SectionCard className="p-5 border-violet-200">
                  <Slider label="Corporate tax rate" value={params.taxRate} onChange={(v) => sp("taxRate", v)}
                    min={0} max={0.4} step={0.01} format={pct0} />
                </SectionCard>
              </>
            )}
          </aside>

          {/* ── Main content ──────────────────────────────────────── */}
          <main className="space-y-6">

            {/* ═══ SECTION: Portfolio Companies ═══════════════════ */}
            {section === "companies" && (
              <>
                <div className="bg-emerald-600 rounded-xl p-5 text-white shadow-lg shadow-emerald-200">
                  <div className="flex items-center gap-2 text-emerald-200 text-xs uppercase tracking-wider mb-3">
                    <IconCompany />Portfolio Company Performance
                  </div>
                  <p className="text-sm text-emerald-100 leading-relaxed">
                    What EBITDA growth or multiple expansion do the fund&apos;s portfolio companies need to deliver
                    to generate each gross IRR scenario? This is the operating performance required
                    at the <strong>company level</strong> — before any fund fees touch the returns.
                  </p>
                  <div className="grid grid-cols-3 gap-6 mt-4 pt-4 border-t border-emerald-500">
                    <div><div className="text-2xl font-bold">{ebitda.entryMultiple.toFixed(1)}x</div><div className="text-xs text-emerald-200">Entry EV/EBITDA</div></div>
                    <div><div className="text-2xl font-bold">{pct0(ebitda.leverage)}</div><div className="text-xs text-emerald-200">Leverage</div></div>
                    <div><div className="text-2xl font-bold">{ebitda.holdingPeriod} yr</div><div className="text-xs text-emerald-200">Hold period</div></div>
                  </div>
                </div>

                <SectionCard className="overflow-x-auto">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Required EBITDA Growth</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Annual EBITDA CAGR needed at different exit multiple assumptions</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="text-left py-3 px-5 text-gray-400 font-medium text-xs uppercase tracking-wider w-64">Exit multiple</th>
                        {scenarios.map((s, i) => (
                          <th key={i} className={`text-right py-3 px-4 text-xs uppercase tracking-wider font-semibold ${i === 2 ? "text-emerald-600" : "text-gray-500"}`}>
                            {s.label}<div className="text-[10px] font-normal text-gray-400 mt-0.5">{pct0(s.grossIRR)} gross</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: `Same (${ebitda.entryMultiple.toFixed(1)}x → ${ebitda.entryMultiple.toFixed(1)}x)`, em: undefined, highlight: true },
                        { label: `+2x expansion (→ ${(ebitda.entryMultiple + 2).toFixed(1)}x)`, em: ebitda.entryMultiple + 2 },
                        { label: `−2x compression (→ ${Math.max(ebitda.entryMultiple - 2, 1).toFixed(1)}x)`, em: Math.max(ebitda.entryMultiple - 2, 1) },
                      ].map((row, ri) => (
                        <tr key={ri} className={`border-b border-gray-50 ${row.highlight ? "bg-emerald-50/50" : ""}`}>
                          <td className={`py-3 px-5 text-gray-700 ${row.highlight ? "font-medium" : ""}`}>{row.label}</td>
                          {scenarios.map((s, ci) => {
                            const g = requiredEBITDAGrowth(s.grossIRR, ebitda, row.em);
                            return (
                              <td key={ci} className={`py-3 px-4 text-right tabular-nums font-medium ${g !== null && g > 0.3 ? "text-red-500" : g !== null && g < 0 ? "text-amber-600" : "text-emerald-700"}`}>
                                {g !== null ? pct(g) : "n/a"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SectionCard>

                <SectionCard className="overflow-x-auto">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Required Exit Multiple</h2>
                    <p className="text-xs text-gray-400 mt-0.5">EV/EBITDA at exit needed at different EBITDA growth rates</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="text-left py-3 px-5 text-gray-400 font-medium text-xs uppercase tracking-wider w-64">EBITDA CAGR</th>
                        {scenarios.map((s, i) => (
                          <th key={i} className={`text-right py-3 px-4 text-xs uppercase tracking-wider font-semibold ${i === 2 ? "text-emerald-600" : "text-gray-500"}`}>
                            {s.label}<div className="text-[10px] font-normal text-gray-400 mt-0.5">{pct0(s.grossIRR)} gross</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "No growth (0%)", g: 0, hl: true },
                        { label: "Moderate (5%)", g: 0.05 },
                        { label: "Strong (10%)", g: 0.10 },
                        { label: "High (15%)", g: 0.15 },
                      ].map((row, ri) => (
                        <tr key={ri} className={`border-b border-gray-50 ${row.hl ? "bg-violet-50/50" : ""}`}>
                          <td className={`py-3 px-5 text-gray-700 ${row.hl ? "font-medium" : ""}`}>{row.label}</td>
                          {scenarios.map((s, ci) => {
                            const em = requiredExitMultiple(s.grossIRR, ebitda, row.g);
                            const exp = em / ebitda.entryMultiple;
                            return (
                              <td key={ci} className={`py-3 px-4 text-right tabular-nums font-medium ${exp > 2 ? "text-red-500" : exp < 0.8 ? "text-emerald-600" : "text-gray-700"}`}>
                                {m(em)}
                                <span className="block text-[10px] font-normal text-gray-400">{exp >= 1 ? "+" : ""}{((exp - 1) * 100).toFixed(0)}% vs entry</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SectionCard>
              </>
            )}

            {/* ═══ SECTION: Fund Gross Return ═════════════════════ */}
            {section === "fund" && (
              <>
                <div className="bg-blue-600 rounded-xl p-5 text-white shadow-lg shadow-blue-200">
                  <div className="flex items-center gap-2 text-blue-200 text-xs uppercase tracking-wider mb-3">
                    <IconFund />Fund Gross Return
                  </div>
                  <p className="text-sm text-blue-100 leading-relaxed">
                    The <strong>gross IRR</strong> is the fund&apos;s return on its investments — driven by portfolio company
                    performance, leverage, and deal timing. This is the return <em>before</em> any fees are
                    charged to the LP. Adjust the scenarios on the left.
                  </p>
                </div>

                <div className="grid grid-cols-5 gap-3">
                  {scenarios.map((s, i) => (
                    <div key={i} className={`rounded-xl p-4 text-center ${i === 2 ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "bg-white border border-gray-200 shadow-sm"}`}>
                      <div className={`text-[10px] uppercase tracking-wider font-medium mb-2 ${i === 2 ? "text-blue-200" : "text-gray-400"}`}>{s.label}</div>
                      <div className={`text-3xl font-bold tabular-nums ${i === 2 ? "text-white" : "text-gray-900"}`}>{pct0(s.grossIRR)}</div>
                      <div className={`text-xs mt-1.5 ${i === 2 ? "text-blue-200" : "text-gray-400"}`}>
                        {m(Math.pow(1 + s.grossIRR, params.investmentYears))} gross MoM
                      </div>
                    </div>
                  ))}
                </div>

                <SectionCard className="p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-1">What happens next?</h2>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    These gross returns are what the fund earns. But as an LP (limited partner), you don&apos;t receive the
                    gross return — multiple layers of fees and taxes sit between the fund&apos;s performance and your net return.
                    Go to <button onClick={() => setSection("investor")} className="text-violet-600 font-medium hover:underline">LP Net Return</button> to
                    see the full fee waterfall, or to <button onClick={() => setSection("companies")} className="text-emerald-600 font-medium hover:underline">Portfolio Companies</button> to
                    see what company-level performance is implied by these IRRs.
                  </p>
                </SectionCard>

                {/* Quick summary table */}
                <SectionCard className="overflow-x-auto">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Quick Comparison: Gross vs Net</h2>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="text-left py-3 px-5 text-gray-400 font-medium text-xs uppercase tracking-wider w-64">&nbsp;</th>
                        {scenarios.map((s, i) => <th key={i} className={`text-right py-3 px-4 text-xs uppercase tracking-wider font-semibold ${i === 2 ? "text-blue-600" : "text-gray-500"}`}>{s.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-50">
                        <td className="py-2.5 px-5 text-gray-600 font-medium">Gross IRR</td>
                        {scenarios.map((s, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-gray-900 font-medium">{pct(s.grossIRR)}</td>)}
                      </tr>
                      <tr className="border-b border-gray-50">
                        <td className="py-2.5 px-5 text-gray-600 font-medium">Net IRR (after tax)</td>
                        {results.map((r, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-violet-700 font-medium">{pct(r.netIRR)}</td>)}
                      </tr>
                      <tr className="bg-orange-50/70">
                        <td className="py-2.5 px-5 text-gray-800 font-medium">Fee & tax drag</td>
                        {results.map((r, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-orange-700 font-semibold">{pct(r.grossIRR - r.netIRR)} ({r.grossIRR > 0 ? pct0((r.grossIRR - r.netIRR) / r.grossIRR) : "–"} of gross)</td>)}
                      </tr>
                      <tr>
                        <td className="py-2.5 px-5 text-gray-600 font-medium">Net Money Multiple</td>
                        {results.map((r, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-gray-700 font-medium">{m(r.moneyMultiple)}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </SectionCard>
              </>
            )}

            {/* ═══ SECTION: LP Net Return ═════════════════════════ */}
            {section === "investor" && (
              <>
                <div className="bg-violet-600 rounded-xl p-5 text-white shadow-lg shadow-violet-200">
                  <div className="flex items-center gap-2 text-violet-200 text-xs uppercase tracking-wider mb-3">
                    <IconInvestor />LP (Investor) Perspective
                  </div>
                  <p className="text-sm text-violet-100 leading-relaxed">
                    What does the <strong>limited partner</strong> actually receive? Starting from the fund&apos;s gross IRR,
                    each fee layer — fund expenses, management fees, carried interest{params.hasFoF ? ", fund-of-fund fees" : ""}, and
                    corporate tax — reduces the return. The waterfall below shows exactly where your return goes.
                  </p>
                </div>

                {/* Net IRR cards */}
                <div className="grid grid-cols-5 gap-3">
                  {results.map((r, i) => (
                    <div key={i} className={`rounded-xl p-4 text-center ${i === 2 ? "bg-violet-600 text-white shadow-lg shadow-violet-200" : "bg-white border border-gray-200 shadow-sm"}`}>
                      <div className={`text-[10px] uppercase tracking-wider font-medium mb-1 ${i === 2 ? "text-violet-200" : "text-gray-400"}`}>{scenarios[i].label}</div>
                      <div className={`text-xs mb-1.5 ${i === 2 ? "text-violet-300" : "text-gray-400"}`}>{pct0(r.grossIRR)} gross</div>
                      <div className={`text-2xl font-bold tabular-nums ${i === 2 ? "text-white" : "text-gray-900"}`}>{pct1(r.netIRR)}</div>
                      <div className={`text-xs mt-1 ${i === 2 ? "text-violet-200" : "text-gray-400"}`}>{m(r.moneyMultiple)} net MoM</div>
                    </div>
                  ))}
                </div>

                {/* Charts */}
                <SectionCard className="p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-1">IRR Composition</h2>
                  <p className="text-xs text-gray-400 mb-4">Net return (blue) + each fee/tax layer = gross IRR</p>
                  <StackedChart results={results} scenarios={scenarios} hasFoF={params.hasFoF} />
                </SectionCard>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <SectionCard className="p-5">
                    <h2 className="text-sm font-semibold text-gray-900 mb-1">Fee Drag — Base Case</h2>
                    <p className="text-xs text-gray-400 mb-2">Where does the {pct(results[2].grossIRR - results[2].netIRR)} drag go?</p>
                    <FeePie result={results[2]} hasFoF={params.hasFoF} />
                  </SectionCard>
                  <SectionCard className="p-5">
                    <h2 className="text-sm font-semibold text-gray-900 mb-1">Fee Drag — Best Case</h2>
                    <p className="text-xs text-gray-400 mb-2">Where does the {pct(results[0].grossIRR - results[0].netIRR)} drag go?</p>
                    <FeePie result={results[0]} hasFoF={params.hasFoF} />
                  </SectionCard>
                </div>

                {/* Waterfall table */}
                <SectionCard className="overflow-x-auto">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Gross-to-Net IRR Waterfall</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Step-by-step fee cascade from fund gross return to LP net return</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="text-left py-3 px-5 text-gray-400 font-medium text-xs uppercase tracking-wider w-64">Step</th>
                        {scenarios.map((s, i) => <th key={i} className={`text-right py-3 px-4 text-xs uppercase tracking-wider font-semibold ${i === 2 ? "text-violet-600" : "text-gray-500"}`}>{s.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {waterfallRows.map((row, ri) => {
                        const t = row.type;
                        return (
                          <tr key={ri} className={`border-b last:border-0 ${t === "total" ? "bg-violet-50 border-violet-100" : t === "mult" ? "bg-gray-50/80" : t === "cost" ? "border-gray-50" : "border-gray-100"}`}>
                            <td className={`py-2.5 px-5 ${t === "cost" ? "text-gray-400 pl-9 text-xs" : t === "total" ? "text-violet-900 font-bold" : t === "mult" ? "text-gray-600 font-medium" : "text-gray-700 font-medium"}`}>
                              {t === "cost" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-300 mr-2 -translate-y-px" />}
                              {row.label}
                            </td>
                            {results.map((r, ci) => {
                              const v = r[row.key] as number;
                              return (
                                <td key={ci} className={`py-2.5 px-4 text-right tabular-nums ${t === "cost" ? "text-red-500 text-xs" : t === "total" ? "text-violet-900 font-bold" : t === "mult" ? "text-gray-600 font-semibold" : ci === 2 ? "text-gray-900 font-medium" : "text-gray-700"}`}>
                                  {t === "mult" ? m(v) : t === "cost" ? "−" + pct(v) : pct(v)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </SectionCard>

                {/* Fee drag summary */}
                <SectionCard className="overflow-x-auto">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Total Fee & Tax Drag</h2>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="text-left py-3 px-5 text-gray-400 font-medium text-xs uppercase tracking-wider w-64">&nbsp;</th>
                        {scenarios.map((s, i) => <th key={i} className={`text-right py-3 px-4 text-xs uppercase tracking-wider font-semibold ${i === 2 ? "text-violet-600" : "text-gray-500"}`}>{s.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-50">
                        <td className="py-2.5 px-5 text-gray-600">Gross IRR</td>
                        {results.map((r, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-gray-700">{pct(r.grossIRR)}</td>)}
                      </tr>
                      <tr className="border-b border-gray-50">
                        <td className="py-2.5 px-5 text-gray-600">Net IRR (after tax)</td>
                        {results.map((r, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-gray-700">{pct(r.netIRR)}</td>)}
                      </tr>
                      <tr className="border-b border-gray-50 bg-orange-50/70">
                        <td className="py-2.5 px-5 text-gray-800 font-medium">Total drag</td>
                        {results.map((r, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-orange-700 font-semibold">{pct(r.grossIRR - r.netIRR)}</td>)}
                      </tr>
                      <tr className="bg-orange-50/70">
                        <td className="py-2.5 px-5 text-gray-800 font-medium">As % of gross</td>
                        {results.map((r, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-orange-700 font-semibold">{r.grossIRR > 0 ? pct1((r.grossIRR - r.netIRR) / r.grossIRR) : "–"}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </SectionCard>

                <Methodology params={params} />
              </>
            )}
          </main>
        </div>
      </div>

      <footer className="border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4 text-center text-xs text-gray-400">
          PE Returns Calculator &middot; Standard PE fee structure with linear portfolio runoff
        </div>
      </footer>
    </div>
  );
}
