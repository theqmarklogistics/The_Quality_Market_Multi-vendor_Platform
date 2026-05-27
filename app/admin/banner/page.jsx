'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import axios from 'axios'
import toast from 'react-hot-toast'
import { MegaphoneIcon, SaveIcon } from 'lucide-react'

const DEFAULT_FORM = {
    isActive: false,
    text: 'Get 20% OFF on your first order with code NEW20.',
    couponCode: 'NEW20',
}

export default function AdminBanner() {
    const { getToken } = useAuth()
    const [form, setForm] = useState(DEFAULT_FORM)
    const [lastUpdated, setLastUpdated] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        axios.get('/api/admin/banner')
            .then(({ data }) => {
                setForm({
                    isActive: data.isActive ?? false,
                    text: data.text ?? '',
                    couponCode: data.couponCode ?? '',
                })
                setLastUpdated(data.updatedAt ?? null)
            })
            .catch(() => toast.error('Failed to load banner config'))
            .finally(() => setLoading(false))
    }, [])

    const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

    const save = async () => {
        setSaving(true)
        try {
            const token = await getToken()
            const { data } = await axios.put('/api/admin/banner', form, {
                headers: { Authorization: `Bearer ${token}` },
            })
            setLastUpdated(data.config?.updatedAt ?? null)
            toast.success('Banner settings saved')
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <p className="text-slate-400">Loading…</p>

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl mb-6">Announcement <span className="text-slate-800 font-medium">Banner</span></h1>

            <section className="border border-slate-200 rounded-2xl p-6 bg-white max-w-2xl">
                <div className="flex items-center gap-3 mb-6">
                    <MegaphoneIcon size={20} className="text-slate-400" />
                    <h2 className="text-lg font-medium text-slate-700">Banner Settings</h2>
                </div>

                <div className="flex flex-col gap-5">
                    {/* Active toggle */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <div>
                            <p className="text-sm font-medium text-slate-700">Banner visibility</p>
                            <p className="text-xs text-slate-400 mt-0.5">When active, the banner is shown to all visitors</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setField('isActive', !form.isActive)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${form.isActive ? 'bg-green-500' : 'bg-slate-300'}`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${form.isActive ? 'translate-x-6' : 'translate-x-1'}`}
                            />
                        </button>
                    </div>

                    {/* Status indicator */}
                    <div className={`inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full w-fit ${form.isActive ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${form.isActive ? 'bg-green-500' : 'bg-slate-400'}`} />
                        {form.isActive ? 'Active — visible to all visitors' : 'Inactive — hidden from visitors'}
                    </div>

                    {/* Banner text */}
                    <div>
                        <label className="block text-xs text-slate-500 font-medium mb-1">Banner message</label>
                        <textarea
                            rows={2}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400 resize-none"
                            value={form.text}
                            onChange={e => setField('text', e.target.value)}
                            placeholder="e.g. Get 20% OFF on your first order with code NEW20."
                        />
                        <p className="text-[11px] text-slate-400 mt-1">This text will appear in the banner. Keep it short and clear.</p>
                    </div>

                    {/* Coupon code */}
                    <div>
                        <label className="block text-xs text-slate-500 font-medium mb-1">Coupon code <span className="font-normal text-slate-400">(optional — leave blank for text-only banner)</span></label>
                        <input
                            type="text"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400 uppercase tracking-widest"
                            value={form.couponCode}
                            onChange={e => setField('couponCode', e.target.value)}
                            placeholder="e.g. NEW20"
                            maxLength={30}
                        />
                        <p className="text-[11px] text-slate-400 mt-1">If set, a &quot;Copy code&quot; button will appear in the banner.</p>
                    </div>

                    {/* Preview */}
                    {form.isActive && form.text && (
                        <div>
                            <p className="text-xs text-slate-500 font-medium mb-2">Preview</p>
                            <div className="w-full px-4 py-2 text-sm text-white bg-[linear-gradient(90deg,_#0f172a,_#16a34a)] rounded-xl">
                                <div className="flex items-center justify-between gap-4">
                                    <p className="font-medium">{form.text}</p>
                                    {form.couponCode && (
                                        <span className="font-medium text-slate-900 bg-white px-4 py-1 rounded-full text-xs shrink-0">Copy code</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Last updated */}
                    {lastUpdated && (
                        <p className="text-[11px] text-slate-400">
                            Last saved: {new Date(lastUpdated).toLocaleString()}
                        </p>
                    )}
                </div>

                <button
                    onClick={save}
                    disabled={saving}
                    className="mt-6 inline-flex items-center gap-2 bg-slate-800 text-white text-sm px-6 py-2.5 rounded-full hover:bg-slate-900 disabled:opacity-50 transition"
                >
                    <SaveIcon size={15} />
                    {saving ? 'Saving…' : 'Save changes'}
                </button>
            </section>
        </div>
    )
}
