import type {Metadata} from 'next';
import './globals.css';
import './terminal.css';
import './kimia.css';
import './trading-terminal.css';
import './arkiv.css';
import './trader-credit.css';
import { ProtocolProvider } from '../lib/protocol';
export const metadata:Metadata={title:'AQRA · Performance-based lending',description:'Prediction-market performance metrics inform bonded loan eligibility; lenders decide whether to fund.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><ProtocolProvider>{children}</ProtocolProvider></body></html>}
