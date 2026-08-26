import assert from 'node:assert/strict';
import { calculateChinaLaborRemunerationTax, calculateMentorPayroll } from './mentorPayroll';

assert.deepEqual(calculateChinaLaborRemunerationTax(0), {
  taxableIncomeCny: 0, withheldTaxCny: 0, netIncomeCny: 0,
  rate: 0.2, quickDeductionCny: 0, expenseDeductionCny: 0,
});
assert.equal(calculateChinaLaborRemunerationTax(3000).withheldTaxCny, 440);
assert.equal(calculateChinaLaborRemunerationTax(4000).withheldTaxCny, 640);
assert.equal(calculateChinaLaborRemunerationTax(5000).withheldTaxCny, 800);
assert.equal(calculateChinaLaborRemunerationTax(30000).withheldTaxCny, 5200);
assert.equal(calculateChinaLaborRemunerationTax(70000).withheldTaxCny, 15400);
assert.equal(calculateMentorPayroll(5000, false).netIncomeCny, 5000);
assert.equal(calculateMentorPayroll(5000, false).withheldTaxCny, 0);

console.log('mentor payroll tax tests passed');
