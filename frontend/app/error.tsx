'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="login-shell">
      <section className="login-form" role="alert">
        <span className="brand">
          <span className="brand-mark">t</span>
          <strong>tuanit WMS</strong>
        </span>
        <h1>Không tải được ứng dụng</h1>
        <p>{error.message || 'Đã xảy ra lỗi không mong muốn.'}</p>
        <button className="btn cta" type="button" onClick={reset}>
          Thử lại
        </button>
      </section>
    </main>
  );
}
