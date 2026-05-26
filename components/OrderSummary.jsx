import { PlusIcon, SquarePenIcon, XIcon } from 'lucide-react';
import React, { useState, useEffect } from 'react'
import AddressModal from './AddressModal';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { useAuth } from '@clerk/nextjs';
import { useUser } from '@clerk/nextjs';
import { fetchCart } from '@/lib/features/cart/cartSlice';
import { paymentMethod } from '@/lib/constants';


const OrderSummary = ({ totalPrice, items, hasStockIssues = false }) => {

    const {getToken} = useAuth();
    const {user} = useUser();
    const dispatch = useDispatch();

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || '$';

    const router = useRouter();

    const addressList = useSelector(state => state.address.list);

    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(paymentMethod.BANK_TRANSFER);
    const [selectedAddress, setSelectedAddress] = useState(null);
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [couponCodeInput, setCouponCodeInput] = useState('');
    const [coupon, setCoupon] = useState('');
    const [paymentConfig, setPaymentConfig] = useState(null);

    useEffect(() => {
        axios.get('/api/payment-config').then(res => setPaymentConfig(res.data)).catch(() => null)
    }, []);

    const formatAmount = (amount) => `${currency}${Number(amount || 0).toLocaleString()}`

    const handleCouponCode = async (event) => {
        event.preventDefault();
        
        try {
            if(!user) {
                toast.error('Please login to apply coupon');
                return;
            }

            const token = await getToken();
            const {data} = await axios.post('/api/coupon', { code: couponCodeInput }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            setCoupon(data.coupon);
            toast.success('Coupon applied successfully');
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message);
        }
    }

    const handlePlaceOrder = async (e) => {
        e.preventDefault();

        try {
            if(!user) {
                toast.error('Please login to place order');
                return;
            }

            if(!selectedAddress) {
                toast.error('Please select an address');
                return;
            }

            const token = await getToken();

            const orderData = {
                items,
                addressId: selectedAddress.id,
                paymentMethod: selectedPaymentMethod,
                couponCode: couponCodeInput
            }
            
            if(coupon){
                orderData.couponCode = coupon.code;
            }

            const {data} = await axios.post('/api/orders', orderData, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            dispatch(fetchCart({getToken}))
            const ids = (data.orderIds || []).join(',')
            router.push(`/orders/confirmation${ids ? `?ids=${ids}` : ''}`)
        } catch (error) {
            console.error(error);
            toast.error(error?.response?.data?.error || error.message);
        }
    }

    return (
        <aside className='w-full max-w-lg lg:max-w-[360px] sticky top-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.08)]'>
            <div className='bg-[linear-gradient(135deg,_#0f172a_0%,_#16a34a_100%)] px-6 py-5 text-white'>
                <h2 className='text-xl font-semibold'>Review &amp; Pay</h2>
                <p className='mt-1 text-sm text-white/80'>Confirm your address and payment details before placing the order.</p>
            </div>

            <div className='space-y-6 p-6 text-sm text-slate-600'>
                <section>
                    <p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Payment Method</p>
                    <div className='mt-3 space-y-2'>
                        {/* MTN MoMo */}
                        <label htmlFor={paymentMethod.MTN_MOMO} className={`flex gap-3 items-start rounded-2xl border px-4 py-3 cursor-pointer transition ${selectedPaymentMethod === paymentMethod.MTN_MOMO ? 'border-yellow-300 bg-yellow-50' : 'border-slate-200 bg-slate-50'}`}>
                            <input
                                type="radio"
                                id={paymentMethod.MTN_MOMO}
                                name='payment'
                                onChange={() => setSelectedPaymentMethod(paymentMethod.MTN_MOMO)}
                                checked={selectedPaymentMethod === paymentMethod.MTN_MOMO}
                                className='mt-1 accent-yellow-500'
                            />
                            <div>
                                <span className='block font-medium text-slate-800'>MTN MoMo Pay</span>
                                <span className='block text-xs text-slate-500 mt-0.5'>
                                    {paymentConfig?.momoConfigured ? 'Pay code will be shown after placing order.' : 'Pay using mobile money.'}
                                </span>
                            </div>
                        </label>

                        {/* Bank Transfer */}
                        <label htmlFor={paymentMethod.BANK_TRANSFER} className={`flex gap-3 items-start rounded-2xl border px-4 py-3 cursor-pointer transition ${selectedPaymentMethod === paymentMethod.BANK_TRANSFER ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                            <input
                                type="radio"
                                id={paymentMethod.BANK_TRANSFER}
                                name='payment'
                                onChange={() => setSelectedPaymentMethod(paymentMethod.BANK_TRANSFER)}
                                checked={selectedPaymentMethod === paymentMethod.BANK_TRANSFER}
                                className='mt-1 accent-blue-600'
                            />
                            <div>
                                <span className='block font-medium text-slate-800'>Bank Transfer</span>
                                <span className='block text-xs text-slate-500 mt-0.5'>Bank details are sent via invoice email after you place the order.</span>
                            </div>
                        </label>
                    </div>
                </section>

                <section className='border-y border-slate-200 py-5'>
                    <p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Address</p>
                    {selectedAddress ? (
                        <div className='mt-3 flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3'>
                            <p className='text-slate-700'>{selectedAddress.name}, {selectedAddress.city}, {selectedAddress.state}, {selectedAddress.zip}</p>
                            <SquarePenIcon onClick={() => setSelectedAddress(null)} className='cursor-pointer text-slate-500 hover:text-slate-800 transition' size={18} />
                        </div>
                    ) : (
                        <div className='mt-3 space-y-3'>
                            {addressList.length > 0 && (
                                <select className='w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-green-500' onChange={(e) => setSelectedAddress(addressList[e.target.value])} >
                                    <option value="">Select Address</option>
                                    {addressList.map((address, index) => (
                                        <option key={index} value={index}>{address.name}, {address.city}, {address.state}, {address.zip}</option>
                                    ))}
                                </select>
                            )}
                            <button className='inline-flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-800 transition' onClick={() => setShowAddressModal(true)}>
                                Add Address <PlusIcon size={18} />
                            </button>
                        </div>
                    )}
                </section>

                <section className='space-y-4'>
                    <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                        <div className='flex justify-between gap-4'>
                            <div className='flex flex-col gap-1 text-slate-500'>
                                <p>Subtotal</p>
                                <p>Shipping</p>
                                {coupon && <p>Coupon</p>}
                            </div>
                            <div className='flex flex-col gap-1 font-medium text-right text-slate-800'>
                                <p>{formatAmount(totalPrice)}</p>
                                <p>Free in Kigali</p>
                                {coupon && <p>{`-${formatAmount((coupon.discount / 100) * totalPrice)}`}</p>}
                            </div>
                        </div>

                        {!coupon ? (
                            <form onSubmit={e => toast.promise(handleCouponCode(e), { loading: 'Checking Coupon...' })} className='mt-4 flex gap-2'>
                                <input onChange={(e) => setCouponCodeInput(e.target.value)} value={couponCodeInput} type="text" placeholder='Coupon code' className='w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-green-500' />
                                <button className='rounded-xl bg-slate-800 px-4 py-2 font-medium text-white transition hover:bg-slate-900 active:scale-95'>Apply</button>
                            </form>
                        ) : (
                            <div className='mt-4 flex items-start justify-between gap-3 rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-xs text-slate-600'>
                                <div>
                                    <p className='font-medium text-green-800'>Code: <span className='ml-1'>{coupon.code.toUpperCase()}</span></p>
                                    <p className='mt-1'>{coupon.description}</p>
                                </div>
                                <XIcon size={18} onClick={() => setCoupon('')} className='cursor-pointer text-slate-500 transition hover:text-red-700' />
                            </div>
                        )}
                    </div>

                    <div className='flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-4 text-white'>
                        <p className='font-medium'>Total</p>
                        <p className='text-lg font-semibold'>{coupon ? formatAmount(totalPrice - ((coupon.discount / 100) * totalPrice)) : formatAmount(totalPrice)}</p>
                    </div>

                    <button
                        onClick={e => !hasStockIssues && toast.promise(handlePlaceOrder(e), { loading: 'Placing order...' })}
                        disabled={hasStockIssues}
                        title={hasStockIssues ? 'Remove out-of-stock items before placing order' : undefined}
                        className='w-full rounded-full bg-[linear-gradient(135deg,_#16a34a_0%,_#0f172a_100%)] py-3 font-semibold text-white shadow-[0_12px_30px_rgba(22,163,74,0.24)] transition hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0'>
                        Place Order
                    </button>
                </section>
            </div>

            {showAddressModal && <AddressModal setShowAddressModal={setShowAddressModal} />}
        </aside>
    )
}

export default OrderSummary