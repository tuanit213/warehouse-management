import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="login-shell">
      <section className="login-form">
        <span className="brand">
          <span className="brand-mark">t</span>
          <strong>tuanit WMS</strong>
        </span>
        <h1>Không tìm thấy trang</h1>
        <p>Đường dẫn này không tồn tại trong hệ thống quản lý kho.</p>
        <Link className="btn cta" href="/">
          Về trang chính
        </Link>
      </section>
    </main>
  );
}
