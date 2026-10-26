// 58 mm thermal receipt for a submitted payment.
//
//   await printReceipt({ items: [{ name, amount }], total, voucher });
//
// `total` is the amount actually collected (items minus any voucher). When
// `voucher` is above zero a VOUCHER line is printed above the total.
//
// Prints through a hidden iframe so only the receipt is sent to the printer
// (not the dashboard). The promise resolves when the print dialog has been
// closed. Browsers cannot tell "printed" from "cancelled", so that is the
// closest signal to "printing finished" that is available.
//
// In the print dialog choose the thermal printer and its 58 mm roll paper
// (the page is 58 mm wide, margins 0, height follows the content).

const SHOP = {
  name: 'Mimochi Beauty and Wellness Center',
  address: 'Sitio Bigayan, Brgy. Calios, Santa Cruz, Laguna',
  contact: 'Contact #.: 0916 718 2939',
  logo: '/images/mimochi.jpg', // public/images/mimochi.jpg
};

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const money = (n) =>
  `₱${Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// "Oct 25, 2026 4:26 PM": the moment the receipt is printed.
const stamp = (d) =>
  `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

export function buildReceiptHtml({ items, total, voucher = 0, printedAt = new Date() }) {
  const logoUrl = `${window.location.origin}${SHOP.logo}`;

  const rows = items
    .map(
      (item) => `
      <div class="row">
        <span class="n">${escapeHtml(item.name)}</span>
        <span class="p">${money(item.amount)}</span>
      </div>`
    )
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    width: 58mm;
    padding: 3mm 3mm 8mm;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    line-height: 1.3;
    color: #000;
  }
  .head { display: flex; align-items: center; gap: 2mm; }
  .head img { width: 13mm; height: 13mm; object-fit: contain; flex-shrink: 0; filter: grayscale(1) brightness(0.55) contrast(12); }  /* pink -> solid black, white stays white (thermal is 1-bit) */
  .head .name { font-size: 11px; font-weight: 700; line-height: 1.2; }
  .info { margin-top: 2mm; font-size: 9px; }
  .sep { border-top: 1px dashed #000; margin: 2.5mm 0; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 2mm; margin-bottom: 1mm; }
  .row .n { flex: 1; min-width: 0; word-break: break-word; }
  .row .p { white-space: nowrap; text-align: right; }
  .total { font-size: 12px; font-weight: 700; margin-bottom: 0; }
  .thanks { margin-top: 4mm; text-align: center; font-size: 11px; font-weight: 700; }
  .again { margin-top: 1mm; text-align: center; font-size: 10px; }
</style>
</head>
<body>
  <div class="head">
    <img src="${escapeHtml(logoUrl)}" alt="">
    <div class="name">${escapeHtml(SHOP.name)}</div>
  </div>
  <div class="info">
    <div>${escapeHtml(SHOP.address)}</div>
    <div>${escapeHtml(SHOP.contact)}</div>
    <div>&nbsp;</div>
    <div>${escapeHtml(stamp(printedAt))}</div>
  </div>
  <div class="sep"></div>
  ${rows}
  <div class="sep"></div>
  ${Number(voucher) > 0 ? `<div class="row"><span class="n">VOUCHER</span><span class="p">-${money(voucher)}</span></div>` : ''}
  <div class="row total"><span class="n">TOTAL</span><span class="p">${money(total)}</span></div>
  <div class="thanks">Thank You!</div>
  <div class="again">Please Come Again</div>
</body>
</html>`;
}

export function printReceipt({ items, total, voucher = 0 }) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = win.document;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener('afterprint', finish);
      setTimeout(() => iframe.remove(), 500);
      resolve();
    };

    const startPrint = () => {
      win.addEventListener('afterprint', finish);
      window.addEventListener('afterprint', finish);
      win.focus();
      win.print();
      // very old browsers without the afterprint event
      if (!('onafterprint' in win)) setTimeout(finish, 1500);
    };

    doc.open();
    doc.write(buildReceiptHtml({ items, total, voucher })); // time stamp = moment of printing
    doc.close();

    // wait for the logo so it is not missing from the printout
    const logo = doc.querySelector('img');
    if (logo && !logo.complete) {
      logo.addEventListener('load', startPrint, { once: true });
      logo.addEventListener('error', startPrint, { once: true });
    } else {
      startPrint();
    }
  });
}
