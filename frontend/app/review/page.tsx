import Link from 'next/link';
import { listReviewFixtures } from '@/lib/review-fixtures';

export default function ReviewPage() {
  const fixtures = listReviewFixtures();

  return (
    <main className="min-h-screen bg-black px-8 py-16 text-white">
      <div className="mx-auto max-w-4xl">
        <p className="mb-3 text-[11px] font-mono uppercase tracking-[0.24em] text-[#D4AF37]/70">
          Review Workspace
        </p>
        <h1 className="mb-4 font-serif text-5xl tracking-tight">
          Visual Review Fixtures
        </h1>
        <p className="mb-10 max-w-2xl text-sm leading-7 text-neutral-400">
          These routes load deterministic mock graph data so the team can review layout, detail panels,
          expand behavior, and tab flows without waiting for live APIs.
        </p>

        <div className="space-y-4">
          {fixtures.map((fixture) => (
            <div
              key={fixture.id}
              className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6"
            >
              <div className="mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-[#D4AF37]/60">
                {fixture.id}
              </div>
              <h2 className="mb-2 text-2xl font-semibold text-white">{fixture.label}</h2>
              <p className="mb-4 max-w-2xl text-sm leading-6 text-neutral-400">
                {fixture.description}
              </p>
              <Link
                href={`/explore/seed?fixture=${fixture.id}`}
                className="inline-flex rounded-lg border border-[rgba(212,175,55,0.24)] px-4 py-2 text-[11px] font-mono uppercase tracking-[0.16em] text-[#D4AF37] hover:bg-[#D4AF37]/10"
              >
                Open Review Fixture
              </Link>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
