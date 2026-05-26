'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import axios from 'axios'
import toast from 'react-hot-toast'
import Image from 'next/image'
import { ImageIcon, SaveIcon } from 'lucide-react'

const ACCENT_SWATCHES = [
    { label: 'Orange', value: '#FFAD51' },
    { label: 'Blue', value: '#78B2FF' },
    { label: 'Green', value: '#34D399' },
    { label: 'Purple', value: '#A78BFA' },
    { label: 'Pink', value: '#F472B6' },
    { label: 'Red', value: '#F87171' },
]

const SLOT_LABELS = { main: 'Main Banner', card1: 'Card 1 (top-right)', card2: 'Card 2 (bottom-right)' }

function ImageUploadBox({ preview, onFile }) {
    const ref = useRef()
    return (
        <div
            onClick={() => ref.current.click()}
            className="relative flex flex-col items-center justify-center h-40 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-slate-400 transition bg-slate-50 overflow-hidden"
        >
            {preview ? (
                <Image src={preview} alt="preview" fill className="object-contain p-2" />
            ) : (
                <>
                    <ImageIcon size={28} className="text-slate-300 mb-2" />
                    <p className="text-xs text-slate-400">Click to upload image</p>
                </>
            )}
            <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => onFile(e.target.files[0])} />
        </div>
    )
}

export default function AdminHero() {
    const { getToken } = useAuth()
    const [configs, setConfigs] = useState(null)
    const [forms, setForms] = useState({})
    const [previews, setPreviews] = useState({})
    const [files, setFiles] = useState({})
    const [saving, setSaving] = useState({})

    useEffect(() => {
        axios.get('/api/hero').then(({ data }) => {
            setConfigs(data)
            setForms({
                main: {
                    badgeText: data.main?.badgeText || '',
                    headline: data.main?.headline || '',
                    description: data.main?.description || '',
                    startingPrice: data.main?.startingPrice || '',
                    cta1Label: data.main?.cta1Label || '',
                    cta1Href: data.main?.cta1Href || '',
                    cta2Label: data.main?.cta2Label || '',
                    cta2Href: data.main?.cta2Href || '',
                },
                card1: {
                    cardTitle: data.card1?.cardTitle || '',
                    accentColor: data.card1?.accentColor || '#FFAD51',
                    linkLabel: data.card1?.linkLabel || '',
                    linkHref: data.card1?.linkHref || '',
                },
                card2: {
                    cardTitle: data.card2?.cardTitle || '',
                    accentColor: data.card2?.accentColor || '#78B2FF',
                    linkLabel: data.card2?.linkLabel || '',
                    linkHref: data.card2?.linkHref || '',
                },
            })
            setPreviews({
                main: data.main?.imageUrl || null,
                card1: data.card1?.imageUrl || null,
                card2: data.card2?.imageUrl || null,
            })
        }).catch(() => toast.error('Failed to load hero config'))
    }, [])

    const setField = (slot, key, value) => {
        setForms(prev => ({ ...prev, [slot]: { ...prev[slot], [key]: value } }))
    }

    const handleFile = (slot, file) => {
        if (!file) return
        setFiles(prev => ({ ...prev, [slot]: file }))
        setPreviews(prev => ({ ...prev, [slot]: URL.createObjectURL(file) }))
    }

    const save = async (slot) => {
        setSaving(prev => ({ ...prev, [slot]: true }))
        try {
            const token = await getToken()
            const fd = new FormData()
            fd.append('slot', slot)
            for (const [k, v] of Object.entries(forms[slot])) fd.append(k, v)
            if (files[slot]) fd.append('image', files[slot])
            await axios.put('/api/admin/hero', fd, { headers: { Authorization: `Bearer ${token}` } })
            toast.success(`${SLOT_LABELS[slot]} saved`)
            setFiles(prev => ({ ...prev, [slot]: null }))
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message)
        } finally {
            setSaving(prev => ({ ...prev, [slot]: false }))
        }
    }

    if (!configs) return <p className="text-slate-400">Loading…</p>

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl mb-6">Hero <span className="text-slate-800 font-medium">Banner Editor</span></h1>
            <div className="flex flex-col gap-8">

                {/* Main banner */}
                <section className="border border-slate-200 rounded-2xl p-6 bg-white">
                    <h2 className="text-lg font-medium text-slate-700 mb-5">Main Banner</h2>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-3">
                            <Field label="Badge text" value={forms.main?.badgeText} onChange={v => setField('main', 'badgeText', v)} />
                            <Field label="Headline" value={forms.main?.headline} onChange={v => setField('main', 'headline', v)} multiline />
                            <Field label="Description" value={forms.main?.description} onChange={v => setField('main', 'description', v)} multiline />
                            <Field label="Starting price (number only)" value={forms.main?.startingPrice} onChange={v => setField('main', 'startingPrice', v)} placeholder="e.g. 4.9K" />
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="CTA 1 label" value={forms.main?.cta1Label} onChange={v => setField('main', 'cta1Label', v)} />
                                <Field label="CTA 1 link" value={forms.main?.cta1Href} onChange={v => setField('main', 'cta1Href', v)} placeholder="/shop" />
                                <Field label="CTA 2 label" value={forms.main?.cta2Label} onChange={v => setField('main', 'cta2Label', v)} />
                                <Field label="CTA 2 link" value={forms.main?.cta2Href} onChange={v => setField('main', 'cta2Href', v)} placeholder="/create-store" />
                            </div>
                        </div>
                        <div className="flex flex-col gap-3">
                            <p className="text-xs text-slate-500 font-medium">Product / model image</p>
                            <ImageUploadBox preview={previews.main} onFile={f => handleFile('main', f)} />
                        </div>
                    </div>
                    <SaveButton slot="main" saving={saving.main} onSave={() => save('main')} />
                </section>

                {/* Card 1 */}
                <CardSection slot="card1" label="Card 1 — Top Right" form={forms.card1} preview={previews.card1}
                    setField={setField} handleFile={handleFile} saving={saving.card1} onSave={() => save('card1')} />

                {/* Card 2 */}
                <CardSection slot="card2" label="Card 2 — Bottom Right" form={forms.card2} preview={previews.card2}
                    setField={setField} handleFile={handleFile} saving={saving.card2} onSave={() => save('card2')} />
            </div>
        </div>
    )
}

