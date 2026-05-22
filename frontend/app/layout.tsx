import { Inter } from 'next/font/google';
import './styles.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], display: 'swap' });

export const metadata = { title: 'tuanit - Phần mềm quản lý kho', description: 'Phần mềm quản lý kho tuanit' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body className={inter.className}>{children}</body></html>;
}
