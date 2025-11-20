import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Sidebar } from '@/src/components/Sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Scholar Sentinel - Research Paper Verification Platform',
  description: 'Automated verification and validation of research papers',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <Sidebar />
          <main className="lg:pl-64 min-h-screen">
            <div className="container mx-auto py-8 px-4">
              {children}
            </div>
          </main>
        </Providers>
      </body>
    </html>
  )
}

