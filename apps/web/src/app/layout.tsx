import type {Metadata} from 'next';
import './globals.css';
import './terminal.css';
import './kimia.css';
import './aqra.css';
import { ProtocolProvider } from '../lib/protocol';
export const metadata:Metadata={title:'AQRA · Structured outcome terminal',description:'Compose compatible outcome portfolios, inspect contractual settlement floors, and borrow against eligible onchain collateral. Testnet terminal.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><ProtocolProvider>{children}</ProtocolProvider></body></html>}
