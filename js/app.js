
// ============ STATE ============
const state = {
  industry: 'science',
  level: 'mid',
  nzSalary: 70000,
  auSalary: 85000,
  loan: 35000,
  nzRent: 220,
  auRent: 300,
  nzFood: 400,
  auFood: 550,
  nzTransport: 150,
  auTransport: 200,
  nzBills: 200,
  auBills: 250,
  nzEnt: 420,
  auEnt: 620,
  years: 10,
  returnRate: 3,
  salaryGrowth: 2,
  moveCost: 7000,
  fx: 1.223
};

const industryPresets = {
  science:  { junior: { nz: 55000, au: 68000  }, mid: { nz: 70000, au: 85000  }, senior: { nz: 95000,  au: 125000 } },
  tech:     { junior: { nz: 65000, au: 80000  }, mid: { nz: 95000, au: 130000 }, senior: { nz: 140000, au: 180000 } },
  health:   { junior: { nz: 65000, au: 75000  }, mid: { nz: 85000, au: 105000 }, senior: { nz: 110000, au: 135000 } },
  trades:   { junior: { nz: 50000, au: 65000  }, mid: { nz: 80000, au: 110000 }, senior: { nz: 100000, au: 140000 } },
  finance:  { junior: { nz: 60000, au: 75000  }, mid: { nz: 90000, au: 115000 }, senior: { nz: 130000, au: 160000 } }
};

// ============ PROGRESS BAR ============
function renderProgress(step) {
  const el = document.getElementById('stepProgress');
  if (!el) return;
  const steps = ['Profile', 'Income', 'Expenses', 'Verdict'];
  let html = '';
  steps.forEach((name, i) => {
    const n = i + 1;
    const cls = n < step ? 'done' : n === step ? 'active' : '';
    const inner = n < step ? '✓' : String(n);
    html += `<div class="sp-step ${cls}" aria-label="Step ${n}: ${name}${n < step ? ' (complete)' : n === step ? ' (current)' : ''}">
      <div class="sp-dot">${inner}</div>
      <span class="sp-label">${name}</span>
    </div>`;
    if (i < steps.length - 1) {
      html += `<div class="sp-line ${n < step ? 'done' : ''}"></div>`;
    }
  });
  el.innerHTML = html;
}

function setStep(stepNum) {
  document.querySelectorAll('.step-section').forEach(el => el.classList.remove('step-active'));
  const activeStep = document.getElementById('step-' + stepNum);
  if (activeStep) {
    activeStep.classList.add('step-active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  renderProgress(stepNum);
  if (stepNum === 4) updateUI();
}

function applyPreset() {
  const preset = industryPresets[state.industry][state.level];
  state.nzSalary = preset.nz;
  state.auSalary = preset.au;
  document.getElementById('nzSalary').value = preset.nz;
  document.getElementById('auSalary').value = preset.au;
  updateUI();
}

// ============ TOOLTIPS ============
function toggleTip(btn) {
  const wasOpen = btn.classList.contains('open');
  document.querySelectorAll('.tip-btn.open').forEach(b => b.classList.remove('open'));
  if (!wasOpen) btn.classList.add('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.tip-btn')) {
    document.querySelectorAll('.tip-btn.open').forEach(b => b.classList.remove('open'));
  }
});

// ============ TAX FUNCTIONS ============
function nzTax(income) {
  // July 2024 updated brackets
  const brackets = [
    [15600,   0.105],
    [53500,   0.175],
    [78100,   0.30 ],
    [180000,  0.33 ],
    [Infinity, 0.39]
  ];
  let tax = 0, prev = 0;
  for (const [to, rate] of brackets) {
    if (income > to) { tax += (to - prev) * rate; prev = to; }
    else             { tax += (income - prev) * rate; return tax; }
  }
  return tax;
}

function auTax(income) {
  // ATO 2025-26 Stage 3
  const brackets = [
    [18200,    0    ],
    [45000,    0.16 ],
    [135000,   0.30 ],
    [190000,   0.37 ],
    [Infinity, 0.45 ]
  ];
  let tax = 0, prev = 0;
  for (const [to, rate] of brackets) {
    if (income > to) { tax += (to - prev) * rate; prev = to; }
    else             { tax += (income - prev) * rate; return tax; }
  }
  return tax;
}

