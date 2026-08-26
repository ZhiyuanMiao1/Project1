"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const mentorPayroll_1 = require("./mentorPayroll");
strict_1.default.deepEqual((0, mentorPayroll_1.calculateChinaLaborRemunerationTax)(0), {
    taxableIncomeCny: 0, withheldTaxCny: 0, netIncomeCny: 0,
    rate: 0.2, quickDeductionCny: 0, expenseDeductionCny: 0,
});
strict_1.default.equal((0, mentorPayroll_1.calculateChinaLaborRemunerationTax)(3000).withheldTaxCny, 440);
strict_1.default.equal((0, mentorPayroll_1.calculateChinaLaborRemunerationTax)(4000).withheldTaxCny, 640);
strict_1.default.equal((0, mentorPayroll_1.calculateChinaLaborRemunerationTax)(5000).withheldTaxCny, 800);
strict_1.default.equal((0, mentorPayroll_1.calculateChinaLaborRemunerationTax)(30000).withheldTaxCny, 5200);
strict_1.default.equal((0, mentorPayroll_1.calculateChinaLaborRemunerationTax)(70000).withheldTaxCny, 15400);
strict_1.default.equal((0, mentorPayroll_1.calculateMentorPayroll)(5000, false).netIncomeCny, 5000);
strict_1.default.equal((0, mentorPayroll_1.calculateMentorPayroll)(5000, false).withheldTaxCny, 0);
console.log('mentor payroll tax tests passed');
