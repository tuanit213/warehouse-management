import './styles.css';
export const metadata = { title: 'tuanit - Phần mềm quản lý kho', description: 'Landing page phần mềm quản lý kho tuanit' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body>{children}</body></html>;
}