function nzStudentLoanPayment(income) {
  return Math.max(0, (income - 24128) * 0.12);
}

// IRD minimum annual repayments for overseas borrowers (based on opening balance)
function auStudentLoanMinPayment(balance) {
  if (balance <= 0)     return 0;
  if (balance < 1000)   return balance;
  if (balance <= 15000) return 1000;
  if (balance <= 30000) return 2000;
  if (balance <= 45000) return 3000;
  if (balance <= 60000) return 4000;
  return 5000;
}

// ESCT rate applied to employer KiwiSaver contributions
function nzEsctRate(gross) {
  if (gross <= 16800)  return 0.105;
  if (gross <= 57600)  return 0.175;
  if (gross <= 84000)  return 0.30;
  if (gross <= 122400) return 0.33;
  return 0.39;
}

// ============ LOAN PAYOFF HELPER ============
// Both NZ and AU payoff are modelled with salary growing at salaryGrowthRate % per year.
// AU uses max(nzEquivRepayment, IRD overseas minimum) — never less than legally required.
function calcLoanPayoff(loanBalance, nzSalary, salaryGrowthRate) {
  if (loanBalance <= 0) return { nzYears: 0, auYears: 0 };
  const gr = salaryGrowthRate / 100;

  // NZ: interest-free; repayment grows as salary grows
  let nzBal = loanBalance, nzYears = 0, nzSal = nzSalary;
  while (nzBal > 0 && nzYears < 50) {
    const pay = Math.min(nzBal, nzStudentLoanPayment(nzSal));
    if (pay <= 0) break;
    nzBal -= pay;
    nzYears++;
    nzSal *= (1 + gr);
    if (nzBal <= 0) break;
  }

  // AU: 5.6% interest; pay the higher of the growing NZ-equivalent rate or the IRD minimum
  let auBal = loanBalance, auYears = 0, auNzSal = nzSalary;
  while (auBal > 0 && auYears < 60) {
    const nzRate = nzStudentLoanPayment(auNzSal);
    const auMin  = auStudentLoanMinPayment(auBal);
    const pay    = Math.max(nzRate, auMin);
    const interest = auBal * 0.056;
    auBal = auBal + interest - pay;
    auYears++;
    auNzSal *= (1 + gr);
    if (auBal <= 0) break;
    // Safety: if loan is somehow still growing after 60 years, flag it
    if (auBal > loanBalance * 3) { auYears = 999; break; }
  }

  return { nzYears, auYears };
}

