import { listLaunches, recentTrades } from '../../../lib/upstream';
import { fail } from '../../../lib/respond';

/** A real wallet that traded a busy Bordrless token lately, for "pull a random receipt". */
export async function GET() {
  try {
    const launches = (await listLaunches('volume', 12)).filter((l) => l.priceQuote);
    for (let tries = 0; tries < 3 && launches.length; tries++) {
      const launch = launches[Math.floor(Math.random() * launches.length)]!;
      const traders = [...new Set((await recentTrades(launch.mint)).map((t) => t.trader))];
      if (traders.length) {
        const address = traders[Math.floor(Math.random() * traders.length)]!;
        return Response.json({ address, mint: launch.mint }, { headers: { 'Cache-Control': 'no-store' } });
      }
    }
    return fail('no-trades', 'Nobody has traded lately.');
  } catch (e) {
    console.error('random trader', e);
    return fail('upstream', 'Bordrless did not answer. Try again in a moment.');
  }
}
