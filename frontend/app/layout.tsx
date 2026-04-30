import './styles.css';
export const metadata = { title: 'WMS Dashboard', description: 'Warehouse Management System' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body>{children}</body></html>;
}