// ============ MAIN CALCULATION ============
function calculate() {
  const fx = state.fx;

  // --- NZ side (all NZD) ---
  const nzGross      = state.nzSalary;
  const nzIncomeTax  = nzTax(nzGross);
  const nzAcc        = Math.min(nzGross * 0.0167, 139892 * 0.0167);
  const nzSLRunRate  = nzStudentLoanPayment(nzGross);
  const nzSLPayment  = Math.min(state.loan, nzSLRunRate);
  const nzKsEmployee = nzGross * 0.03;
  const nzTakehome   = nzGross - nzIncomeTax - nzAcc - nzSLPayment - nzKsEmployee;
  const nzRentAnnual = state.nzRent * 52;
  const nzLivingAnnual = (state.nzFood + state.nzTransport + state.nzBills + state.nzEnt) * 12;
  const nzSavings    = nzTakehome - nzRentAnnual - nzLivingAnnual;

  // KiwiSaver: employer net + govt for display; all three for wealth chart
  const nzKsEmployerGross = nzGross * 0.03;
  const esctRate          = nzEsctRate(nzGross);
  const nzKsEmployerNet   = nzKsEmployerGross * (1 - esctRate);
  const nzKsGovt          = Math.min(521, nzKsEmployee * 0.5);
  const nzRetireDisplay   = nzKsEmployerNet + nzKsGovt;                    // shown on card
  const nzRetireWealth    = nzKsEmployee + nzKsEmployerNet + nzKsGovt;     // used in wealth chart (employee KiwiSaver cancels out correctly)

  // --- AU side (all AUD, converted to NZD for wealth chart) ---
  const auGross      = state.auSalary;
  const auIncomeTax  = auTax(auGross);
  const auMedicare   = auGross * 0.02;

  // AU loan year-1 snapshot: pay the higher of NZ-equivalent rate or IRD overseas minimum
  const auInterestNZD      = state.loan * 0.056;
  const auLoanPostInterest = state.loan + auInterestNZD;
  const auSLPaymentNZD     = Math.min(auLoanPostInterest, Math.max(nzSLRunRate, auStudentLoanMinPayment(state.loan)));
  const auSLPayment        = auSLPaymentNZD / fx;

  const auTakehome   = auGross - auIncomeTax - auMedicare - auSLPayment;
  const auRentAnnual = state.auRent * 52;
  const auLivingAnnual = (state.auFood + state.auTransport + state.auBills + state.auEnt) * 12;
  const auSavings    = auTakehome - auRentAnnual - auLivingAnnual;

  // Super: 12% employer contribution, 15% contributions tax
  const auSuperNet   = auGross * 0.12 * 0.85;

  return {
    nz: {
      gross: nzGross, tax: nzIncomeTax, acc: nzAcc,
      slPayment: nzSLPayment, ks: nzKsEmployee,
      takehome: nzTakehome, rent: nzRentAnnual, living: nzLivingAnnual,
      savings: nzSavings,
      retireDisplay: nzRetireDisplay,   // employer + govt only (for card)
      retireWealth: nzRetireWealth      // all three (for wealth chart)
    },
    au: {
      gross: auGross, tax: auIncomeTax, medicare: auMedicare,
      slPayment: auSLPayment,
      takehome: auTakehome, rent: auRentAnnual, living: auLivingAnnual,
      savings: auSavings,
      retireEmployer: auSuperNet
    },
    fx
  };
}

// ============ FORMATTERS ============
function fmt(n, prefix = '')    { return prefix + Math.round(n).toLocaleString('en-NZ'); }
function fmtNeg(n, prefix = '') { return '−' + prefix + Math.round(n).toLocaleString('en-NZ'); }

