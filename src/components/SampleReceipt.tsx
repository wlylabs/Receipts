/**
 * What a finished receipt looks like, drawn for the home page. The numbers are made up and the
 * paper says so; it shows the shape of the result, not anyone's trades.
 */
export function SampleReceipt() {
  const lines: [string, string, string][] = [
    ['BUY', '2.10M', '$420.00'],
    ['BUY', '0.90M', '$310.00'],
    ['SELL', '1.50M', '$2,180.40'],
    ['SELL', '1.50M', '$2,760.15'],
  ];
  return (
    <figure className="receipt-shadow mx-auto w-full max-w-[340px] rotate-[1.5deg]" aria-label="An example receipt">
      <div className="receipt px-6 pt-6 text-[12px]">
        <div className="text-center">
          <p className="text-[15px] font-bold tracking-[0.2em]">RECEIPTS</p>
          <p className="mt-0.5 text-[10.5px] text-muted">SAMPLE · NOT A REAL WALLET</p>
        </div>
        <hr className="rule my-4" />
        <Row k="WALLET" v="7xKp…3fQa" />
        <Row k="TOKEN" v="$DEMO · Solana" />
        <hr className="rule my-4" />
        {lines.map(([side, amt, val], i) => (
          <div key={i} className="flex justify-between py-0.5">
            <span className={side === 'BUY' ? 'text-pos' : 'text-neg'}>{side.padEnd(4, ' ')}</span>
            <span className="text-muted">{amt}</span>
            <span>{val}</span>
          </div>
        ))}
        <hr className="rule my-4" />
        <Row k="FEES" v="-$0.43" />
        <Row k="ROI" v="+576%" />
        <div className="mt-2 flex items-baseline justify-between">
          <span className="font-bold">TOTAL P&amp;L</span>
          <span className="text-[22px] font-bold text-pos">+$4,210.12</span>
        </div>
        <div className="relative mt-5 flex items-center justify-between">
          <span className="text-[10.5px] text-muted">RANK</span>
          <span className="stamp text-[18px] text-pos">CHAD</span>
        </div>
        <hr className="rule my-4" />
        {/* a barcode, drawn in bars of a few widths */}
        <div className="flex h-10 items-stretch justify-center gap-[2px]" aria-hidden>
          {[3, 1, 2, 1, 1, 3, 2, 1, 3, 1, 1, 2, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2].map((w, i) => (
            <span key={i} className="bg-ink" style={{ width: w }} />
          ))}
        </div>
        <p className="mt-2 text-center text-[10px] text-muted">THANK YOU FOR YOUR SERVICE</p>
      </div>
    </figure>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted">{k}</span>
      <span>{v}</span>
    </div>
  );
}
