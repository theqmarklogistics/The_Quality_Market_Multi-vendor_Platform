'use client'
import Image from "next/image";
import Link from "next/link";
import { DotIcon, MessageCircleIcon, RotateCcwIcon, FileTextIcon, CheckIcon, TruckIcon, DownloadIcon } from "lucide-react";
import { useSelector } from "react-redux";
import Rating from "./Rating";
import { useState } from "react";
import RatingModal from "./RatingModal";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

const OrderItem = ({ order, onProofUploaded }) => {

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || '$';
    const [ratingModal, setRatingModal] = useState(null);
    const [returnModal, setReturnModal] = useState(false);
    const [returnReason, setReturnReason] = useState('');
    const [invoiceRequested, setInvoiceRequested] = useState(order.invoiceRequested || false);
    const [invoiceSentNow, setInvoiceSentNow] = useState(false);
    const [invoiceRequesting, setInvoiceRequesting] = useState(false);
    const { getToken } = useAuth();
    const router = useRouter();

    const { ratings } = useSelector(state => state.rating);

    const uploadPaymentProof = async (file) => {
        if (!file) return;
        try {
            const token = await getToken();
            const formData = new FormData();
            formData.append('orderId', order.id);
            formData.append('proofFile', file);
            const { data } = await axios.post('/api/orders/payment-proof', formData, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            toast.success(data.message);
            if (typeof onProofUploaded === 'function') {
                await onProofUploaded();
            }
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message);
        }
    };

    const paymentProofLabel = {
        NOT_SUBMITTED: 'Proof not submitted',
        SUBMITTED: 'Proof submitted, awaiting admin review',
        APPROVED: 'Payment approved by admin',
        REJECTED: 'Proof rejected, please upload again'
    };

    const cancelOrder = async () => {
        try {
            const token = await getToken();
            await axios.post(`/api/orders/${order.id}/cancel`, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success('Order cancelled');
            if (typeof onProofUploaded === 'function') await onProofUploaded();
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message);
        }
    };

    const submitReturn = async () => {
        if (!returnReason.trim()) return toast.error('Please provide a reason');
        try {
            const token = await getToken();
            const { data } = await axios.post(`/api/orders/${order.id}/return`, { reason: returnReason }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(data.message);
            setReturnModal(false);
            setReturnReason('');
            if (typeof onProofUploaded === 'function') await onProofUploaded();
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message);
        }
    };

    const startConversation = async (targetType) => {
        try {
            const token = await getToken();
            const payload = targetType === 'STORE' ? { targetType, orderId: order.id } : { targetType };
            const { data } = await axios.post('/api/chat/conversations', payload, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            router.push(`/chat/${data.conversation.id}`);
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message);
        }
    };

    const downloadInvoice = async () => {
        try {
            const token = await getToken()
            const res = await axios.get(`/api/orders/${order.id}/invoice`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob',
            })
            const url = URL.createObjectURL(res.data)
            const a = document.createElement('a')
            a.href = url
            a.download = `${order.invoice?.paymentReference || 'invoice'}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Failed to download invoice')
        }
    }

    const requestInvoice = async () => {
        setInvoiceRequesting(true)
        try {
            const token = await getToken()
            const { data } = await axios.post(`/api/orders/${order.id}/request-invoice`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (order.paymentMethod === 'MTN_MOMO') {
                setInvoiceSentNow(true)
            } else {
                setInvoiceRequested(true)
            }
            toast.success(data.message)
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Failed to request invoice')
        } finally {
            setInvoiceRequesting(false)
        }
    }

    const showInvoiceAction = order.paymentStatus === 'PENDING'
    const invoiceSent = order.invoiceStatus === 'SENT' || invoiceSentNow

    // Pooled-delivery orders have a live rider-tracking portal at /track/[orderId].
    const canTrack = order.deliveryType === 'KIGALI_POOL'

    return (
        <>
            <tr className="text-sm">
                <td className="text-left">
                    <div className="flex flex-col gap-6">
                        {order.orderItems.map((item, index) => (
                            <div key={index} className="flex items-center gap-4">
                                <div className="w-20 aspect-square bg-slate-100 flex items-center justify-center rounded-md">
                                    <Image
                                        className="h-14 w-auto"
                                        src={item.product.images[0]}
                                        alt="product_img"
                                        width={50}
                                        height={50}
                                    />
                                </div>
                                <div className="flex flex-col justify-center text-sm">
                                    <p className="font-medium text-slate-600 text-base">{item.product.name}</p>
                                    <p>{currency}{item.price} Qty : {item.quantity} </p>
                                    <p className="mb-1">{new Date(order.createdAt).toDateString()}</p>
                                    <p className="text-xs text-slate-500">{paymentProofLabel[order.paymentProofStatus] || 'Proof status unknown'}</p>
                                    {order.paymentProofStatus === 'REJECTED' && order.paymentProofNotes && (
                                        <p className="text-xs text-red-600">Reason: {order.paymentProofNotes}</p>
                                    )}
                                    {(order.paymentProofStatus === 'NOT_SUBMITTED' || order.paymentProofStatus === 'REJECTED') && (
                                        <label className="text-xs text-blue-600 hover:underline cursor-pointer mt-1 inline-block">
                                            Upload payment proof
                                            <input
                                                type="file"
                                                accept="image/*,.pdf"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        toast.promise(uploadPaymentProof(file), { loading: 'Uploading proof...' });
                                                    }
                                                }}
                                            />
                                        </label>
                                    )}
                                    {order.invoice && (
                                        <button
                                            onClick={() => toast.promise(downloadInvoice(), { loading: 'Preparing invoice…' })}
                                            className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                        >
                                            <DownloadIcon size={11} /> Download Invoice {order.invoice.paymentReference}
                                        </button>
                                    )}
                                    {showInvoiceAction && (
                                        <div className="mt-1">
                                            {invoiceSent ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                                    <CheckIcon size={11} /> Invoice sent to your email
                                                </span>
                                            ) : order.invoice ? null : invoiceRequested ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                                    <FileTextIcon size={11} /> Invoice requested, awaiting admin
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => toast.promise(requestInvoice(), { loading: 'Requesting invoice...' })}
                                                    disabled={invoiceRequesting}
                                                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-60"
                                                >
                                                    <FileTextIcon size={11} />
                                                    Request Invoice
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    <div>
                                        {ratings.find(rating => order.id === rating.orderId && item.product.id === rating.productId)
                                            ? <Rating value={ratings.find(rating => order.id === rating.orderId && item.product.id === rating.productId).rating} />
                                            : <button onClick={() => setRatingModal({ orderId: order.id, productId: item.product.id })} className={`text-green-500 hover:bg-green-50 transition ${order.status !== "DELIVERED" && 'hidden'}`}>Rate Product</button>
                                        }</div>
                                    {ratingModal && <RatingModal ratingModal={ratingModal} setRatingModal={setRatingModal} />}
                                </div>
                            </div>
                        ))}
                    </div>
                </td>

                <td className="text-center max-md:hidden">
                    <p className="font-medium">{currency}{Number(order.total).toLocaleString()}</p>
                    {order.shippingQuoted && Number(order.shippingCost) > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">incl. {currency}{Number(order.shippingCost).toLocaleString()} shipping</p>
                    )}
                    {!order.shippingQuoted && (
                        <p className="text-xs text-amber-600 mt-0.5">+ shipping pending</p>
                    )}
                </td>

                <td className="text-left max-md:hidden">
                    <p>{order.address.name}, {order.address.street},</p>
                    <p>{order.address.city}, {order.address.state}, {order.address.zip}, {order.address.country},</p>
                    <p>{order.contactPhone || order.address.phone}</p>
                    {order.address.email && <p className="text-xs text-slate-400 break-all">{order.address.email}</p>}
                </td>

                <td className="text-left space-y-2 text-sm max-md:hidden">
                    <div
                        className={`flex items-center justify-center gap-1 rounded-full p-1 ${order.status === 'confirmed'
                            ? 'text-yellow-500 bg-yellow-100'
                            : order.status === 'delivered'
                                ? 'text-green-500 bg-green-100'
                                : 'text-slate-500 bg-slate-100'
                            }`}
                    >
                        <DotIcon size={10} className="scale-250" />
                        {order.status.split('_').join(' ').toLowerCase()}
                    </div>
                    {canTrack && (
                        <Link href={`/track/${order.id}`} className="flex items-center justify-center gap-1.5 rounded-full bg-green-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-green-700 transition">
                            <TruckIcon size={14} /> Track Delivery
                        </Link>
                    )}
                    <button onClick={() => toast.promise(startConversation('ADMIN'), { loading: 'Opening admin chat...' })} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                        <MessageCircleIcon size={14} /> Chat Admin
                    </button>
                    <button onClick={() => toast.promise(startConversation('STORE'), { loading: 'Opening store chat...' })} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 ml-2">
                        <MessageCircleIcon size={14} /> Chat Store
                    </button>
                    {order.paymentStatus === 'PENDING' && (
                        <button onClick={() => toast.promise(cancelOrder(), { loading: 'Cancelling order...' })} className="text-xs text-red-500 hover:underline inline-flex items-center gap-1 mt-1">
                            Cancel Order
                        </button>
                    )}
                    {order.status === 'DELIVERED' && !order.returnRequest && (
                        <button onClick={() => setReturnModal(true)} className="text-xs text-orange-600 hover:underline inline-flex items-center gap-1 mt-1">
                            <RotateCcwIcon size={12} /> Request Return
                        </button>
                    )}
                    {order.returnRequest && (
                        <span className="text-xs text-slate-400 mt-1 inline-block">Return: {order.returnRequest.status}</span>
                    )}
                </td>
            </tr>
            {/* Mobile */}
            <tr className="md:hidden">
                <td colSpan={5}>
                    <p>{order.address.name}, {order.address.street}</p>
                    <p>{order.address.city}, {order.address.state}, {order.address.zip}, {order.address.country}</p>
                    <p>{order.contactPhone || order.address.phone}</p>
                    {order.address.email && <p className="text-xs text-slate-400 break-all">{order.address.email}</p>}
                    <br />
                    <div className="flex items-center">
                        <span className='text-center mx-auto px-6 py-1.5 rounded bg-green-100 text-green-700' >
                            {order.status.replace(/_/g, ' ').toLowerCase()}
                        </span>
                    </div>
                    <div className="flex gap-4 justify-center mt-3 flex-wrap">
                        {canTrack && (
                            <Link href={`/track/${order.id}`} className="text-xs text-green-600 hover:underline inline-flex items-center gap-1 font-semibold">
                                <TruckIcon size={14} /> Track
                            </Link>
                        )}
                        <button onClick={() => toast.promise(startConversation('ADMIN'), { loading: 'Opening admin chat...' })} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                            <MessageCircleIcon size={14} /> Admin
                        </button>
                        <button onClick={() => toast.promise(startConversation('STORE'), { loading: 'Opening store chat...' })} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                            <MessageCircleIcon size={14} /> Store
                        </button>
                        {order.paymentStatus === 'PENDING' && (
                            <button onClick={() => toast.promise(cancelOrder(), { loading: 'Cancelling order...' })} className="text-xs text-red-500 hover:underline inline-flex items-center gap-1">
                                Cancel
                            </button>
                        )}
                        {order.status === 'DELIVERED' && !order.returnRequest && (
                            <button onClick={() => setReturnModal(true)} className="text-xs text-orange-600 hover:underline inline-flex items-center gap-1">
                                <RotateCcwIcon size={12} /> Return
                            </button>
                        )}
                    </div>
                </td>
            </tr>
            <tr>
                <td colSpan={4}>
                    <div className="border-b border-slate-300 w-6/7 mx-auto" />
                </td>
            </tr>

            {returnModal && (
                <tr>
                    <td colSpan={4}>
                        <div className="p-4 my-2 rounded-xl border border-orange-100 bg-orange-50/60">
                            <p className="text-sm font-medium text-slate-700 mb-2">Request a return for this order</p>
                            <textarea
                                rows={3}
                                placeholder="Describe the reason for your return…"
                                value={returnReason}
                                onChange={e => setReturnReason(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 resize-none bg-white"
                            />
                            <div className="flex gap-2 mt-2">
                                <button onClick={() => toast.promise(submitReturn(), { loading: 'Submitting…' })}
                                    className="px-4 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition">
                                    Submit Return
                                </button>
                                <button onClick={() => { setReturnModal(false); setReturnReason('') }}
                                    className="px-3 py-1.5 border border-slate-200 text-sm rounded-lg hover:bg-slate-50 transition">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    )
}

export default OrderItem