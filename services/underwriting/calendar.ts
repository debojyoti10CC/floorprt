export const DAY = 86_400;

export function monthStart(month: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Expected a UTC month in YYYY-MM format.');
  return Date.parse(month + '-01T00:00:00Z') / 1000;
}

export function offsetMonth(month: string, offset: number): string {
  const date = new Date(monthStart(month) * 1000);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function monthOf(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 7);
}

export function monthsBetween(first: string, last: string): string[] {
  const count = (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12
    + Number(last.slice(5)) - Number(first.slice(5)) + 1;
  monthStart(first);
  if (count < 2 || count > 18 || monthStart(offsetMonth(last, 1)) > Date.now() / 1000) {
    throw new Error('Choose between 2 and 18 completed UTC months.');
  }
  return Array.from({ length: count }, (_, index) => offsetMonth(first, index));
}
