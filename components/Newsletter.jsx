import React from 'react'
import Title from './Title'

const Newsletter = () => {
    return (
        <div className='flex flex-col items-center mx-4 my-36'>
            <Title title="Join Newsletter" description="Subscribe to get exclusive deals, new arrivals, and insider updates delivered straight to your inbox every week." visibleButton={false} />
            <div className='w-full max-w-2xl my-10 rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_10px_35px_rgba(15,23,42,0.06)]'>
                <div className='flex items-center gap-3 rounded-2xl bg-slate-50 p-2'>
                    <input className='flex-1 bg-transparent pl-4 outline-none text-sm placeholder:text-slate-400' type="text" placeholder='Enter your email address' />
                    <button className='font-medium bg-slate-800 text-white px-6 py-3 rounded-2xl hover:bg-slate-900 hover:-translate-y-0.5 active:scale-95 transition'>Get Updates</button>
                </div>
            </div>
        </div>
    )
}

export default Newsletter