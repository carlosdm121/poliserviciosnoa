import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Mi cuenta',
  robots: { index: false, follow: false },
}

export default function PaginaCuenta(): never {
  redirect('/panel/cuenta/datos')
}
