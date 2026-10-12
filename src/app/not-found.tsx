import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="num text-5xl font-semibold text-faint">404</p>
      <h1 className="mt-3 text-xl font-semibold">No receipt for this page</h1>
      <p className="mt-2 text-muted">Paste a wallet or a token CA instead.</p>
      <Link href="/#paste" className="btn btn-primary mt-6">
        Paste an address
      </Link>
    </div>
  );
}
