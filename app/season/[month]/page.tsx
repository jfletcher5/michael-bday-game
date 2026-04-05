import { SEASON_CONFIGS } from '../../lib/seasons';
import SeasonClient from './SeasonClient';

// Required for static export — pre-generate a page for each configured season.
export function generateStaticParams() {
  return SEASON_CONFIGS.map((s) => ({ month: s.id }));
}

export default function SeasonPage() {
  return <SeasonClient />;
}
