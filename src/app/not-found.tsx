import Link from 'next/link';
import { RedSkyMark } from '@/components/ui/redsky-mark';

export default function NotFound() {
  return (
    <main className="auth" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="auth-card" style={{ alignItems: 'center', textAlign: 'center' }}>
        <RedSkyMark size={40} />
        <h1 className="serif" style={{ fontSize: 26 }}>This page isn’t here</h1>
        <p className="muted">The link may be out of date, or the module hasn’t been built yet.</p>
        <Link className="btn btn-p" href="/">
          Back to RedSky
        </Link>
      </div>
    </main>
  );
}
