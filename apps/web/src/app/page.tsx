import type { Metadata } from 'next';
import { Landing } from '../components/landing';

export const metadata: Metadata = {
  title: 'AQRA · A track record. A clearer credit conversation.',
  description: 'Explore prediction-market wallet evidence, transparent risk assumptions and wallet-signed bonded test loans. An unaudited local/testnet prototype.',
};

export default function Page() {
  return <Landing />;
}
