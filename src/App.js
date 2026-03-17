import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const GRAIN_ORDER = ['rice', 'flour', 'lentils'];
const LABELS = { rice: 'أرز', lentils: 'عدس', flour: 'دقيق' };
const EMOJIS = { rice: '🍚', lentils: '🫘', flour: '🌾' };
const WEIGHTS = { rice: 2.8, lentils: 2.65, flour: 2.75 };
const DEFAULT_PRICES = { rice: 72, lentils: 118, flour: 52 };
const DEFAULT_INVENTORY = { rice: 2000, lentils: 300, flour: 3000 };

const safeLoad = (key, fallback) => {
  try {
    const data = localStorage.getItem(key);
    if (!data) return fallback;
    return JSON.parse(data);
  } catch { return fallback; }
};

const safeSave = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
};

const migrate = (data, defaults) => {
  if (!data) return { ...defaults };
  if (data.beans !== undefined && data.lentils === undefined) {
    return {
      rice: data.rice ?? defaults.rice,
      lentils: data.beans ?? defaults.lentils,
      flour: data.flour ?? defaults.flour,
    };
  }
  return {
    rice: data.rice ?? defaults.rice,
    lentils: data.lentils ?? defaults.lentils,
    flour: data.flour ?? defaults.flour,
  };
};

const migrateTx = (txList) => {
  if (!Array.isArray(txList)) return [];
  return txList.map((tx) => {
    if (tx.sapieces && tx.sapieces.beans !== undefined && tx.sapieces.lentils === undefined) {
      return {
        ...tx,
        sapieces: { rice: tx.sapieces.rice || 0, lentils: tx.sapieces.beans || 0, flour: tx.sapieces.flour || 0 },
        kgUsed: tx.kgUsed ? { rice: tx.kgUsed.rice || 0, lentils: tx.kgUsed.beans || 0, flour: tx.kgUsed.flour || 0 } : undefined,
      };
    }
    return tx;
  });
};

