// Amounts are stored in cents everywhere, so formatting happens once, here.
export function money(amount, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format((amount || 0) / 100);
}

export function date(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function dateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function interval(value) {
  return value === 'year' ? 'per year' : 'per month';
}

/** Turns SUBSCRIPTION_CREATE into "Subscription create" for table cells. */
export function humanise(value) {
  if (!value) return '-';
  const text = value.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
