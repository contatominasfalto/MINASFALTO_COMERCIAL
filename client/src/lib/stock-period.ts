export function isStockDateWithinPeriod(
  value: Date,
  startDate: Date,
  endDate: Date,
) {
  const periodStart = new Date(startDate);
  periodStart.setHours(0, 0, 0, 0);

  const periodEnd = new Date(endDate);
  periodEnd.setHours(23, 59, 59, 999);

  const timestamp = new Date(value).getTime();
  return timestamp >= periodStart.getTime() && timestamp <= periodEnd.getTime();
}
