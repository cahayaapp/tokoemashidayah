import { saveGoldRates, getGoldRates } from '../services/data-service.js?v=2.1.2';
import { state, canManage } from '../core/state.js?v=2.1.2';
import { KARATS, DEFAULT_GOLD_RATES } from '../core/constants.js?v=2.1.2';
import { formatRupiah, getErrorMessage } from '../core/utils.js?v=2.1.2';
import { pageLoading, toast, setButtonLoading } from '../core/ui.js?v=2.1.2';

export async function renderPrices(container) {
  container.innerHTML = `<section class="page">${pageLoading('Memuat harga emas…')}</section>`;
  const current = await getGoldRates();
  state.goldRates = current || { rates: DEFAULT_GOLD_RATES };
  draw(container);
}

function draw(container) {
  const manager = canManage();
  const rates = state.goldRates?.rates || DEFAULT_GOLD_RATES;
  container.innerHTML = `
    <section class="page">
      <header class="page-head"><div><span class="eyebrow">Referensi Harga Harian</span><h2>Harga Emas per Kadar</h2><p>Harga jual dipakai untuk produk berbasis gram; harga beli dipakai pada buyback.</p></div><div class="page-actions">${manager ? '<button class="button button--gold" id="save-rates">Simpan Semua Harga</button>' : '<span class="badge badge--neutral">Mode lihat saja</span>'}</div></header>
      <div class="notice notice--warning" style="margin-bottom:16px"><strong>Catatan:</strong><span>Masukkan harga toko per gram, bukan harga spot internasional. Pastikan harga telah ditinjau sebelum kasir mulai bertransaksi.</span></div>
      <div class="price-grid">${KARATS.map(karat => {
        const rate = rates[karat] || rates[String(karat)] || { sell:0, buy:0 };
        return `<article class="price-card"><div class="price-card__karat"><div><span class="eyebrow" style="color:#ad9d82">Kadar</span><strong>${karat}K</strong></div><span class="badge badge--warning">${((karat/24)*100).toFixed(1)}%</span></div><div class="price-card__row"><div><label>Harga Jual / gr</label><input type="number" step="1000" value="${Number(rate.sell)||0}" data-rate-sell="${karat}" ${manager?'':'disabled'}><small>${formatRupiah(rate.sell)}</small></div><div><label>Harga Beli / gr</label><input type="number" step="1000" value="${Number(rate.buy)||0}" data-rate-buy="${karat}" ${manager?'':'disabled'}><small>${formatRupiah(rate.buy)}</small></div></div></article>`;
      }).join('')}</div>
    </section>`;
  container.querySelectorAll('.price-card input').forEach(input => input.addEventListener('input', () => { input.nextElementSibling.textContent = formatRupiah(input.value); }));
  container.querySelector('#save-rates')?.addEventListener('click', async event => {
    const button = event.currentTarget; setButtonLoading(button, true, 'Menyimpan…');
    try {
      const updated = {};
      KARATS.forEach(karat => {
        updated[karat] = {
          sell:Number(container.querySelector(`[data-rate-sell="${karat}"]`).value)||0,
          buy:Number(container.querySelector(`[data-rate-buy="${karat}"]`).value)||0
        };
      });
      await saveGoldRates(updated);
      state.goldRates = { ...state.goldRates, rates:updated };
      toast('Harga emas berhasil diperbarui.');
      draw(container);
    } catch (error) { toast(getErrorMessage(error), 'error'); setButtonLoading(button, false); }
  });
}
