const modules = ['Người dùng & phân quyền','Sản phẩm & SKU','Kho & vị trí','Nhập kho','Xuất kho','Nhà cung cấp','Báo cáo'];
export default function Home() {
  return <main className="shell">
    <section className="hero"><p className="eyebrow">Warehouse Management System</p><h1>Quản lý kho hàng microservice</h1><p>Dashboard khung cho đồ án: scalable, Dockerized, tách database theo service.</p></section>
    <section className="grid">{modules.map((m, i)=><article className="card" key={m}><span>0{i+1}</span><h2>{m}</h2><p>Thiết kế sẵn API, database và nghiệp vụ để triển khai thực tế.</p></article>)}</section>
  </main>;
}