function App() {
  const [sapieces, setSapieces] = useState({ rice: 0, lentils: 0, flour: 0 });
  const [paidAmount, setPaidAmount] = useState('');
  const [remainderType, setRemainderType] = useState('zakat');
  const [refundAmount, setRefundAmount] = useState('');
  const [afterRefundType, setAfterRefundType] = useState('zakat');
  const [activeTab, setActiveTab] = useState('main');
  const [showModal, setShowModal] = useState(false);
  const [pendingTx, setPendingTx] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [lastSaveTime, setLastSaveTime] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [firebaseLoaded, setFirebaseLoaded] = useState(false);

  const [priceSettings, setPriceSettings] = useState(() =>
    migrate(safeLoad('priceSettings', null), DEFAULT_PRICES)
  );
  const [inventory, setInventory] = useState(() =>
    migrate(safeLoad('zakat_inventory', null), DEFAULT_INVENTORY)
  );
  const [transactions, setTransactions] = useState(() =>
    migrateTx(safeLoad('zakat_transactions', []))
  );

  const [addInvInput, setAddInvInput] = useState({ rice: '', lentils: '', flour: '' });
  const [editInvInput, setEditInvInput] = useState({ rice: '', lentils: '', flour: '' });
  const [invMode, setInvMode] = useState({ rice: 'add', lentils: 'add', flour: 'add' });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const loadFromFirestore = async () => {
      try {
        const docRef = doc(db, 'mosqueData', 'main');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.inventory) {
            const inv = migrate(data.inventory, DEFAULT_INVENTORY);
            setInventory(inv);
            safeSave('zakat_inventory', inv);
          }
          if (data.transactions && data.transactions.length > 0) {
            const txs = migrateTx(data.transactions);
            setTransactions(txs);
            safeSave('zakat_transactions', txs);
          }
          if (data.priceSettings) {
            const ps = migrate(data.priceSettings, DEFAULT_PRICES);
            setPriceSettings(ps);
            safeSave('priceSettings', ps);
          }
          console.log('✅ تم تحميل البيانات من Firebase');
        }
        setFirebaseLoaded(true);
      } catch (err) {
        console.log('⚠️ استخدام البيانات المحلية:', err);
        setFirebaseLoaded(true);
      }
    };
    loadFromFirestore();
  }, []);

  const saveToFirestore = useCallback(async (inv, txs, prices) => {
    try {
      const docRef = doc(db, 'mosqueData', 'main');
      await setDoc(docRef, {
        inventory: inv,
        transactions: txs,
        priceSettings: prices,
        lastUpdated: new Date().toISOString()
      });
      console.log('✅ تم الحفظ في Firebase');
    } catch (err) {
      console.log('⚠️ سيتم المزامنة لاحقاً:', err);
    }
  }, []);

  const saveAllData = useCallback(() => {
    setSaveStatus('saving');
    const s1 = safeSave('zakat_inventory', inventory);
    const s2 = safeSave('zakat_transactions', transactions);
    const s3 = safeSave('priceSettings', priceSettings);
    saveToFirestore(inventory, transactions, priceSettings);
    if (s1 && s2 && s3) {
      setSaveStatus('saved');
      setLastSaveTime(new Date().toLocaleTimeString('ar-EG'));
    } else { setSaveStatus('error'); }
  }, [inventory, transactions, priceSettings, saveToFirestore]);

  useEffect(() => {
    if (!firebaseLoaded) return;
    const t = setTimeout(saveAllData, 500);
    return () => clearTimeout(t);
  }, [saveAllData, firebaseLoaded]);

  useEffect(() => { const i = setInterval(saveAllData, 30000); return () => clearInterval(i); }, [saveAllData]);

  useEffect(() => {
    const h = () => { saveAllData(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [saveAllData]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isOnline && firebaseLoaded) {
      saveToFirestore(inventory, transactions, priceSettings);
    }
  }, [isOnline]);

  const prices = {
    rice: priceSettings.rice || DEFAULT_PRICES.rice,
    lentils: priceSettings.lentils || DEFAULT_PRICES.lentils,
    flour: priceSettings.flour || DEFAULT_PRICES.flour,
  };

  const totalRequired =
    (sapieces.rice || 0) * prices.rice +
    (sapieces.lentils || 0) * prices.lentils +
    (sapieces.flour || 0) * prices.flour;

  const paid = parseFloat(paidAmount) || 0;
  const remaining = paid - totalRequired;
  const getAvailSa = (type) => Math.floor((inventory[type] || 0) / WEIGHTS[type]);
  const getReqKg = (type) => ((sapieces[type] || 0) * WEIGHTS[type]).toFixed(2);
  const increment = (type) => setSapieces((p) => ({ ...p, [type]: (p[type] || 0) + 1 }));
  const decrement = (type) => setSapieces((p) => ({ ...p, [type]: Math.max(0, (p[type] || 0) - 1) }));
  const actualRefund = remainderType === 'refund' ? (parseFloat(refundAmount) || 0) : 0;
  const afterRefundRemaining = remaining - actualRefund;

  const handleSubmit = () => {
    const totalSa = (sapieces.rice || 0) + (sapieces.lentils || 0) + (sapieces.flour || 0);
    if (totalSa === 0) return alert('حدد عدد الصاعات أولاً');
    if (paid <= 0) return alert('أدخل المبلغ المدفوع');
    if (paid < totalRequired) return alert('المبلغ المدفوع (' + paid + ') أقل من المطلوب (' + totalRequired + ')');
    for (let type of GRAIN_ORDER) {
      const reqKg = (sapieces[type] || 0) * WEIGHTS[type];
      if (reqKg > (inventory[type] || 0)) {
        return alert('⚠️ مخزون ' + LABELS[type] + ' غير كافٍ!\nالمطلوب: ' + reqKg.toFixed(2) + ' كجم\nالمتوفر: ' + (inventory[type] || 0) + ' كجم');
      }
    }
    if (remainderType === 'refund' && actualRefund > remaining) return alert('مبلغ الاسترجاع أكبر من المتبقي!');
    const tx = {
      id: Date.now(),
      date: new Date().toLocaleString('ar-EG'),
      dateKey: new Date().toISOString().split('T')[0],
      sapieces: { ...sapieces },
      kgUsed: {
        rice: (sapieces.rice || 0) * WEIGHTS.rice,
        lentils: (sapieces.lentils || 0) * WEIGHTS.lentils,
        flour: (sapieces.flour || 0) * WEIGHTS.flour,
      },
      totalRequired, paid, remaining,
      remainderType: remaining > 0 ? remainderType : 'none',
      refundAmount: remaining > 0 && remainderType === 'refund' ? actualRefund : 0,
      afterRefundRemaining: remaining > 0 && remainderType === 'refund' ? afterRefundRemaining : 0,
      afterRefundType: remaining > 0 && remainderType === 'refund' && afterRefundRemaining > 0 ? afterRefundType : 'none',
      timestamp: Date.now(),
      deducted: false,
    };
    setPendingTx(tx);
    setShowModal(true);
  };

  const confirmTx = (deduct) => {
    if (!pendingTx) return;
    if (deduct) {
      setInventory((prev) => ({
        rice: parseFloat(((prev.rice || 0) - (pendingTx.kgUsed.rice || 0)).toFixed(2)),
        lentils: parseFloat(((prev.lentils || 0) - (pendingTx.kgUsed.lentils || 0)).toFixed(2)),
        flour: parseFloat(((prev.flour || 0) - (pendingTx.kgUsed.flour || 0)).toFixed(2)),
      }));
    }
    setTransactions((prev) => [...prev, { ...pendingTx, deducted: deduct }]);
    resetForm();
  };

  const resetForm = () => {
    setSapieces({ rice: 0, lentils: 0, flour: 0 });
    setPaidAmount(''); setRemainderType('zakat');
    setRefundAmount(''); setAfterRefundType('zakat');
    setShowModal(false); setPendingTx(null);
  };

  const handleInvAction = (type) => {
    if (invMode[type] === 'add') {
      const val = parseFloat(addInvInput[type]);
      if (isNaN(val) || val <= 0) return alert('أدخل كمية صحيحة');
      setInventory((p) => ({ ...p, [type]: parseFloat(((p[type] || 0) + val).toFixed(2)) }));
      setAddInvInput((p) => ({ ...p, [type]: '' }));
    } else {
      const val = parseFloat(editInvInput[type]);
      if (isNaN(val) || val < 0) return alert('أدخل كمية صحيحة');
      setInventory((p) => ({ ...p, [type]: val }));
      setEditInvInput((p) => ({ ...p, [type]: '' }));
    }
  };

  const deleteTx = (id) => {
    if (!window.confirm('هل تريد حذف هذه المعاملة؟')) return;
    const tx = transactions.find((t) => t.id === id);
    if (tx && tx.deducted) {
      if (window.confirm('هل تريد إرجاع الكميات للمخزون؟')) {
        setInventory((p) => ({
          rice: parseFloat(((p.rice || 0) + (tx.kgUsed?.rice || 0)).toFixed(2)),
          lentils: parseFloat(((p.lentils || 0) + (tx.kgUsed?.lentils || 0)).toFixed(2)),
          flour: parseFloat(((p.flour || 0) + (tx.kgUsed?.flour || 0)).toFixed(2)),
        }));
      }
    }
    setTransactions((p) => p.filter((t) => t.id !== id));
  };

  const todayKey = new Date().toISOString().split('T')[0];
  const todayTx = transactions.filter((t) => t.dateKey === todayKey);

  const calcStats = (txList) => ({
    count: txList.length,
    totalPaid: txList.reduce((s, t) => s + (t.paid || 0), 0),
    totalZakat: txList.reduce((s, t) => s + (t.totalRequired || 0), 0),
    zakatRemainder:
      txList.filter((t) => t.remainderType === 'zakat').reduce((s, t) => s + Math.max(0, t.remaining || 0), 0) +
      txList.filter((t) => t.afterRefundType === 'zakat').reduce((s, t) => s + Math.max(0, t.afterRefundRemaining || 0), 0),
    sadaqaRemainder:
      txList.filter((t) => t.remainderType === 'sadaqa').reduce((s, t) => s + Math.max(0, t.remaining || 0), 0) +
      txList.filter((t) => t.afterRefundType === 'sadaqa').reduce((s, t) => s + Math.max(0, t.afterRefundRemaining || 0), 0),
    totalRefund: txList.reduce((s, t) => s + (t.refundAmount || 0), 0),
    sa: {
      rice: txList.reduce((s, t) => s + (t.sapieces?.rice || 0), 0),
      lentils: txList.reduce((s, t) => s + (t.sapieces?.lentils || 0), 0),
      flour: txList.reduce((s, t) => s + (t.sapieces?.flour || 0), 0),
    },
    kg: {
      rice: txList.reduce((s, t) => s + (t.kgUsed?.rice || 0), 0),
      lentils: txList.reduce((s, t) => s + (t.kgUsed?.lentils || 0), 0),
      flour: txList.reduce((s, t) => s + (t.kgUsed?.flour || 0), 0),
    },
  });

  const stats = calcStats(todayTx);

  const exportData = () => {
    const data = { inventory, transactions, priceSettings, exportDate: new Date().toLocaleString('ar-EG'), version: '3.0' };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'zakat_backup_' + todayKey + '.json'; a.click();
    URL.revokeObjectURL(url);
    alert('✅ تم تصدير النسخة الاحتياطية!');
  };

  const importData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!window.confirm('⚠️ استبدال جميع البيانات؟')) return;
        if (data.inventory) setInventory(migrate(data.inventory, DEFAULT_INVENTORY));
        if (data.transactions) setTransactions(migrateTx(data.transactions));
        if (data.priceSettings) setPriceSettings(migrate(data.priceSettings, DEFAULT_PRICES));
        alert('✅ تم الاستيراد بنجاح!');
      } catch { alert('❌ ملف غير صالح!'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportExcel = () => {
    const BOM = '\uFEFF';
    const s = calcStats(todayTx);
    let html = BOM + '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>td,th{border:1px solid #999;padding:8px;text-align:center;font-family:Arial;}th{background:#1b5e20;color:white;}h2{color:#1b5e20;font-family:Arial;}.total{background:#e8f5e9;font-weight:bold;}</style></head><body dir="rtl">';
    html += '<h2>🌙 تقرير زكاة الفطر - مسجد التوفيق</h2>';
    html += '<p>التاريخ: ' + new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '</p><br>';
    html += '<h3>📊 ملخص الإحصائيات</h3><table><tr><th>البيان</th><th>القيمة</th></tr>';
    html += '<tr><td>عدد المعاملات</td><td>' + s.count + '</td></tr>';
    html += '<tr><td>إجمالي المدفوع</td><td>' + s.totalPaid + ' جنيه</td></tr>';
    html += '<tr><td>إجمالي الزكاة</td><td>' + s.totalZakat + ' جنيه</td></tr>';
    html += '<tr><td>زكاة من الباقي</td><td>' + s.zakatRemainder + ' جنيه</td></tr>';
    html += '<tr><td>صدقات</td><td>' + s.sadaqaRemainder + ' جنيه</td></tr>';
    html += '<tr><td>المسترجع</td><td>' + s.totalRefund + ' جنيه</td></tr></table><br>';
    html += '<h3>📦 الأصناف</h3><table><tr><th>الصنف</th><th>صاعات</th><th>كجم</th></tr>';
    GRAIN_ORDER.forEach((type) => { html += '<tr><td>' + LABELS[type] + '</td><td>' + s.sa[type] + '</td><td>' + s.kg[type].toFixed(2) + '</td></tr>'; });
    html += '<tr class="total"><td>الإجمالي</td><td>' + (s.sa.rice + s.sa.lentils + s.sa.flour) + '</td><td>' + (s.kg.rice + s.kg.lentils + s.kg.flour).toFixed(2) + '</td></tr></table><br>';
    html += '<h3>📋 المعاملات</h3><table><tr><th>م</th><th>الوقت</th><th>أرز</th><th>دقيق</th><th>عدس</th><th>المطلوب</th><th>المدفوع</th><th>المتبقي</th><th>التصرف</th></tr>';
    todayTx.forEach((tx, i) => {
      const rType = tx.remainderType === 'zakat' ? 'زكاة' : tx.remainderType === 'sadaqa' ? 'صدقة' : tx.remainderType === 'refund' ? 'استرجاع' : '-';
      html += '<tr><td>' + (i + 1) + '</td><td>' + tx.date + '</td><td>' + (tx.sapieces?.rice || 0) + '</td><td>' + (tx.sapieces?.flour || 0) + '</td><td>' + (tx.sapieces?.lentils || 0) + '</td><td>' + (tx.totalRequired || 0) + '</td><td>' + (tx.paid || 0) + '</td><td>' + Math.max(0, tx.remaining || 0) + '</td><td>' + rType + '</td></tr>';
    });
    html += '</table></body></html>';
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'زكاة_الفطر_' + todayKey + '.xls'; a.click();
    URL.revokeObjectURL(url);
    alert('✅ تم تصدير Excel!');
  };

  const getRemLabel = (tx) => {
    if (tx.remainderType === 'zakat') return '🕌 زكاة';
    if (tx.remainderType === 'sadaqa') return '🤲 صدقة';
    if (tx.remainderType === 'refund') {
      let l = '💰 استرجاع ' + (tx.refundAmount || 0) + ' جنيه';
      if ((tx.afterRefundRemaining || 0) > 0) l += ' | المتبقي ' + tx.afterRefundRemaining + ' جنيه (' + (tx.afterRefundType === 'zakat' ? 'زكاة' : 'صدقة') + ')';
      return l;
    }
    return '';
  };

  return (
    <div className="app" dir="rtl">
      <header className="header">
        <div className="logo-area">
          <div className="logo-icon">🕌</div>
          <div className="logo-text">
            <h1>مسجد التوفيق</h1>
            <div className="logo-subtitle">حاسبة زكاة الفطر</div>
          </div>
          <div className="logo-icon">🌙</div>
        </div>
        <div className={'save-indicator ' + saveStatus}>
          {saveStatus === 'saved' && ('✅ محفوظ ' + lastSaveTime)}
          {saveStatus === 'saving' && '💾 جارٍ الحفظ...'}
          {saveStatus === 'error' && '❌ خطأ!'}
        </div>
        <div className="online-status">
          {isOnline ? '🟢 متصل - مزامنة تلقائية' : '🔴 أوفلاين - سيتم المزامنة لاحقاً'}
        </div>
      </header>

      <nav className="tabs">
        {[
          { id: 'main', label: '⚖️ الزكاة' },
          { id: 'inventory', label: '📦 المخزون' },
          { id: 'stats', label: '📊 الإحصائيات' },
          { id: 'records', label: '📋 السجل' },
          { id: 'settings', label: '⚙️ إعدادات' },
        ].map((t) => (
          <button key={t.id} className={'tab ' + (activeTab === t.id ? 'active' : '')} onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      <div className="container">
        {activeTab === 'main' && (
          <>
            <section className="card">
              <h2 className="card-title">⚖️ تحديد عدد الصاعات</h2>
              <div className="sa-grid">
                {GRAIN_ORDER.map((type) => (
                  <div key={type} className={'sa-item sa-' + type}>
                    <div className="sa-emoji">{EMOJIS[type]}</div>
                    <div className="sa-label">{LABELS[type]}</div>
                    <div className="sa-weight">الصاع = {WEIGHTS[type]} كجم</div>
                    <div className="sa-controls">
                      <button className="btn-circle btn-minus" onClick={() => decrement(type)}>−</button>
                      <span className="sa-count">{sapieces[type] || 0}</span>
                      <button className="btn-circle btn-plus" onClick={() => increment(type)}>+</button>
                    </div>
                    <div className="sa-price">سعر الصاع: {prices[type]} جنيه</div>
                    <div className="sa-subtotal">{(sapieces[type] || 0) * prices[type]} جنيه</div>
                    {(sapieces[type] || 0) > 0 && <div className="sa-kg">({getReqKg(type)} كجم)</div>}
                    <div className="sa-stock">المخزون: {inventory[type] || 0} كجم ({getAvailSa(type)} صاع)</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <h2 className="card-title">💰 الحساب والدفع</h2>
              <div className="calc-grid">
                <div className="calc-box required"><label>المبلغ المطلوب</label><div className="calc-val">{totalRequired} جنيه</div></div>
                <div className="calc-box"><label>المبلغ المدفوع</label><input type="number" className="input-pay" placeholder="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} min="0" /></div>
                <div className={'calc-box ' + (remaining > 0 ? 'positive' : remaining < 0 ? 'negative' : '')}><label>{remaining >= 0 ? 'المبلغ المتبقي' : 'المبلغ الناقص'}</label><div className="calc-val">{Math.abs(remaining)} جنيه {remaining > 0 ? '✅' : remaining < 0 ? '⚠️' : ''}</div></div>
              </div>

              {remaining > 0 && (
                <div className="remainder-box">
                  <h3>المبلغ المتبقي ({remaining} جنيه) ماذا تريد أن تفعل به؟</h3>
                  <div className="remainder-btns">
                    <button className={'btn-rem ' + (remainderType === 'zakat' ? 'active-z' : '')} onClick={() => { setRemainderType('zakat'); setRefundAmount(''); }}>🕌 زكاة</button>
                    <button className={'btn-rem ' + (remainderType === 'sadaqa' ? 'active-s' : '')} onClick={() => { setRemainderType('sadaqa'); setRefundAmount(''); }}>🤲 صدقة</button>
                    <button className={'btn-rem ' + (remainderType === 'refund' ? 'active-r' : '')} onClick={() => { setRemainderType('refund'); setRefundAmount(String(remaining)); }}>💰 استرجاع</button>
                  </div>
                  {remainderType === 'refund' && (
                    <div className="refund-section">
                      <label>مبلغ الاسترجاع:</label>
                      <div className="refund-row">
                        <input type="number" className="input-refund" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} min="0" max={remaining} placeholder="0" />
                        <span>جنيه</span>
                        <button className="btn-refund-all" onClick={() => setRefundAmount(String(remaining))}>استرجاع الكل</button>
                      </div>
                      {afterRefundRemaining > 0 && (
                        <div className="after-refund">
                          <p>💡 المتبقي بعد الاسترجاع: <strong>{afterRefundRemaining} جنيه</strong></p>
                          <div className="remainder-btns">
                            <button className={'btn-rem small ' + (afterRefundType === 'zakat' ? 'active-z' : '')} onClick={() => setAfterRefundType('zakat')}>🕌 زكاة</button>
                            <button className={'btn-rem small ' + (afterRefundType === 'sadaqa' ? 'active-s' : '')} onClick={() => setAfterRefundType('sadaqa')}>🤲 صدقة</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <button className="btn-submit" onClick={handleSubmit}>✅ تأكيد العملية</button>
            </section>
          </>
        )}

        {activeTab === 'inventory' && (
          <section className="card">
            <h2 className="card-title">📦 إدارة المخزون (بالكيلوجرام)</h2>
            <div className="inv-grid">
              {GRAIN_ORDER.map((type) => (
                <div key={type} className="inv-item">
                  <div className="inv-head"><span className="inv-emoji">{EMOJIS[type]}</span><span className="inv-name">{LABELS[type]}</span></div>
                  <div className={'inv-count ' + ((inventory[type] || 0) <= WEIGHTS[type] * 10 ? 'low' : '')}>{inventory[type] || 0}<span className="inv-unit"> كجم</span></div>
                  <div className="inv-sa">≈ {getAvailSa(type)} صاع</div>
                  {(inventory[type] || 0) <= WEIGHTS[type] * 10 && <div className="low-warn">⚠️ مخزون منخفض!</div>}
                  <div className="inv-toggle">
                    <button className={'inv-tog-btn ' + (invMode[type] === 'add' ? 'active' : '')} onClick={() => setInvMode((p) => ({ ...p, [type]: 'add' }))}>📥 إضافة</button>
                    <button className={'inv-tog-btn ' + (invMode[type] === 'edit' ? 'active' : '')} onClick={() => setInvMode((p) => ({ ...p, [type]: 'edit' }))}>✏️ تعديل</button>
                  </div>
                  {invMode[type] === 'add' ? (
                    <div className="inv-act">
                      <input type="number" placeholder="كمية بالكجم" value={addInvInput[type]} onChange={(e) => setAddInvInput((p) => ({ ...p, [type]: e.target.value }))} min="0" />
                      <button className="btn-inv add" onClick={() => handleInvAction(type)}>+ إضافة</button>
                    </div>
                  ) : (
                    <div className="inv-act">
                      <input type="number" placeholder={'الحالي: ' + (inventory[type] || 0)} value={editInvInput[type]} onChange={(e) => setEditInvInput((p) => ({ ...p, [type]: e.target.value }))} min="0" />
                      <button className="btn-inv set" onClick={() => handleInvAction(type)}>✅ تعيين</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'stats' && (
          <section className="card">
            <h2 className="card-title">📊 إحصائيات اليوم</h2>
            <div className="stats-grid">
              <div className="stat-box blue"><div className="stat-num">{stats.count}</div><div className="stat-lbl">المعاملات</div></div>
              <div className="stat-box green"><div className="stat-num">{stats.totalPaid}</div><div className="stat-lbl">المدفوع (جنيه)</div></div>
              <div className="stat-box purple"><div className="stat-num">{stats.totalZakat}</div><div className="stat-lbl">الزكاة (جنيه)</div></div>
              <div className="stat-box orange"><div className="stat-num">{stats.zakatRemainder}</div><div className="stat-lbl">زكاة الباقي</div></div>
              <div className="stat-box pink"><div className="stat-num">{stats.sadaqaRemainder}</div><div className="stat-lbl">صدقات</div></div>
              <div className="stat-box yellow"><div className="stat-num">{stats.totalRefund}</div><div className="stat-lbl">المسترجع</div></div>
            </div>
            <h3 className="sub-head">📦 الصاعات والأوزان</h3>
            <div className="sa-summary">
              {GRAIN_ORDER.map((type) => (
                <div key={type} className="sa-sum-row">
                  <span>{EMOJIS[type]} {LABELS[type]}</span>
                  <div className="sa-sum-det"><strong>{stats.sa[type]} صاع</strong><small>({stats.kg[type].toFixed(2)} كجم)</small></div>
                </div>
              ))}
              <div className="sa-sum-row total">
                <span>📊 الإجمالي</span>
                <div className="sa-sum-det"><strong>{stats.sa.rice + stats.sa.lentils + stats.sa.flour} صاع</strong><small>({(stats.kg.rice + stats.kg.lentils + stats.kg.flour).toFixed(2)} كجم)</small></div>
              </div>
            </div>
            <div className="export-excel-area"><button className="btn-excel" onClick={exportExcel}>📊 تصدير Excel</button></div>
          </section>
        )}

        {activeTab === 'records' && (
          <section className="card">
            <div className="card-top">
              <h2 className="card-title">📋 سجل المعاملات</h2>
              {transactions.length > 0 && (<button className="btn-danger" onClick={() => { if (window.confirm('⚠️ حذف جميع المعاملات؟')) setTransactions([]); }}>🗑️ مسح الكل</button>)}
            </div>
            {transactions.length === 0 ? (
              <div className="empty"><div className="empty-ic">📝</div><p>لا توجد معاملات</p></div>
            ) : (
              <div className="tx-list">
                {[...transactions].reverse().map((tx) => (
                  <div key={tx.id} className="tx-card">
                    <div className="tx-top">
                      <span className="tx-time">{tx.date}</span>
                      <button className="btn-del" onClick={() => deleteTx(tx.id)}>✕</button>
                    </div>
                    <div className="tx-body">
                      <div className="tx-tags">
                        {GRAIN_ORDER.map((type) =>
                          (tx.sapieces?.[type] || 0) > 0 && (
                            <span key={type} className="tx-tag">{EMOJIS[type]} {LABELS[type]}: {tx.sapieces[type]} صاع {tx.kgUsed && ('(' + (tx.kgUsed[type] || 0).toFixed(2) + ' كجم)')}</span>
                          )
                        )}
                      </div>
                      <div className="tx-money">
                        <span>المطلوب: {tx.totalRequired || 0} جنيه</span>
                        <span>المدفوع: {tx.paid || 0} جنيه</span>
                        {(tx.remaining || 0) > 0 && (<span className="tx-rest">الباقي: {tx.remaining} جنيه → {getRemLabel(tx)}</span>)}
                      </div>
                      {tx.deducted && <span className="tx-deducted">📦 تم الخصم من المخزون</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="card">
            <h2 className="card-title">⚙️ الإعدادات</h2>
            <div className="settings-section">
              <h3>💲 أسعار الصاع (جنيه)</h3>
              <div className="price-grid">
                {GRAIN_ORDER.map((type) => (
                  <div key={type} className="price-item">
                    <label>{EMOJIS[type]} {LABELS[type]}</label>
                    <div className="price-weight">الصاع = {WEIGHTS[type]} كجم</div>
                    <div className="price-input-wrap">
                      <input type="number" value={priceSettings[type] || ''} onChange={(e) => setPriceSettings((p) => ({ ...p, [type]: parseFloat(e.target.value) || 0 }))} min="0" />
                      <span>جنيه</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="settings-section">
              <h3>💾 النسخ الاحتياطي</h3>
              <p className="settings-desc">احفظ نسخة احتياطية من بياناتك</p>
              <div className="backup-btns">
                <button className="btn-backup export" onClick={exportData}>📤 تصدير JSON</button>
                <button className="btn-backup excel" onClick={exportExcel}>📊 تصدير Excel</button>
                <label className="btn-backup import">📥 استيراد<input type="file" accept=".json" onChange={importData} hidden /></label>
              </div>
            </div>
            <div className="settings-section">
              <h3>🔥 Firebase</h3>
              <div className="info-rows">
                <div className="info-row"><span>حالة الاتصال</span><strong>{isOnline ? '🟢 متصل' : '🔴 أوفلاين'}</strong></div>
                <div className="info-row"><span>المزامنة</span><strong>{isOnline ? '✅ تلقائية' : '⏳ عند عودة الإنترنت'}</strong></div>
              </div>
            </div>
            <div className="settings-section">
              <h3>ℹ️ معلومات</h3>
              <div className="info-rows">
                <div className="info-row"><span>عدد المعاملات الكلي</span><strong>{transactions.length}</strong></div>
                <div className="info-row"><span>آخر حفظ</span><strong>{lastSaveTime || 'لم يتم بعد'}</strong></div>
                <div className="info-row"><span>حالة الحفظ</span><strong>{saveStatus === 'saved' ? '✅ محفوظ' : saveStatus === 'saving' ? '⏳ جارٍ' : '❌ خطأ'}</strong></div>
              </div>
            </div>
          </section>
        )}
      </div>

      {showModal && (
        <div className="overlay">
          <div className="modal">
            <h3>📦 خصم من المخزون؟</h3>
            <p>هل تريد إنقاص هذه الكميات من المخزون؟</p>
            <div className="modal-list">
              {pendingTx && GRAIN_ORDER.map((type) =>
                (pendingTx.sapieces?.[type] || 0) > 0 && (
                  <div key={type} className="modal-row">{EMOJIS[type]} {LABELS[type]}: {pendingTx.sapieces[type]} صاع ({(pendingTx.kgUsed?.[type] || 0).toFixed(2)} كجم)</div>
                )
              )}
            </div>
            {pendingTx && (pendingTx.refundAmount || 0) > 0 && (<div className="modal-refund">💰 سيتم استرجاع: {pendingTx.refundAmount} جنيه</div>)}
            <div className="modal-btns">
              <button className="btn-m yes" onClick={() => confirmTx(true)}>✅ نعم، خصم من المخزون</button>
              <button className="btn-m no" onClick={() => confirmTx(false)}>❌ لا، بدون خصم</button>
              <button className="btn-m cancel" onClick={() => { setShowModal(false); setPendingTx(null); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="footer-logo">🕌</div>
        <div>مسجد التوفيق - حاسبة زكاة الفطر</div>
        <div className="footer-dua">🌙 تقبل الله منا ومنكم 🌙</div>
      </footer>
    </div>
  );
}

export default App;