"use client"
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { productCategories } from '@/lib/constants'

const SELLER_MODEL_OPTIONS = [
  { value: 'LOCAL_SELLER', label: 'Local Seller (Semi-Managed)' },
  { value: 'FULL_MANAGED', label: 'Full Managed' },
  { value: '', label: 'All models (applies to both)' },
]

export default function CommissionForm({ initialData = null, onSaved = () => {}, onCancel }) {
  const [category, setCategory] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [sellerModel, setSellerModel] = useState('LOCAL_SELLER')
  const [percent, setPercent] = useState('')
  const [fixedAmount, setFixedAmount] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initialData) {
      const known = productCategories.includes(initialData.category)
      setUseCustom(!known)
      setCategory(known ? initialData.category : '')
      setCustomCategory(known ? '' : (initialData.category || ''))
      setSellerModel(initialData.sellerModel || 'LOCAL_SELLER')
      setPercent(initialData.percent ?? '')
      setFixedAmount(initialData.fixedAmount ?? '')
    } else {
      setCategory('')
      setCustomCategory('')
      setUseCustom(false)
      setSellerModel('LOCAL_SELLER')
      setPercent('')
      setFixedAmount('')
    }
  }, [initialData])

  async function handleSubmit(e) {
    e.preventDefault()
    const finalCategory = useCustom ? customCategory.trim() : category
    if (!finalCategory) return toast.error('Please select or enter a category')
    if (percent === '' && fixedAmount === '') return toast.error('Enter a percent or fixed amount')

    setLoading(true)
    try {
      const payload = {
        category: finalCategory,
        sellerModel: sellerModel || null,
        percent: percent !== '' ? Number(percent) : null,
        fixedAmount: fixedAmount !== '' ? Number(fixedAmount) : null
      }
      const res = initialData?.id
        ? await fetch(`/api/admin/commissions/${initialData.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/admin/commissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save commission')
      }
      toast.success(initialData?.id ? 'Commission updated' : 'Commission created')
      onSaved()
    } catch (err) {
      toast.error(err.message)
    } finally { setLoading(false) }
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400'
  const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow-sm border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-slate-800">{initialData ? 'Edit Commission Rule' : 'New Commission Rule'}</h3>

      <div>
        <label className={labelCls}>Seller Model</label>
        <select className={inputCls} value={sellerModel} onChange={e => setSellerModel(e.target.value)}>
          {SELLER_MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={labelCls.replace('mb-1', '')}>Category</label>
          <button type="button" onClick={() => setUseCustom(v => !v)} className="text-xs text-blue-600 hover:underline">
            {useCustom ? 'Choose from list' : 'Add custom category'}
          </button>
        </div>
        {useCustom ? (
          <input className={inputCls} placeholder="Enter new category name…" value={customCategory} onChange={e => setCustomCategory(e.target.value)} />
        ) : (
          <select className={inputCls} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">— Select category —</option>
            {productCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Percent (%)</label>
          <input type="number" step="0.01" min="0" className={inputCls} placeholder="e.g. 15" value={percent} onChange={e => setPercent(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Fixed Amount (Rwf)</label>
          <input type="number" step="0.01" min="0" className={inputCls} placeholder="0" value={fixedAmount} onChange={e => setFixedAmount(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">Cancel</button>}
        <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition disabled:opacity-60">
          {loading ? 'Saving…' : (initialData ? 'Update' : 'Create')}
        </button>
      </div>
    </form>
  )
}