// ============ UPDATE DOM ============
function updateUI() {
  const r = calculate();
  const fx = r.fx;

  // Slider value labels
  document.getElementById('nzSalaryDisplay').textContent  = state.nzSalary.toLocaleString();
  document.getElementById('auSalaryDisplay').textContent  = state.auSalary.toLocaleString();
  document.getElementById('loanDisplay').textContent      = state.loan.toLocaleString();
  document.getElementById('nzRentDisplay').textContent    = state.nzRent;
  document.getElementById('auRentDisplay').textContent    = state.auRent;
  document.getElementById('nzFoodDisplay').textContent    = state.nzFood;
  document.getElementById('nzTransportDisplay').textContent = state.nzTransport;
  document.getElementById('nzBillsDisplay').textContent   = state.nzBills;
  document.getElementById('nzEntDisplay').textContent     = state.nzEnt;
  document.getElementById('auFoodDisplay').textContent    = state.auFood;
  document.getElementById('auTransportDisplay').textContent = state.auTransport;
  document.getElementById('auBillsDisplay').textContent   = state.auBills;
  document.getElementById('auEntDisplay').textContent     = state.auEnt;
  document.getElementById('yearsDisplay').textContent        = state.years;
  document.getElementById('returnDisplay').textContent       = state.returnRate.toFixed(1);
  document.getElementById('salaryGrowthDisplay').textContent = state.salaryGrowth.toFixed(1);
  document.getElementById('moveDisplay').textContent         = state.moveCost.toLocaleString();

  // NZ breakdown card
  document.getElementById('nzGross').textContent        = fmt(r.nz.gross, 'NZ$');
  document.getElementById('nzTax').textContent          = fmtNeg(r.nz.tax, 'NZ$');
  document.getElementById('nzAcc').textContent          = fmtNeg(r.nz.acc, 'NZ$');
  document.getElementById('nzLoan').textContent         = fmtNeg(r.nz.slPayment, 'NZ$');
  document.getElementById('nzKs').textContent           = fmtNeg(r.nz.ks, 'NZ$');
  document.getElementById('nzTakehome').textContent     = fmt(r.nz.takehome, 'NZ$');
  document.getElementById('nzRentAnnual').textContent   = fmtNeg(r.nz.rent, 'NZ$');
  document.getElementById('nzLivingAnnual').textContent = fmtNeg(r.nz.living, 'NZ$');
  document.getElementById('nzSavings').textContent      = fmt(r.nz.savings, 'NZ$');
  document.getElementById('nzSuper').textContent        = fmt(r.nz.retireWealth, 'NZ$'); // employee + employer + govt (full KiwiSaver)

  // AU breakdown card
  document.getElementById('auGross').textContent        = fmt(r.au.gross, 'AU$');
  document.getElementById('auTax').textContent          = fmtNeg(r.au.tax, 'AU$');
  document.getElementById('auMedicare').textContent     = fmtNeg(r.au.medicare, 'AU$');
  document.getElementById('auLoan').textContent         = fmtNeg(r.au.slPayment, 'AU$');
  document.getElementById('auTakehome').textContent     = fmt(r.au.takehome, 'AU$');
  document.getElementById('auRentAnnual').textContent   = fmtNeg(r.au.rent, 'AU$');
  document.getElementById('auLivingAnnual').textContent = fmtNeg(r.au.living, 'AU$');
  document.getElementById('auSavings').textContent      = fmt(r.au.savings, 'AU$');
  document.getElementById('auSuper').textContent        = fmt(r.au.retireEmployer, 'AU$');

  // Loan payoff insight (uses salary growth for realistic projection)
  const payoff = calcLoanPayoff(state.loan, state.nzSalary, state.salaryGrowth);
  const loanCard = document.getElementById('loanInsightCard');
  const loanText = document.getElementById('loanInsightText');
  if (state.loan > 0) {
    loanCard.style.display = 'flex';
    const interestPerYear = Math.round(state.loan * 0.056);
    const yr1NzRate       = Math.round(nzStudentLoanPayment(state.nzSalary));
    const yr1AuPay        = Math.round(Math.max(yr1NzRate, auStudentLoanMinPayment(state.loan)));
    const growthNote      = state.salaryGrowth > 0 ? ` (rising with your ${state.salaryGrowth}%/yr salary growth)` : '';
    const auYrText        = payoff.auYears >= 60 ? '60+' : `~${payoff.auYears}`;
    loanText.innerHTML = `Interest-free in NZ — cleared in <strong>~${payoff.nzYears} year${payoff.nzYears !== 1 ? 's' : ''}</strong>${growthNote}. From Australia: 5.6% interest (NZ$${interestPerYear.toLocaleString()}/yr on your opening balance) kicks in immediately. Paying NZ$${yr1AuPay.toLocaleString()}/yr in year one${growthNote}, the loan clears in <strong>${auYrText} years</strong>. That's ${payoff.auYears - payoff.nzYears > 0 ? `${payoff.auYears - payoff.nzYears} years longer than staying in NZ` : 'about the same as staying in NZ'} — the interest cost of living abroad.`;
  } else {
    loanCard.style.display = 'none';
  }

  // Wealth loop — full year-by-year simulation with salary growth
  const ret = state.returnRate / 100;
  const gr  = state.salaryGrowth / 100;
  let nzCum = 0, auCum = -state.moveCost;
  let nzLoanBal = state.loan;
  let auLoanBal = state.loan;

  const wealthData = { years: [], nz: [], au: [] };
  let firstYearNzGain = 0, firstYearAuGain = 0;

  for (let y = 1; y <= state.years; y++) {
    const gf = Math.pow(1 + gr, y - 1); // growth factor (1.0 in year 1)
    const nzSalY = state.nzSalary * gf;
    const auSalY = state.auSalary * gf;

    // --- NZ: fully recalculate from growing salary ---
    const nzRunRateY = nzStudentLoanPayment(nzSalY);
    let nzPayment = 0;
    if (nzLoanBal > 0) {
      nzPayment = Math.min(nzLoanBal, nzRunRateY);
      nzLoanBal -= nzPayment;
      if (nzLoanBal < 0) nzLoanBal = 0;
    }
    const nzTaxY        = nzTax(nzSalY);
    const nzAccY        = Math.min(nzSalY * 0.0167, 139892 * 0.0167);
    const nzKsEmpY      = nzSalY * 0.03;
    const nzNetY        = nzSalY - nzTaxY - nzAccY - nzKsEmpY; // pre-loan deduction
    const nzSavingsY    = nzNetY - nzPayment - r.nz.rent - r.nz.living; // living costs fixed in real terms
    const nzKsErGrossY  = nzSalY * 0.03;
    const nzKsErNetY    = nzKsErGrossY * (1 - nzEsctRate(nzSalY));
    const nzKsGovtY     = Math.min(521, nzKsEmpY * 0.5);
    const nzYearGain    = nzSavingsY + nzKsEmpY + nzKsErNetY + nzKsGovtY; // total wealth inc. KiwiSaver

    // --- AU: fully recalculate from growing salary ---
    let auPaymentNZD = 0;
    if (auLoanBal > 0) {
      const nzRateForAuY = nzStudentLoanPayment(nzSalY);
      const auMinY       = auStudentLoanMinPayment(auLoanBal);
      const targetY      = Math.max(nzRateForAuY, auMinY);
      const interestNZD  = auLoanBal * 0.056;
      auLoanBal += interestNZD;
      auPaymentNZD = Math.min(auLoanBal, targetY);
      auLoanBal   -= auPaymentNZD;
      if (auLoanBal < 0) auLoanBal = 0;
    }
    const auTaxY     = auTax(auSalY);
    const auMedY     = auSalY * 0.02;
    const auNetY     = auSalY - auTaxY - auMedY;
    const auSavingsY = auNetY - (auPaymentNZD / fx) - r.au.rent - r.au.living;
    const auSuperY   = auSalY * 0.12 * 0.85;
    const auYearGain = auSavingsY + auSuperY; // AUD

    if (y === 1) {
      firstYearNzGain = nzYearGain;
      firstYearAuGain = auYearGain * fx;
    }

    nzCum = nzCum * (1 + ret) + nzYearGain;
    auCum = auCum * (1 + ret) + (auYearGain * fx);

    wealthData.years.push(y);
    wealthData.nz.push(Math.round(nzCum));
    wealthData.au.push(Math.round(auCum));
  }

  const annualDelta  = firstYearAuGain - firstYearNzGain;
  const yearOneDelta = annualDelta - state.moveCost;
  const finalDelta   = wealthData.au[wealthData.au.length - 1] - wealthData.nz[wealthData.nz.length - 1];

  // Quick stats
  document.getElementById('qsYearsLabel').textContent = state.years;
  const qsYear1El   = document.getElementById('qsYear1');
  const qsTotalEl   = document.getElementById('qsTotal');
  qsYear1El.textContent  = 'NZ$' + Math.abs(Math.round(yearOneDelta)).toLocaleString();
  qsTotalEl.textContent  = 'NZ$' + Math.abs(Math.round(finalDelta)).toLocaleString();
  qsYear1El.className  = 'qs-value ' + (yearOneDelta > 0 ? 'au-positive' : 'nz-positive');
  qsTotalEl.className  = 'qs-value ' + (finalDelta   > 0 ? 'au-positive' : 'nz-positive');

  const nzLoanYrEl = document.getElementById('qsNzLoanYr');
  const auLoanYrEl = document.getElementById('qsAuLoanYr');
  const qsNzLoanEl = document.getElementById('qsNzLoan');
  if (state.loan > 0) {
    nzLoanYrEl.textContent = payoff.nzYears <= 40 ? payoff.nzYears : '40+';
    auLoanYrEl.textContent = payoff.auYears <= 100 ? payoff.auYears : '∞';
    qsNzLoanEl.textContent = 'Yr ' + (payoff.nzYears <= 40 ? payoff.nzYears : '40+') + ' vs Yr ' + (payoff.auYears < 100 ? payoff.auYears : '∞');
  } else {
    qsNzLoanEl.textContent = 'No loan';
    nzLoanYrEl.textContent = '—';
    auLoanYrEl.textContent = '—';
  }

  const qsSuperEl = document.getElementById('qsSuper');
  qsSuperEl.textContent = 'NZ$' + Math.round(r.au.retireEmployer * fx).toLocaleString();
  qsSuperEl.className = 'qs-value au-positive';

  // Verdict headline
  const verdictEl = document.getElementById('verdict');
  const headline  = document.getElementById('verdictHeadline');
  const detail    = document.getElementById('verdictDetail');
  if (annualDelta > 0) {
    verdictEl.classList.remove('nz-wins');
    headline.innerHTML = `Australia is <span class="number">NZ$${Math.round(annualDelta).toLocaleString()}</span> better per year`;
    detail.innerHTML = `Over <strong>${state.years} years</strong> at <strong>${state.returnRate.toFixed(1)}%</strong> real return, Brisbane puts roughly <strong>NZ$${Math.round(finalDelta).toLocaleString()}</strong> more in your pocket than staying in Christchurch. Year one comes in at <strong>NZ$${Math.round(yearOneDelta).toLocaleString()}</strong> ahead after the cost of the move.`;
  } else {
    verdictEl.classList.add('nz-wins');
    headline.innerHTML = `New Zealand wins by <span class="number">NZ$${Math.round(-annualDelta).toLocaleString()}</span> per year`;
    detail.innerHTML = `With these inputs, staying in NZ is the better financial call. Over ${state.years} years that compounds to NZ$${Math.round(-finalDelta).toLocaleString()} ahead. Worth double-checking your salary assumptions if you expected the opposite result.`;
  }
  headline.classList.remove('pulse');
  void headline.offsetWidth;
  headline.classList.add('pulse');

  updateCharts(r, wealthData);
}

