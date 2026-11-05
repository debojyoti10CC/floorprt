import type {Metadata} from 'next';
import './globals.css';
import './terminal.css';
import './kimia.css';
import { ProtocolProvider } from '../lib/protocol';
export const metadata:Metadata={title:'Floor Protocol · Outcome collateral terminal',description:'Compose compatible outcome claims, inspect exact payout floors, and borrow against onchain collateral. Testnet research terminal.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><ProtocolProvider>{children}</ProtocolProvider></body></html>}
