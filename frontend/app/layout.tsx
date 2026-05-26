import { Inter } from 'next/font/google';
import Script from 'next/script';
import './styles.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], display: 'swap' });

export const metadata = { title: 'tuanit - Phần mềm quản lý kho', description: 'Phần mềm quản lý kho tuanit' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={inter.className}>
        <Script id="wms-runtime-config" src="/api/runtime-config" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
