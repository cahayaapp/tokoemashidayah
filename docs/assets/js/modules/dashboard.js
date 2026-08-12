import { getDashboardData } from '../services/data-service.js?v=2.1.4';
import { formatRupiah, formatNumber, sum, toDate } from '../core/utils.js?v=2.1.4';
import { renderStatCard, pageLoading, tableEmpty, badge } from '../core/ui.js?v=2.1.4';

export async function renderDashboard(container) {
  container.innerHTML = `<section class="page">${pageLoading('Menyusun ringkasan toko…')}</section>`;
  const data = await getDashboardData();
  const completedToday = data.todaySales.filter(item => item.status !== 'void');
  const completedMonth = data.monthSales.filter(item => item.status !== 'void');
  const todayRevenue = sum(completedToday, item => item.grandTotal);
  const monthRevenue = sum(completedMonth, item => item.grandTotal);
  const monthExpenses = sum(data.monthExpenses, item => item.amount);
  const estimatedCost = sum(completedMonth, sale => sum(sale.lines || [], line => line.estimatedCost));
  const estimatedProfit = monthRevenue - estimatedCost - monthExpenses;
  const lowStock = data.products.filter(product => product.active !== false && Number(product.stockQty) <= Number(product.minStock || 0));
  const stockValue = sum(data.products, product => Number(product.stockQty) * Number(product.costPrice || 0));

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index)); date.setHours(0,0,0,0);
    const next = new Date(date); next.setDate(next.getDate() + 1);
    const value = sum(data.weekSales.filter(sale => sale.status !== 'void').filter(sale => { const d = toDate(sale.createdAt); return d && d >= date && d < next; }), sale => sale.grandTotal);
    return { label: date.toLocaleDateString('id-ID', { weekday: 'short' }), value };
  });
  const maxDay = Math.max(...days.map(item => item.value), 1);

  container.innerHTML = `
    <section class="page">
      <header class="page-head"><div><span class="eyebrow">Ringkasan Operasional</span><h2>Dashboard Toko</h2><p>Pantau penjualan, laba, stok, dan aktivitas terbaru.</p></div><div class="page-actions"><a class="button button--gold" href="#pos">▣ Transaksi Baru</a></div></header>
      <div class="stats-grid">
        ${renderStatCard({ label:'Penjualan Hari Ini', value:formatRupiah(todayRevenue), note:`${completedToday.length} transaksi`, icon:'↑', tone:'gold' })}
        ${renderStatCard({ label:'Penjualan Bulan Ini', value:formatRupiah(monthRevenue), note:`${completedMonth.length} transaksi`, icon:'◆', tone:'green' })}
        ${renderStatCard({ label:'Estimasi Laba Bersih', value:formatRupiah(estimatedProfit), note:'Setelah HPP & pengeluaran', icon:'◈', tone: estimatedProfit >= 0 ? 'blue' : 'red' })}
        ${renderStatCard({ label:'Nilai Persediaan', value:formatRupiah(stockValue), note:`${data.products.length} produk`, icon:'◇', tone:'gold' })}
      </div>
      <div class="dashboard-grid">
        <div class="dashboard-stack">
          <article class="card"><div class="card__head"><div><h3>Tren Penjualan 7 Hari</h3><p>Nilai transaksi selesai per hari.</p></div></div><div class="card__body"><div class="chart">${days.map(item => `<div class="chart__bar" style="height:${Math.max(4,(item.value/maxDay)*100)}%"><i>${item.value ? compactCurrency(item.value) : '0'}</i><span>${item.label}</span></div>`).join('')}</div></div></article>
          <article class="card"><div class="card__head"><div><h3>Produk Perlu Perhatian</h3><p>Stok telah mencapai batas minimum.</p></div><a class="button button--outline button--sm" href="#products">Lihat Produk</a></div><div class="card__body card__body--flush">${lowStock.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Produk</th><th>Kadar</th><th>Stok</th><th>Berat</th><th>Status</th></tr></thead><tbody>${lowStock.slice(0,7).map(product => `<tr><td><div class="table-primary"><div class="product-thumb">${product.name.slice(0,2).toUpperCase()}</div><div><strong>${product.name}</strong><small>${product.sku}</small></div></div></td><td>${product.karat || '—'}K</td><td>${formatNumber(product.stockQty)}</td><td>${formatNumber(product.stockWeightGrams)} gr</td><td>${badge(Number(product.stockQty) <= 0 ? 'Habis' : 'Menipis', Number(product.stockQty) <= 0 ? 'danger' : 'warning')}</td></tr>`).join('')}</tbody></table></div>` : tableEmpty('Semua stok dalam kondisi aman.')}</div></article>
        </div>
        <div class="dashboard-stack">
          <article class="card"><div class="card__head"><div><h3>Kinerja Bulan Ini</h3><p>Ringkasan arus utama.</p></div></div><div class="card__body"><div class="metric-list"><div class="metric-row"><span>Omzet</span><strong>${formatRupiah(monthRevenue)}</strong></div><div class="metric-row"><span>Estimasi HPP</span><strong>${formatRupiah(estimatedCost)}</strong></div><div class="metric-row"><span>Pengeluaran</span><strong>${formatRupiah(monthExpenses)}</strong></div><div class="metric-row"><span>Margin estimasi</span><strong>${monthRevenue ? formatNumber((estimatedProfit/monthRevenue)*100,1) : 0}%</strong></div><div class="metric-row"><span>Rata-rata transaksi</span><strong>${formatRupiah(completedMonth.length ? monthRevenue/completedMonth.length : 0)}</strong></div></div></div></article>
          <article class="card"><div class="card__head"><div><h3>Aktivitas Stok Terbaru</h3><p>Pergerakan tujuh hari terakhir.</p></div></div><div class="card__body">${data.movements.length ? `<div class="activity-list">${data.movements.slice(0,8).map(item => `<div class="activity-item"><div class="activity-icon">${Number(item.qtyDelta) >= 0 || Number(item.weightDelta) >= 0 ? '↓' : '↑'}</div><div><strong>${item.productName || 'Emas'}</strong><small>${item.referenceNo || item.type} • ${formatNumber(item.weightDelta)} gr</small></div><time>${toDate(item.createdAt)?.toLocaleDateString('id-ID',{day:'2-digit',month:'short'}) || '—'}</time></div>`).join('')}</div>` : tableEmpty('Belum ada pergerakan stok.')}</div></article>
        </div>
      </div>
    </section>`;
}

function compactCurrency(value) {
  if (value >= 1_000_000_000) return `Rp${formatNumber(value/1_000_000_000,1)}M`;
  if (value >= 1_000_000) return `Rp${formatNumber(value/1_000_000,1)}Jt`;
  if (value >= 1_000) return `Rp${formatNumber(value/1_000,0)}Rb`;
  return `Rp${formatNumber(value,0)}`;
}
