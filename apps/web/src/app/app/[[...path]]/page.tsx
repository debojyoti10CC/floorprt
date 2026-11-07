import { notFound } from 'next/navigation';
import { Terminal } from '../../../components/terminal';

const views: Record<string, string> = {
  risk: 'risk',
  borrow: 'borrow',
  lend: 'lend',
  // Preserve existing deep links while routing them to the current credit workflow.
  markets: 'data',
  portfolio: 'borrow',
  compose: 'borrow',
  proofs: 'risk',
  credit: 'borrow',
  settlements: 'lend',
  ops: 'risk',
  docs: 'risk',
};

// The site is exported as static files, so every route needs a build-time page.
// Numeric market IDs in the recorded demo are available as static detail routes.
const marketIds = Array.from({ length: 10 }, (_, index) => String(index + 1));

export function generateStaticParams() {
  return [
    { path: [] },
    ...Object.keys(views).map((view) => ({ path: [view] })),
    ...marketIds.map((id) => ({ path: ['markets', id] })),
  ];
}

export default async function AppPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;

  if (path.length === 0) return <Terminal initialPage="data" />;

  if (path.length === 1 && views[path[0]]) {
    return <Terminal initialPage={views[path[0]]} />;
  }

  if (path.length === 2 && path[0] === 'markets' && marketIds.includes(path[1])) {
    return <Terminal initialPage="data" />;
  }

  notFound();
}