function CardSection({ slot, label, form, preview, setField, handleFile, saving, onSave }) {
    return (
        <section className="border border-slate-200 rounded-2xl p-6 bg-white">
            <h2 className="text-lg font-medium text-slate-700 mb-5">{label}</h2>
            <div className="grid md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-3">
                    <Field label="Card title" value={form?.cardTitle} onChange={v => setField(slot, 'cardTitle', v)} />
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Link label" value={form?.linkLabel} onChange={v => setField(slot, 'linkLabel', v)} placeholder="View more" />
                        <Field label="Link href" value={form?.linkHref} onChange={v => setField(slot, 'linkHref', v)} placeholder="/shop" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-medium mb-2">Accent colour</p>
                        <div className="flex flex-wrap gap-2">
                            {ACCENT_SWATCHES.map(s => (
                                <button key={s.value} title={s.label} onClick={() => setField(slot, 'accentColor', s.value)}
                                    className={`w-7 h-7 rounded-full border-2 transition ${form?.accentColor === s.value ? 'border-slate-700 scale-110' : 'border-transparent'}`}
                                    style={{ backgroundColor: s.value }} />
                            ))}
                            <input type="color" value={form?.accentColor || '#FFAD51'} onChange={e => setField(slot, 'accentColor', e.target.value)}
                                className="w-7 h-7 rounded-full cursor-pointer border border-slate-200" title="Custom colour" />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">Selected: {form?.accentColor}</p>
                    </div>
                </div>
                <div className="flex flex-col gap-3">
                    <p className="text-xs text-slate-500 font-medium">Product image</p>
                    <ImageUploadBox preview={preview} onFile={f => handleFile(slot, f)} />
                </div>
            </div>
            <SaveButton slot={slot} saving={saving} onSave={onSave} />
        </section>
    )
}

function Field({ label, value, onChange, multiline, placeholder }) {
    const cls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400 resize-none"
    return (
        <div>
            <label className="block text-xs text-slate-500 font-medium mb-1">{label}</label>
            {multiline
                ? <textarea rows={3} className={cls} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
                : <input className={cls} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
            }
        </div>
    )
}

function SaveButton({ saving, onSave }) {
    return (
        <button onClick={onSave} disabled={saving}
            className="mt-5 inline-flex items-center gap-2 bg-slate-800 text-white text-sm px-6 py-2.5 rounded-full hover:bg-slate-900 disabled:opacity-50 transition">
            <SaveIcon size={15} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
    )
}
