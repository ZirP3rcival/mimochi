import { useEffect, useRef, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { buildReceiptHtml } from './receipt';

// On-screen preview of the 58 mm receipt: the exact HTML that gets printed,
// shown at paper width (58 mm) on a gray "table". Print from here.
export default function ReceiptPreview({ items, total, voucher = 0, color, printing, onPrint, onBack }) {
  const frameRef = useRef(null);
  const [height, setHeight] = useState(420);
  // built once, so the preview doesn't reload (and its time doesn't jump) on re-render;
  // the printed copy is stamped with the real time of printing
  const [html] = useState(() => buildReceiptHtml({ items, total, voucher }));

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !printing && onBack();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack, printing]);

  // size the frame to the receipt's real height (it is continuous roll paper)
  function fit() {
    const doc = frameRef.current?.contentDocument;
    if (doc?.documentElement) setHeight(doc.documentElement.scrollHeight);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => !printing && onBack()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Receipt preview"
        className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: `${color}33` }}>
          <p className="text-sm font-semibold" style={{ color }}>Receipt preview · 58 mm</p>
          <button type="button" onClick={onBack} disabled={printing} aria-label="Back" className="rounded p-1 hover:bg-white/60 disabled:opacity-40">
            <X className="h-4 w-4" style={{ color }} />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-neutral-200 p-4 custom-scrollbar">
          <iframe
            ref={frameRef}
            title="Receipt preview"
            srcDoc={html}
            onLoad={fit}
            scrolling="no"
            className="mx-auto block bg-white shadow-md"
            style={{ width: '58mm', height, border: 0 }}
          />
        </div>

        <div className="flex justify-end gap-2 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            disabled={printing}
            className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onPrint}
            disabled={printing}
            className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: color }}
          >
            <Printer className="h-4 w-4" />
            {printing ? 'Printing…' : 'Print'}
          </button>
        </div>
      </div>
    </div>
  );
}
