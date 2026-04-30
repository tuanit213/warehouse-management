const reasons = [
  {
    icon: '▣',
    title: 'Quản lý tồn kho thủ công',
    text: 'Kiểm tra hàng tồn bằng cách thủ công khiến bạn mất thời gian, hàng hoá bị thiếu hụt, dư thừa và khó kiểm soát.',
  },
  {
    icon: '↗',
    title: 'Nhập, bán hàng không chính xác',
    text: 'Không kiểm soát được quy trình xuất nhập, các mặt hàng bán chạy hoặc tồn kho chậm được xử lý kịp thời.',
  },
  {
    icon: '◷',
    title: 'Không quản lý được lịch sử giao dịch',
    text: 'Không quản lý được lịch sử mua hàng từ nhà cung cấp gây khó khăn trong đối soát công nợ và xoay vòng vốn.',
  },
];

const features = ['Tối ưu quản lý tồn kho theo lô và hạn sử dụng', 'Quản lý sản phẩm linh hoạt theo đơn vị tính', 'Kiểm kê hàng hoá chính xác'];

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <nav className="nav wrap" aria-label="Điều hướng chính">
          <a className="brand" href="#top" aria-label="tuanit trang chủ">
            <span className="brand-mark">t</span>
            <strong>tuanit</strong>
          </a>
          <div className="nav-links">
            <a href="#solutions">Giải pháp</a>
            <a href="#pricing">Bảng giá</a>
            <a href="#customers">Khách hàng</a>
            <a href="#support">Hỗ trợ</a>
            <a href="#tools">Công cụ tính thuế</a>
            <a href="#updates">Cập nhật mới</a>
          </div>
          <div className="nav-actions">
            <a className="btn ghost" href="#login">Đăng nhập</a>
            <a className="btn primary" href="#trial">Bắt đầu miễn phí</a>
          </div>
        </nav>
        <div className="subnav">
          <div className="wrap subnav-inner">
            <strong>Quản lý</strong>
            <a href="#overview">Tổng quan</a>
            <a href="#orders">Đơn hàng</a>
            <a className="active" href="#inventory">Tồn kho</a>
            <a href="#payment">Thanh toán</a>
            <a href="#shipping">Vận chuyển⌄</a>
            <a href="#cashflow">Thu chi</a>
          </div>
        </div>
      </header>

      <section id="top" className="hero-section">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Phần mềm quản lý kho tuanit</p>
            <h1>Kinh doanh hiệu quả cùng phần mềm quản lý kho tuanit</h1>
            <p>Hỗ trợ doanh nghiệp kiểm kê chính xác số lượng tồn kho, giám sát thất thoát trong quá trình nhập, xuất hàng hoá.</p>
            <a className="btn cta" href="#trial">Dùng thử miễn phí</a>
          </div>
          <div className="dashboard-art" aria-label="Minh hoạ dashboard tồn kho">
            <div className="panel large-panel">
              <div className="mini-logo"><span className="brand-mark small">t</span>tuanit</div>
              <h3>Chi tiết tồn kho</h3>
              <div className="kpi-row">
                <span>↘ Tổng lượng tồn<br /><b>12,223,984</b></span>
                <span>◔ Tổng xuất<br /><b>15,343,335</b></span>
                <span>↗ Tỷ lệ phát sinh<br /><b>25,204,335</b></span>
              </div>
              <div className="chart"><i /><i /><i /><i /><i /><i /></div>
              <div className="table-lines">{Array.from({ length: 5 }).map((_, i) => <span key={i} />)}</div>
            </div>
            <div className="panel phone-panel">
              <b>Chi tiết</b>
              <p>Doanh thu thuần</p>
              <strong>671,247,692đ</strong>
              <div className="tiny-chart" />
            </div>
            <div className="panel floating-card">
              <b>#NVHD428</b>
              <span>Loại: Trạng thái</span>
              <span>Số lượng</span>
              <span>Tổng tiền</span>
            </div>
            <div className="barcode">▦▦▥▥▦▥<br />▥▦▦▥▥▦</div>
          </div>
        </div>
      </section>

      <section id="inventory" className="problem-section">
        <div className="wrap">
          <h2>3 nguyên nhân bán nhiều nhưng thất thoát hàng hoá cao</h2>
          <div className="reason-grid">
            {reasons.map((reason) => (
              <article className="reason-card" key={reason.title}>
                <div className="reason-icon">{reason.icon}</div>
                <h3>{reason.title}</h3>
                <p>{reason.text}</p>
                <a href="#solutions">Xem giải pháp →</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="solutions" className="content-section wrap two-col">
        <div>
          <p className="section-label">▧ Quản lý tồn kho hiệu quả</p>
          <h2>Kiểm soát chính xác số lượng tồn kho</h2>
          <ul>
            <li>Cập nhật toàn bộ dữ liệu sản phẩm lên kho hàng online của tuanit.</li>
            <li>Quản lý số lượng, mã hàng, biến thể sản phẩm chi tiết đến từng kho hàng.</li>
            <li>Cân đối tỷ lệ hàng tồn hợp lý trên toàn bộ kênh bán, từ offline đến online.</li>
          </ul>
        </div>
        <div className="flow-art">
          <span className="bubble orange">Thêm 218 đơn mới</span>
          <span className="bubble blue">Thêm 132 đơn mới</span>
          <span className="bubble cyan">Tổng tồn kho</span>
          <div className="metric-card">629,223,342đ <small>Lợi nhuận</small></div>
        </div>
      </section>

      <section className="transfer-section wrap two-col reverse">
        <div className="paper-stack">
          <div className="paper"><b>Mã</b><span /></div>
          <div className="paper offset"><b>Kho</b><span /></div>
          <div className="paper small-paper"><b>Số lượng</b><span /></div>
        </div>
        <div>
          <h2>Quản lý điều chuyển hàng hoá giữa nhiều kho</h2>
          <ul>
            <li>Điều chuyển hàng hoá dễ dàng giữa các kho, không xây thừa, thiếu sản phẩm.</li>
            <li>Phân bổ hàng hoá nhanh chóng, linh động và kịp nhu cầu mua hàng.</li>
            <li>Ghi nhận mọi lịch sử điều chuyển hàng hoá và tồn kho.</li>
          </ul>
          <a className="btn cta" href="#trial">Dùng thử miễn phí</a>
        </div>
      </section>

      <section className="feature-band">
        <span>Nhiều tính năng hữu ích</span>
        <div className="wrap feature-box">
          <div className="feature-open">
            <b>1</b>
            <h2>{features[0]}</h2>
            <p>Cho phép tạo, nhập - bán sản phẩm, quản lý hàng tồn kho và xuất báo cáo theo lô, hạn sử dụng.</p>
            <a href="#trial">Trải nghiệm ngay →</a>
          </div>
          <div className="feature-preview">
            <div className="mock-table" />
          </div>
          <div className="feature-row"><b>2</b><strong>{features[1]}</strong><span>＋</span></div>
        </div>
      </section>

      <section className="content-section wrap">
        <div className="final-head">
          <p className="section-label">▧ Kiểm kê hàng hoá chính xác</p>
          <a className="btn cta" href="#trial">Dùng thử miễn phí</a>
        </div>
        <div className="inspect-art">
          <div className="product-card"><b>Túi Xách Houndstooth</b><strong>741.000đ</strong><span>SKU: WHR2504</span></div>
          <div className="donut-card"><span>700</span><span>300</span><span>200</span><span>87</span></div>
          <div className="person-card">👨🏻‍💼</div>
        </div>
        <div className="benefit-grid">
          <article><h3>Đảm bảo không chênh lệch hàng tồn</h3><p>Phần mềm quản lý kho tuanit giúp đối soát số liệu tồn kho rõ ràng.</p></article>
          <article><h3>Cân bằng kho, giảm sai sót</h3><p>Sau khi phát hiện chênh lệch trong quá trình kiểm kho, hệ thống hỗ trợ cập nhật nhanh.</p></article>
          <article><h3>Tránh thất thoát hàng hoá</h3><p>Phần mềm quản lý kho hàng giúp doanh nghiệp theo dõi mọi giao dịch quan trọng.</p></article>
        </div>
      </section>

      <a className="chat" href="#support" aria-label="Chat hỗ trợ">⌁</a>
    </main>
  );
}
