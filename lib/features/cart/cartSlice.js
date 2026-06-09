import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'

const cartUploadDebounce = { timer: null };

export const uploadCart = createAsyncThunk('cart/uploadCart', async ({getToken}, thunkAPI) => {
    try {
        clearTimeout(cartUploadDebounce.timer);
        cartUploadDebounce.timer = setTimeout(async () => {
            const {cartItems} = thunkAPI.getState().cart;
            const token = await getToken();
            await axios.post('/api/cart', cartItems, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }, 1000);
    } catch (error) {
        return thunkAPI.rejectWithValue(error.response?.data);
    }
})



export const fetchCart = createAsyncThunk('cart/fetchCart', async ({getToken}, thunkAPI) => {
    try {
        const token = await getToken();
        const {data} = await axios.get('/api/cart', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return data;
    } catch (error) {
        return thunkAPI.rejectWithValue(error.response?.data ?? {});
    }
})

// Used on login: merges guest cart items with the user's saved server cart
export const mergeWithServerCart = createAsyncThunk('cart/mergeWithServerCart', async ({getToken}, thunkAPI) => {
    try {
        const token = await getToken();
        const {data} = await axios.get('/api/cart', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const serverCart = data?.cart ?? {};
        const {cartItems: guestCart} = thunkAPI.getState().cart;
        const merged = {...guestCart};
        for (const [productId, qty] of Object.entries(serverCart)) {
            merged[productId] = (merged[productId] || 0) + qty;
        }
        return merged;
    } catch (error) {
        return thunkAPI.rejectWithValue(error.response?.data ?? {});
    }
})

const cartSlice = createSlice({
    name: 'cart',
    initialState: {
        total: 0,
        cartItems: {},
    },
    reducers: {
        addToCart: (state, action) => {
            const { productId } = action.payload
            if (state.cartItems[productId]) {
                state.cartItems[productId]++
            } else {
                state.cartItems[productId] = 1
            }
            state.total += 1
        },
        removeFromCart: (state, action) => {
            const { productId } = action.payload
            if (state.cartItems[productId]) {
                state.cartItems[productId]--
                if (state.cartItems[productId] === 0) {
                    delete state.cartItems[productId]
                }
            }
            state.total -= 1
        },
        deleteItemFromCart: (state, action) => {
            const { productId } = action.payload
            state.total -= state.cartItems[productId] ? state.cartItems[productId] : 0
            delete state.cartItems[productId]
        },
        clearCart: (state) => {
            state.cartItems = {}
            state.total = 0
        },
    },
    extraReducers: (builder) => {
        builder.addCase(fetchCart.fulfilled, (state, action) => {
            const cart = action.payload?.cart ?? {}
            state.cartItems = cart
            state.total = Object.values(cart).reduce((acc, qty) => acc + (Number(qty) || 0), 0)
        })
        builder.addCase(mergeWithServerCart.fulfilled, (state, action) => {
            const merged = action.payload ?? {}
            state.cartItems = merged
            state.total = Object.values(merged).reduce((acc, qty) => acc + (Number(qty) || 0), 0)
        })
    }
})

export const { addToCart, removeFromCart, clearCart, deleteItemFromCart } = cartSlice.actions
export { mergeWithServerCart }

export default cartSlice.reducer
