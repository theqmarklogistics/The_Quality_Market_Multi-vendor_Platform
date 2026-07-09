'use client'
import Counter from "@/components/Counter";
import OrderSummary from "@/components/OrderSummary";
import PageTitle from "@/components/PageTitle";
import { deleteItemFromCart } from "@/lib/features/cart/cartSlice";
import { effectiveUnitPrice, isWholesaleApplied } from "@/lib/priceUtils";
import { ArrowRightIcon, Trash2Icon, AlertTriangleIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";

export default function Cart() {
    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || '$';

    const { cartItems } = useSelector(state => state.cart);
    const storeProducts = useSelector(state => state.product.list);
    const dispatch = useDispatch();

    const [extraProducts, setExtraProducts] = useState([]);
    const [cartArray, setCartArray] = useState([]);
    const [totalPrice, setTotalPrice] = useState(0);

    // Fetch products that aren't in the Redux store (outside the initial 20)
    useEffect(() => {
        const cartIds = Object.keys(cartItems);
        const missing = cartIds.filter(id => !storeProducts.find(p => p.id === id));
        if (missing.length === 0) { setExtraProducts([]); return; }

        Promise.all(missing.map(id => axios.get(`/api/product/${id}`).then(r => r.data.product).catch(() => null)))
            .then(results => setExtraProducts(results.filter(Boolean)));
    }, [cartItems, storeProducts]);

    useEffect(() => {
        const allProducts = [...storeProducts, ...extraProducts];
        let total = 0;
        const arr = [];
        for (const [id, quantity] of Object.entries(cartItems)) {
            const product = allProducts.find(p => p.id === id);
            if (product) {
                arr.push({ ...product, quantity });
                total += effectiveUnitPrice(product, quantity) * quantity;
            }
        }
        setCartArray(arr);
        setTotalPrice(total);
    }, [cartItems, storeProducts, extraProducts]);

    const handleDeleteItemFromCart = (productId) => {
        dispatch(deleteItemFromCart({ productId }));
    };

    const outOfStockItems = cartArray.filter(item => !item.inStock || item.warehouseQuantity < item.quantity);
    const hasStockIssues = outOfStockItems.length > 0;

    return cartArray.length > 0 ? (
        <div className="min-h-screen mx-6 text-slate-800">
            <div className="max-w-7xl mx-auto">
                <PageTitle heading="My Cart" text="items in your cart" linkText="Add more" />

                {hasStockIssues && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 max-w-4xl">
                        <AlertTriangleIcon size={16} className="mt-0.5 shrink-0" />
                        <p>Some items in your cart are out of stock or have insufficient quantity. Remove them before placing your order.</p>
                    </div>
                )}

                <div className="flex items-start justify-between gap-5 max-lg:flex-col">
                    <table className="w-full max-w-4xl text-slate-600 table-auto">
                        <thead>
                            <tr className="max-sm:text-sm">
                                <th className="text-left">Product</th>
                                <th>Quantity</th>
                                <th>Total Price</th>
                                <th className="max-md:hidden">Remove</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cartArray.map((item, index) => {
                                const stockIssue = !item.inStock || item.warehouseQuantity < item.quantity;
                                const unitPrice = effectiveUnitPrice(item, item.quantity);
                                const wholesale = isWholesaleApplied(item, item.quantity);
                                return (
                                    <tr key={index} className={`space-x-2 ${stockIssue ? 'opacity-60' : ''}`}>
                                        <td className="flex gap-3 my-4">
                                            <div className="flex gap-3 items-center justify-center bg-slate-100 size-18 rounded-md">
                                                <Image src={item.images[0]} className="h-14 w-auto" alt="" width={45} height={45} />
                                            </div>
                                            <div>
                                                <p className="max-sm:text-sm">{item.name}</p>
                                                <p className="text-xs text-slate-500">{item.category}</p>
                                                <div className="flex items-center gap-2">
                                                    <p>{currency}{unitPrice.toLocaleString()}</p>
                                                    {wholesale && (
                                                        <>
                                                            <span className="text-xs text-slate-400 line-through">{currency}{item.price.toLocaleString()}</span>
                                                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">Wholesale</span>
                                                        </>
                                                    )}
                                                </div>
                                                {!wholesale && item.wholesalePrice && item.wholesaleMinQty && (
                                                    <p className="text-[11px] text-green-700 mt-0.5">
                                                        Buy {item.wholesaleMinQty}+ for {currency}{item.wholesalePrice.toLocaleString()} each
                                                    </p>
                                                )}
                                                {stockIssue && (
                                                    <p className="text-xs text-red-500 font-medium mt-0.5">
                                                        {!item.inStock ? 'Out of stock' : `Only ${item.warehouseQuantity} available`}
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <Counter productId={item.id} />
                                        </td>
                                        <td className="text-center">{currency}{(unitPrice * item.quantity).toLocaleString()}</td>
                                        <td className="text-center max-md:hidden">
                                            <button onClick={() => handleDeleteItemFromCart(item.id)} className="text-red-500 hover:bg-red-50 p-2.5 rounded-full active:scale-95 transition-all">
                                                <Trash2Icon size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <OrderSummary totalPrice={totalPrice} items={cartArray} hasStockIssues={hasStockIssues} />
                </div>
            </div>
        </div>
    ) : (
        <div className="min-h-[80vh] mx-6 flex items-center justify-center text-slate-400">
            <div className="text-center max-w-md border border-dashed border-slate-200 rounded-2xl px-6 py-12 bg-slate-50/70">
                <h1 className="text-2xl sm:text-4xl font-semibold text-slate-700">Your cart is empty</h1>
                <p className="mt-3 text-sm text-slate-500">Browse products and add items to start checkout.</p>
                <Link href="/shop" className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-900 transition">
                    Continue shopping <ArrowRightIcon size={16} />
                </Link>
            </div>
        </div>
    );
}
