export type LaborTaxResult = {
  taxableIncomeCny: number;
  withheldTaxCny: number;
  netIncomeCny: number;
  rate: number;
  quickDeductionCny: number;
  expenseDeductionCny: number;
};

const money = (value: number) => Number(Math.max(0, value).toFixed(2));

// Resident individual labor-remuneration withholding (STA Announcement No. 61 of 2018).
export const calculateChinaLaborRemunerationTax = (grossIncomeCny: number): LaborTaxResult => {
  const gross = money(Number.isFinite(grossIncomeCny) ? grossIncomeCny : 0);
  const expenseDeductionCny = gross <= 4000 ? Math.min(800, gross) : money(gross * 0.2);
  const taxableIncomeCny = money(gross - expenseDeductionCny);
  const rate = taxableIncomeCny <= 20000 ? 0.2 : taxableIncomeCny <= 50000 ? 0.3 : 0.4;
  const quickDeductionCny = taxableIncomeCny <= 20000 ? 0 : taxableIncomeCny <= 50000 ? 2000 : 7000;
  const withheldTaxCny = money(taxableIncomeCny * rate - quickDeductionCny);
  return {
    taxableIncomeCny,
    withheldTaxCny,
    netIncomeCny: money(gross - withheldTaxCny),
    rate,
    quickDeductionCny,
    expenseDeductionCny,
  };
};

export const calculateMentorPayroll = (grossIncomeCny: number, chinaTaxResident: boolean) => {
  const gross = money(grossIncomeCny);
  if (!chinaTaxResident) {
    return {
      taxableIncomeCny: 0,
      withheldTaxCny: 0,
      netIncomeCny: gross,
      rate: 0,
      quickDeductionCny: 0,
      expenseDeductionCny: 0,
    };
  }
  return calculateChinaLaborRemunerationTax(gross);
};
