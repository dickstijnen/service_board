import type { Metadata } from 'next'
import { mori, fraktionMono, publicSans, lineSeed } from '@/fonts/fonts'
import { LenisProvider } from '@/components/providers/LenisProvider'
import { ScrollAnimationsProvider } from '@/components/providers/ScrollAnimationsProvider'
import { Toaster } from '@/components/ui/sonner'
import 'leaflet/dist/leaflet.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'PaterBak',
  description: 'Container- en afvalbeheer platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <body
        className={`${lineSeed.variable} ${mori.variable} ${fraktionMono.variable} ${publicSans.variable} antialiased`}
      >
        <LenisProvider>
          <ScrollAnimationsProvider>
            {children}
            <Toaster />
          </ScrollAnimationsProvider>
        </LenisProvider>
      </body>
    </html>
  )
}
