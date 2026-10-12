import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="num text-6xl font-extrabold text-muted">404</p>
      <h1 className="mt-3 text-2xl font-bold">No receipt for this page</h1>
      <p className="mt-2 text-ink-2">Paste a wallet or a token CA instead.</p>
      <Link href="/#paste" className="btn btn-hi mt-6">
        Paste an address
      </Link>
    </div>
  );
}