// ============ CHARTS ============
let wealthChart, breakdownChart;
const chartFont      = { family: 'Manrope', size: 13, weight: '500' };
const chartFontTitle = { family: 'Fraunces', size: 14, weight: '600', style: 'italic' };

function initCharts() {
  Chart.defaults.font.family = 'Manrope';
  Chart.defaults.color = '#4a5670';

  const ctx1 = document.getElementById('wealthChart').getContext('2d');
  const nzGradient = ctx1.createLinearGradient(0, 0, 0, 400);
  nzGradient.addColorStop(0, 'rgba(91, 140, 90, 0.3)');
  nzGradient.addColorStop(1, 'rgba(91, 140, 90, 0)');
  const auGradient = ctx1.createLinearGradient(0, 0, 0, 400);
  auGradient.addColorStop(0, 'rgba(210, 105, 30, 0.3)');
  auGradient.addColorStop(1, 'rgba(210, 105, 30, 0)');

  wealthChart = new Chart(ctx1, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Stayed in NZ', data: [], borderColor: '#5b8c5a', backgroundColor: nzGradient, borderWidth: 3, fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 6, pointBackgroundColor: '#5b8c5a', pointBorderColor: '#fff', pointBorderWidth: 2 },
        { label: 'Moved to AU', data: [], borderColor: '#d2691e', backgroundColor: auGradient, borderWidth: 3, fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 6, pointBackgroundColor: '#d2691e', pointBorderColor: '#fff', pointBorderWidth: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { usePointStyle: true, padding: 20, font: chartFont } },
        tooltip: {
          backgroundColor: '#1a2841',
          titleFont: { family: 'Fraunces', size: 14, weight: '600', style: 'italic' },
          bodyFont: { family: 'Manrope', size: 13 },
          padding: 12, cornerRadius: 8, displayColors: true,
          callbacks: {
            title: items => `Year ${items[0].label}`,
            label: item => `${item.dataset.label}: NZ$${item.parsed.y.toLocaleString()}`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, title: { display: true, text: 'Years from now', font: chartFontTitle, color: '#1a2841' }, ticks: { font: chartFont } },
        y: { grid: { color: 'rgba(26, 40, 65, 0.06)' }, title: { display: true, text: 'Cumulative wealth (NZ$)', font: chartFontTitle, color: '#1a2841' }, ticks: { font: chartFont, callback: v => 'NZ$' + (v / 1000).toFixed(0) + 'k' } }
      }
    }
  });

  const ctx2 = document.getElementById('breakdownChart').getContext('2d');
  breakdownChart = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: ['Gross salary', 'Income tax', 'Levy', 'Student loan', 'Rent', 'Living', 'Retirement (employer)', 'Net to you'],
      datasets: [
        { label: 'Christchurch', data: [], backgroundColor: '#5b8c5a', borderRadius: 6, maxBarThickness: 30 },
        { label: 'Brisbane (in NZD)', data: [], backgroundColor: '#d2691e', borderRadius: 6, maxBarThickness: 30 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', align: 'end', labels: { usePointStyle: true, padding: 20, font: chartFont } },
        tooltip: {
          backgroundColor: '#1a2841',
          titleFont: { family: 'Fraunces', size: 14, weight: '600' },
          bodyFont: { family: 'Manrope', size: 13 },
          padding: 12, cornerRadius: 8,
          callbacks: { label: item => `${item.dataset.label}: NZ$${Math.abs(item.parsed.y).toLocaleString()}` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: chartFont } },
        y: { grid: { color: 'rgba(26, 40, 65, 0.06)' }, title: { display: true, text: 'Annual amount (NZ$)', font: chartFontTitle, color: '#1a2841' }, ticks: { font: chartFont, callback: v => 'NZ$' + (v / 1000).toFixed(0) + 'k' } }
      }
    }
  });
}

