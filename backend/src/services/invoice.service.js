const PDFDocument = require('pdfkit');

const formatMoney = (amount, currency = 'usd') =>
  `${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`;

const formatDate = (date) =>
  date ? new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

/**
 * Streams a one-page PDF invoice straight to the response. Nothing is written
 * to disk, and no card data appears on it - only the brand and last four
 * digits that Stripe reports.
 */
function streamInvoice({ payment, organization, res }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.fontSize(20).fillColor('#111827').text('Octopi Digital', { continued: false });
  doc.fontSize(10).fillColor('#6b7280').text('SaaS subscription platform');

  doc.moveDown(1.5);
  doc.fontSize(16).fillColor('#111827').text('Invoice');
  doc.fontSize(10).fillColor('#374151');
  doc.moveDown(0.5);
  doc.text(`Invoice number: ${payment.invoiceNumber || '-'}`);
  doc.text(`Payment date:   ${formatDate(payment.paidAt || payment.createdAt)}`);
  doc.text(`Status:         ${payment.status}`);

  doc.moveDown(1);
  doc.fontSize(11).fillColor('#111827').text('Billed to');
  doc.fontSize(10).fillColor('#374151');
  doc.text(organization.name);
  doc.text(organization.billingEmail);

  doc.moveDown(1.5);
  const top = doc.y;
  doc.fontSize(10).fillColor('#6b7280');
  doc.text('Description', 50, top);
  doc.text('Billing period', 250, top);
  doc.text('Amount', 0, top, { align: 'right' });

  doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).strokeColor('#e5e7eb').stroke();
  doc.moveDown(0.8);

  const row = doc.y;
  doc.fillColor('#111827');
  doc.text(payment.planName || payment.description || 'Subscription', 50, row, { width: 190 });
  doc.text(`${formatDate(payment.periodStart)} - ${formatDate(payment.periodEnd)}`, 250, row, {
    width: 180,
  });
  doc.text(formatMoney(payment.amount, payment.currency), 0, row, { align: 'right' });

  doc.moveDown(2);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
  doc.moveDown(0.6);
  doc
    .fontSize(12)
    .fillColor('#111827')
    .text(`Total paid: ${formatMoney(payment.amount, payment.currency)}`, { align: 'right' });

  if (payment.cardLast4) {
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#6b7280').text(`Paid with ${payment.cardBrand} ending ${payment.cardLast4}`, {
      align: 'right',
    });
  }

  doc.moveDown(3);
  doc
    .fontSize(9)
    .fillColor('#6b7280')
    .text('This invoice was generated automatically. Card details are handled by Stripe and are never stored on our servers.', {
      align: 'center',
    });

  doc.end();
}

module.exports = { streamInvoice };
