import Link from 'next/link';
import { Wordmark } from '../components/AppBar';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <header className="flex h-16 items-center">
        <Wordmark />
      </header>
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="mono text-[64px] font-bold leading-none tracking-tight text-faint">404</p>
        <h1 className="mt-4 text-[22px] font-bold tracking-tight">No receipt for this page</h1>
        <p className="mt-2 text-muted">Paste a wallet or a token CA instead.</p>
        <Link href="/#paste" className="btn btn-primary mt-6 h-11">
          Paste an address
        </Link>
      </div>
    </div>
  );
}