function updateCharts(r, wealthData) {
  if (!wealthChart) return;
  const fx = r.fx;

  wealthChart.data.labels = wealthData.years;
  wealthChart.data.datasets[0].data = wealthData.nz;
  wealthChart.data.datasets[1].data = wealthData.au;
  wealthChart.update('none');

  breakdownChart.data.datasets[0].data = [r.nz.gross, r.nz.tax, r.nz.acc, r.nz.slPayment, r.nz.rent, r.nz.living, r.nz.retireWealth, r.nz.savings];
  breakdownChart.data.datasets[1].data = [r.au.gross * fx, r.au.tax * fx, r.au.medicare * fx, r.au.slPayment * fx, r.au.rent * fx, r.au.living * fx, r.au.retireEmployer * fx, r.au.savings * fx];
  breakdownChart.update('none');
}

// ============ SHARE ============
function shareToLinkedIn() {
  const url = encodeURIComponent(window.location.href);
  window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + url, '_blank');
}
function copyLink() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    const btn = document.getElementById('copyBtn');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 2000);
  }).catch(() => {
    prompt('Copy this link:', window.location.href);
  });
}

// ============ EVENT LISTENERS ============
function bindInputs() {
  const inputs = {
    'nzSalary':    v => state.nzSalary    = +v,
    'auSalary':    v => state.auSalary    = +v,
    'loan':        v => state.loan        = +v,
    'nzRent':      v => state.nzRent      = +v,
    'auRent':      v => state.auRent      = +v,
    'nzFood':      v => state.nzFood      = +v,
    'auFood':      v => state.auFood      = +v,
    'nzTransport': v => state.nzTransport = +v,
    'auTransport': v => state.auTransport = +v,
    'nzBills':     v => state.nzBills     = +v,
    'auBills':     v => state.auBills     = +v,
    'nzEnt':       v => state.nzEnt       = +v,
    'auEnt':       v => state.auEnt       = +v,
    'years':        v => state.years        = +v,
    'returnRate':   v => state.returnRate  = +v,
    'salaryGrowth': v => state.salaryGrowth = +v,
    'moveCost':     v => state.moveCost    = +v
  };
  Object.entries(inputs).forEach(([id, setter]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', e => { setter(e.target.value); updateUI(); });
  });

  document.querySelectorAll('#industrySelector .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#industrySelector .option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.industry = btn.dataset.ind;
      applyPreset();
    });
  });

  document.querySelectorAll('#levelSelector .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#levelSelector .option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.level = btn.dataset.lvl;
      applyPreset();
    });
  });
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  renderProgress(1);
  initCharts();
  bindInputs();
  updateUI();
});
