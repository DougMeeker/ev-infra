// Shared status shading utilities

export function getStatusShade(ratio) {
  if (ratio === null || ratio === undefined) return { bg: '#f1f5f9', border: '#cbd5e1' };
  const r = Math.max(0, Math.min(1, Number(ratio)));
  const stops = [
    { r: 0, bg: '#bfdbfe', border: '#60a5fa' },
    { r: 0.5, bg: '#93c5fd', border: '#3b82f6' },
    { r: 1, bg: '#60a5fa', border: '#2563eb' },
  ];
  const a = stops.reduce((prev, cur) => (cur.r <= r ? cur : prev));
  const b = stops.find(s => s.r >= r) || stops[stops.length - 1];
  const pick = (hexA, hexB) => (r - a.r) < (b.r - r) ? hexA : hexB;
  return { bg: pick(a.bg, b.bg), border: pick(a.border, b.border) };
}

export function ratioFrom(currentStep, stepsCount) {
  if (currentStep == null || stepsCount == null || stepsCount === 0) return null;
  return Math.max(0, Math.min(1, Number(currentStep) / Number(stepsCount)));
}
