'use client'
import Banner from "@/components/Banner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useDispatch, useSelector } from "react-redux";
import { fetchProducts } from "@/lib/features/product/productSlice";
import { Suspense, useEffect } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { fetchCart, uploadCart } from "@/lib/features/cart/cartSlice";
import { fetchAddresses } from "@/lib/features/address/addressSlice";
import { fetchRatings } from "@/lib/features/rating/ratingSlice";

export default function PublicLayout({ children }) {

    const dispatch = useDispatch();
    const {user} = useUser();
    const {getToken} = useAuth();

    const {cartItems} = useSelector(state => state.cart);

    useEffect(() => {
        dispatch(fetchProducts({}));
    }, []);

    useEffect(() => {
        if (user) {
            dispatch(fetchCart({getToken}));
            dispatch(fetchAddresses({getToken}));
            dispatch(fetchRatings({getToken}));
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            dispatch(uploadCart({getToken}));
        }
    }, [cartItems]);

    return (
        <>
            <Banner />
            <Suspense fallback={<div className="h-20" />}>
                <Navbar />
            </Suspense>
            {children}
            <Footer />
        </>
    );
}
