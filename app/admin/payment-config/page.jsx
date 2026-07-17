'use client'

import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"

const PaymentConfigPage = () => {
    const { getToken } = useAuth()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({
        momoPayCode: '',
        momoAccountName: '',
        bankName: '',
        bankAccountNumber: '',
        bankAccountName: '',
        bankBranch: '',
        ekashNumber: '',
        ekashAccountName: '',
    })

    useEffect(() => {
        const load = async () => {
            try {
                const token = await getToken()
                const { data } = await axios.get('/api/admin/payment-config', {
                    headers: { Authorization: `Bearer ${token}` }
                })
                const config = data.config || data || {}
                setForm({
                    momoPayCode: config.momoPayCode || '',
                    momoAccountName: config.momoAccountName || '',
                    bankName: config.bankName || '',
                    bankAccountNumber: config.bankAccountNumber || '',
                    bankAccountName: config.bankAccountName || '',
                    bankBranch: config.bankBranch || '',
                    ekashNumber: config.ekashNumber || '',
                    ekashAccountName: config.ekashAccountName || '',
                })
            } catch {
                toast.error('Failed to load payment config')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const handleChange = (e) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const token = await getToken()
            await axios.put('/api/admin/payment-config', form, {
                headers: { Authorization: `Bearer ${token}` }
            })
            toast.success('Payment configuration saved')
        } catch {
            toast.error('Failed to save payment config')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    return (
        <div className="p-6 max-w-2xl">
            <h1 className="text-2xl font-semibold text-slate-800 mb-1">Payment Configuration</h1>
            <p className="text-sm text-slate-500 mb-8">Configure MTN MoMo, Bank Transfer, and eKash payment details.</p>

            <div className="space-y-8">
                {/* MTN MoMo Section */}
                <div className="rounded-xl border border-slate-200 bg-white p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
                            <span className="text-yellow-700 text-base font-bold">M</span>
                        </div>
                        <h2 className="text-base font-semibold text-slate-700">MTN MoMo Pay</h2>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Pay Code</label>
                            <input
                                name="momoPayCode"
                                value={form.momoPayCode}
                                onChange={handleChange}
                                placeholder="e.g. *182*8*1*PAYCODE#"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                            <p className="text-xs text-slate-400 mt-1">Displayed to customer on the order confirmation page when they select MoMo.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Account Name</label>
                            <input
                                name="momoAccountName"
                                value={form.momoAccountName}
                                onChange={handleChange}
                                placeholder="e.g. The Quality Market"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                            <p className="text-xs text-slate-400 mt-1">Name the customer will see when making the MoMo payment.</p>
                        </div>
                    </div>
                </div>

                {/* Bank Transfer Section */}
                <div className="rounded-xl border border-slate-200 bg-white p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-blue-700 text-base font-bold">B</span>
                        </div>
                        <h2 className="text-base font-semibold text-slate-700">Bank Transfer</h2>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Bank Name</label>
                            <input
                                name="bankName"
                                value={form.bankName}
                                onChange={handleChange}
                                placeholder="e.g. Bank of Kigali"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Account Number</label>
                            <input
                                name="bankAccountNumber"
                                value={form.bankAccountNumber}
                                onChange={handleChange}
                                placeholder="e.g. 00012345678901"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Account Owner Name</label>
                            <input
                                name="bankAccountName"
                                value={form.bankAccountName}
                                onChange={handleChange}
                                placeholder="e.g. The Quality Market Ltd"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Branch <span className="text-slate-400">(optional)</span></label>
                            <input
                                name="bankBranch"
                                value={form.bankBranch}
                                onChange={handleChange}
                                placeholder="e.g. Kigali Main Branch"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                        </div>
                    </div>
                </div>

                {/* eKash Section */}
                <div className="rounded-xl border border-slate-200 bg-white p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                            <span className="text-emerald-700 text-base font-bold">e</span>
                        </div>
                        <h2 className="text-base font-semibold text-slate-700">eKash</h2>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">eKash Number</label>
                            <input
                                name="ekashNumber"
                                value={form.ekashNumber}
                                onChange={handleChange}
                                placeholder="e.g. 0788 123 456"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                            <p className="text-xs text-slate-400 mt-1">The eKash number customers send payment to. Displayed to the customer on the order confirmation page when they select eKash.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Account Name <span className="text-slate-400">(optional)</span></label>
                            <input
                                name="ekashAccountName"
                                value={form.ekashAccountName}
                                onChange={handleChange}
                                placeholder="e.g. The Quality Market"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                            <p className="text-xs text-slate-400 mt-1">Name the customer will see when sending the eKash payment.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition"
                >
                    {saving ? 'Saving...' : 'Save Configuration'}
                </button>
            </div>
        </div>
    )
}

export default PaymentConfigPage
