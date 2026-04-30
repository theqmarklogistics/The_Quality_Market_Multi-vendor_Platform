'use client'
import Image from "next/image";
import { DotIcon, MessageCircleIcon } from "lucide-react";
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

                <td className="text-center max-md:hidden">{currency}{order.total}</td>

                <td className="text-left max-md:hidden">
                    <p>{order.address.name}, {order.address.street},</p>
                    <p>{order.address.city}, {order.address.state}, {order.address.zip}, {order.address.country},</p>
                    <p>{order.address.phone}</p>
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
                    <button onClick={() => toast.promise(startConversation('ADMIN'), { loading: 'Opening admin chat...' })} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                        <MessageCircleIcon size={14} /> Chat Admin
                    </button>
                    <button onClick={() => toast.promise(startConversation('STORE'), { loading: 'Opening store chat...' })} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 ml-2">
                        <MessageCircleIcon size={14} /> Chat Store
                    </button>
                </td>
            </tr>
            {/* Mobile */}
            <tr className="md:hidden">
                <td colSpan={5}>
                    <p>{order.address.name}, {order.address.street}</p>
                    <p>{order.address.city}, {order.address.state}, {order.address.zip}, {order.address.country}</p>
                    <p>{order.address.phone}</p>
                    <br />
                    <div className="flex items-center">
                        <span className='text-center mx-auto px-6 py-1.5 rounded bg-green-100 text-green-700' >
                            {order.status.replace(/_/g, ' ').toLowerCase()}
                        </span>
                    </div>
                    <div className="flex gap-4 justify-center mt-3">
                        <button onClick={() => toast.promise(startConversation('ADMIN'), { loading: 'Opening admin chat...' })} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                            <MessageCircleIcon size={14} /> Admin
                        </button>
                        <button onClick={() => toast.promise(startConversation('STORE'), { loading: 'Opening store chat...' })} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                            <MessageCircleIcon size={14} /> Store
                        </button>
                    </div>
                </td>
            </tr>
            <tr>
                <td colSpan={4}>
                    <div className="border-b border-slate-300 w-6/7 mx-auto" />
                </td>
            </tr>
        </>
    )
}

export default OrderItem