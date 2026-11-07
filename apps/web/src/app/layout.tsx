import type {Metadata} from 'next';
import './globals.css';
import './terminal.css';
import './kimia.css';
import './trading-terminal.css';
import './arkiv.css';
import './trader-credit.css';
import './terminal-skin.css';
import './landing.css';
import { ProtocolProvider } from '../lib/protocol';
import { brand } from '../lib/brand';
export const metadata:Metadata={
  title: brand.title,
  applicationName: brand.name,
  description: brand.description,
  icons: {
    icon: [
      { url: '/brand/arqo-favicon.png', media: '(prefers-color-scheme: light)', type: 'image/png', sizes: '128x128' },
      { url: '/brand/arqo-favicon-light.png', media: '(prefers-color-scheme: dark)', type: 'image/png', sizes: '128x128' },
    ],
    apple: '/brand/arqo-favicon.png',
  },
  manifest: '/manifest.webmanifest',
  openGraph: { title: brand.title, description: brand.description, siteName: brand.name, type: 'website' },
  twitter: { card: 'summary', title: brand.title, description: brand.description },
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><ProtocolProvider>{children}</ProtocolProvider></body></html>}
