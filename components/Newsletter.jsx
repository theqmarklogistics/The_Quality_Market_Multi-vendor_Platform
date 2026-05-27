'use client'
import { useState } from 'react'
import Title from './Title'

const Newsletter = () => {

    const [email, setEmail] = useState('')
    const [status, setStatus] = useState(null) // null | 'loading' | 'success' | 'error' | 'duplicate'
    const [message, setMessage] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setStatus('loading')
        setMessage('')
        try {
            const res = await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })
            const data = await res.json()
            if (res.ok) {
                setStatus('success')
                setMessage(data.message)
                setEmail('')
            } else if (res.status === 409) {
                setStatus('duplicate')
                setMessage(data.message)
            } else {
                setStatus('error')
                setMessage(data.error || 'Something went wrong. Please try again.')
            }
        } catch {
            setStatus('error')
            setMessage('Something went wrong. Please try again.')
        }
    }

    return (
        <div className='flex flex-col items-center mx-4 my-36'>
            <Title
                title="Join Newsletter"
                description="Subscribe to get exclusive deals, new arrivals, and insider updates delivered straight to your inbox every week."
                visibleButton={false}
            />
            <div className='w-full max-w-2xl my-10 rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_10px_35px_rgba(15,23,42,0.06)]'>
                {status === 'success' ? (
                    <div className='flex items-center justify-center gap-2 py-4 px-6'>
                        <span className='text-green-500 text-lg'>✓</span>
                        <p className='text-slate-700 font-medium text-sm text-center'>{message}</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className='flex items-center gap-3 rounded-2xl bg-slate-50 p-2'>
                        <input
                            type='email'
                            required
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className='flex-1 bg-transparent pl-4 outline-none text-sm placeholder:text-slate-400'
                            placeholder='Enter your email address'
                            disabled={status === 'loading'}
                        />
                        <button
                            type='submit'
                            disabled={status === 'loading'}
                            className='font-medium bg-slate-800 text-white px-6 py-3 rounded-2xl hover:bg-slate-900 hover:-translate-y-0.5 active:scale-95 transition disabled:opacity-60 disabled:translate-y-0 disabled:scale-100'
                        >
                            {status === 'loading' ? 'Subscribing…' : 'Get Updates'}
                        </button>
                    </form>
                )}
            </div>
            {(status === 'error' || status === 'duplicate') && (
                <p className='text-sm text-slate-500 -mt-4 text-center'>{message}</p>
            )}
        </div>
    )
}

export default Newsletter
