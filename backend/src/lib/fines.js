const prisma = require('./prisma');

const DEFAULT_FINE_RATE_PER_DAY = 0.5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function startOfLocalDay(value = new Date()) {
  const date = toDate(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toLocalDayValue(value) {
  const date = toDate(value);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function roundCurrency(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

async function getFineRatePerDay() {
  const config = await prisma.config.findUnique({
    where: { key: 'FINE_RATE_PER_DAY' },
  });

  const parsedRate = Number.parseFloat(config?.value ?? '');

  if (!Number.isFinite(parsedRate) || parsedRate < 0) {
    return DEFAULT_FINE_RATE_PER_DAY;
  }

  return roundCurrency(parsedRate);
}

function calculateOverdueSummary(dueDate, referenceDate, fineRatePerDay = DEFAULT_FINE_RATE_PER_DAY) {
  const dueDayValue = toLocalDayValue(dueDate);
  const referenceDayValue = toLocalDayValue(referenceDate);
  const overdueDays = Math.max(0, Math.floor((referenceDayValue - dueDayValue) / MS_PER_DAY));
  const estimatedFineAmount = roundCurrency(overdueDays * fineRatePerDay);

  return {
    isOverdue: overdueDays > 0,
    overdueDays,
    estimatedFineAmount,
  };
}

function decorateLoanWithFine(loan, fineRatePerDay, referenceDate = new Date()) {
  const effectiveReferenceDate = loan.returnDate ? loan.returnDate : referenceDate;
  const overdueSummary = calculateOverdueSummary(
    loan.dueDate,
    effectiveReferenceDate,
    fineRatePerDay
  );
  const storedFineAmount = Number(loan.fineAmount ?? 0);
  const fineForgiven = Boolean(loan.fineForgiven);
  const estimatedFineAmount = loan.returnDate
    ? roundCurrency(Number.isFinite(storedFineAmount) ? storedFineAmount : 0)
    : overdueSummary.estimatedFineAmount;

  return {
    ...loan,
    fineForgiven,
    isOverdue: loan.returnDate
      ? overdueSummary.overdueDays > 0 || fineForgiven || estimatedFineAmount > 0
      : overdueSummary.isOverdue,
    overdueDays: overdueSummary.overdueDays,
    estimatedFineAmount,
  };
}

function buildReturnSummary(loan, returnDate, fineRatePerDay, options = {}) {
  const { waiveFine = false } = options;
  const overdueSummary = calculateOverdueSummary(loan.dueDate, returnDate, fineRatePerDay);
  const originalFineAmount = overdueSummary.estimatedFineAmount;
  const fineForgiven = Boolean(waiveFine) && originalFineAmount > 0;
  const fineAmount = fineForgiven ? 0 : originalFineAmount;

  return {
    id: loan.id,
    bookTitle: loan.copy?.book?.title || '未知图书',
    userName: loan.user?.name || '未知用户',
    checkoutDate: loan.checkoutDate,
    dueDate: loan.dueDate,
    returnDate,
    isOverdue: overdueSummary.isOverdue,
    overdueDays: overdueSummary.overdueDays,
    fineAmount,
    fineForgiven,
    originalFineAmount,
    waiveFineApplied: fineForgiven,
  };
}

module.exports = {
  DEFAULT_FINE_RATE_PER_DAY,
  roundCurrency,
  startOfLocalDay,
  getFineRatePerDay,
  calculateOverdueSummary,
  decorateLoanWithFine,
  buildReturnSummary,
};
