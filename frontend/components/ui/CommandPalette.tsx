'use client';

import { ArrowDownToLine, ArrowUpFromLine, BarChart3, Boxes, ClipboardList, LayoutDashboard, MapPin, Package, Plus, Search, Truck, Warehouse } from 'lucide-react';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from './EmptyState';
import { FocusTrap } from './FocusTrap';

type CommandProduct = {
  id: string;
  sku: string;
  name: string;
  categoryName?: string | null;
  categoryId?: string | null;
  barcode?: string | null;
};

type CommandItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  keywords: string;
  onSelect: () => void;
};

type CommandPaletteProps = {
  open: boolean;
  products: CommandProduct[];
  isMac?: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onAddProduct: () => void;
  onAddWarehouse: () => void;
  onAddSupplier: () => void;
  onCreateInbound: () => void;
  onCreateOutbound: () => void;
  onSelectProduct: (product: CommandProduct) => void;
};

const normalize = (value: string) => value.toLowerCase().trim();

export function CommandPalette({
  open,
  products,
  isMac,
  onClose,
  onNavigate,
  onAddProduct,
  onAddWarehouse,
  onAddSupplier,
  onCreateInbound,
  onCreateOutbound,
  onSelectProduct,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const baseItems = useMemo<CommandItem[]>(() => [
    { id: 'go-overview', title: 'Di toi Tong quan', subtitle: 'So lieu nhanh va loi tat van hanh', icon: <LayoutDashboard size={16} />, keywords: 'overview tong quan dashboard', onSelect: () => onNavigate('overview') },
    { id: 'go-products', title: 'Di toi San pham', subtitle: 'Danh muc SKU, gia va hinh anh', icon: <Package size={16} />, keywords: 'products san pham sku', onSelect: () => onNavigate('products') },
    { id: 'go-warehouses', title: 'Di toi Kho', subtitle: 'Kho hang va diem luu tru', icon: <Warehouse size={16} />, keywords: 'warehouse kho hang', onSelect: () => onNavigate('warehouses') },
    { id: 'go-locations', title: 'Di toi Vi tri', subtitle: 'Vi tri trong tung kho', icon: <MapPin size={16} />, keywords: 'location vi tri kho', onSelect: () => onNavigate('locations') },
    { id: 'go-inventory', title: 'Đi tới Tồn kho', subtitle: 'Số lượng, tồn thấp và biến động kho', icon: <Boxes size={16} />, keywords: 'inventory ton kho stock', onSelect: () => onNavigate('inventory') },
    { id: 'go-suppliers', title: 'Di toi Nha cung cap', subtitle: 'Doi tac nhap hang', icon: <Truck size={16} />, keywords: 'supplier nha cung cap', onSelect: () => onNavigate('suppliers') },
    { id: 'go-inbound', title: 'Di toi Phieu nhap', subtitle: 'Tao va quan ly nhap kho', icon: <ArrowDownToLine size={16} />, keywords: 'inbound phieu nhap', onSelect: () => onNavigate('inbound') },
    { id: 'go-outbound', title: 'Di toi Phieu xuat', subtitle: 'Tao va quan ly xuat kho', icon: <ArrowUpFromLine size={16} />, keywords: 'outbound phieu xuat', onSelect: () => onNavigate('outbound') },
    { id: 'go-transactions', title: 'Di toi Giao dich', subtitle: 'Lich su phieu va trang thai', icon: <ClipboardList size={16} />, keywords: 'transactions giao dich', onSelect: () => onNavigate('transactions') },
    { id: 'go-reports', title: 'Di toi Bao cao', subtitle: 'Dashboard, export va canh bao', icon: <BarChart3 size={16} />, keywords: 'reports bao cao export', onSelect: () => onNavigate('reports') },
    { id: 'add-product', title: 'Them san pham', subtitle: 'Mo form tao SKU moi', icon: <Plus size={16} />, keywords: 'add product them san pham tao sku', onSelect: onAddProduct },
    { id: 'add-warehouse', title: 'Them kho', subtitle: 'Tao diem luu tru moi', icon: <Plus size={16} />, keywords: 'add warehouse them kho tao kho', onSelect: onAddWarehouse },
    { id: 'add-supplier', title: 'Them nha cung cap', subtitle: 'Tao doi tac nhap hang', icon: <Plus size={16} />, keywords: 'add supplier them nha cung cap', onSelect: onAddSupplier },
    { id: 'create-inbound', title: 'Tao phieu nhap', subtitle: 'Mo form nhap kho', icon: <ArrowDownToLine size={16} />, keywords: 'create inbound tao phieu nhap', onSelect: onCreateInbound },
    { id: 'create-outbound', title: 'Tao phieu xuat', subtitle: 'Mo form xuat kho', icon: <ArrowUpFromLine size={16} />, keywords: 'create outbound tao phieu xuat', onSelect: onCreateOutbound },
  ], [onAddProduct, onAddSupplier, onAddWarehouse, onCreateInbound, onCreateOutbound, onNavigate]);

  const items = useMemo(() => {
    const q = normalize(query);
    const actionResults = q ? baseItems.filter((item) => normalize(`${item.title} ${item.subtitle} ${item.keywords}`).includes(q)) : baseItems;
    const productResults = q
      ? products
        .filter((product) => normalize(`${product.name} ${product.sku} ${product.barcode || ''} ${product.categoryName || ''} ${product.categoryId || ''}`).includes(q))
        .slice(0, 6)
        .map<CommandItem>((product) => ({
          id: `product-${product.id}`,
          title: product.name,
          subtitle: `${product.sku}${product.categoryName ? ` / ${product.categoryName}` : ''}`,
          icon: <Package size={16} />,
          keywords: `${product.sku} ${product.name}`,
          onSelect: () => onSelectProduct(product),
        }))
      : [];
    return [...productResults, ...actionResults].slice(0, 12);
  }, [baseItems, onSelectProduct, products, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  const selectItem = (item: CommandItem) => {
    item.onSelect();
    onClose();
  };

  return (
    <div className="command-overlay" role="presentation" onMouseDown={onClose}>
      <FocusTrap active className="command-trap" initialFocusRef={inputRef}>
        <section
          className="command-palette"
          role="dialog"
          aria-modal="true"
          aria-labelledby="command-title"
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelectedIndex((index) => Math.min(index + 1, items.length - 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelectedIndex((index) => Math.max(index - 1, 0));
            }
            if (event.key === 'Enter' && items[selectedIndex]) {
              event.preventDefault();
              selectItem(items[selectedIndex]);
            }
          }}
        >
          <h2 id="command-title" className="sr-only">Command palette</h2>
          <div className="command-input-row">
            <Search size={18} />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tim san pham, SKU, phieu..."
              aria-label="Tim lenh hoac san pham"
            />
            <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </div>
          <div className="command-list" role="listbox" aria-label="Lệnh khả dụng">
            {items.map((item, index) => (
              <button
                key={item.id}
                className={index === selectedIndex ? 'command-row selected' : 'command-row'}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => selectItem(item)}
              >
                <span className="command-icon">{item.icon}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </span>
              </button>
            ))}
            {!items.length && (
              <EmptyState
                icon={<Search size={18} />}
                title="Không có kết quả"
                description="Thu SKU, ten san pham hoac chon mot nghiep vu khac."
              />
            )}
          </div>
          <div className="command-footer">
            <span>Tim trong du lieu da tai</span>
            <span><kbd>↑</kbd><kbd>↓</kbd> di chuyen <kbd>Enter</kbd> chon</span>
          </div>
        </section>
      </FocusTrap>
    </div>
  );
}
