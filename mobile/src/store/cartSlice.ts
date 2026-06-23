// Cart state, ported from the web's lib/features/cart/cartSlice.js. Same shape
// ({ productId: qty } map) so it stays compatible with the backend's /api/cart.
// The web passed getToken into each thunk; here the apiClient injects the Clerk
// token automatically, so the thunks just call the cart API.
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getCart, uploadCart, type CartItems } from '@/api/cart';

const cartUploadDebounce: { timer: ReturnType<typeof setTimeout> | null } = { timer: null };

interface CartState {
  total: number;
  cartItems: CartItems;
}

const initialState: CartState = { total: 0, cartItems: {} };

// Debounced push of the whole cart map to the server (mirrors the web's 1s debounce).
export const persistCart = createAsyncThunk<void, void>(
  'cart/persistCart',
  async (_, thunkAPI) => {
    if (cartUploadDebounce.timer) clearTimeout(cartUploadDebounce.timer);
    cartUploadDebounce.timer = setTimeout(() => {
      const { cartItems } = (thunkAPI.getState() as { cart: CartState }).cart;
      uploadCart(cartItems).catch(() => {
        // Non-fatal: the local cart remains; next change retries the upload.
      });
    }, 1000);
  },
);

export const fetchCart = createAsyncThunk('cart/fetchCart', async () => {
  return getCart();
});

// On login: merge any local (guest) cart into the user's saved server cart.
export const mergeWithServerCart = createAsyncThunk<CartItems, void>(
  'cart/mergeWithServerCart',
  async (_, thunkAPI) => {
    const { cart: serverCart } = await getCart();
    const { cartItems: guestCart } = (thunkAPI.getState() as { cart: CartState }).cart;
    const merged: CartItems = { ...guestCart };
    for (const [productId, qty] of Object.entries(serverCart ?? {})) {
      merged[productId] = (merged[productId] || 0) + qty;
    }
    return merged;
  },
);

const sumQty = (items: CartItems) =>
  Object.values(items).reduce((acc, qty) => acc + (Number(qty) || 0), 0);

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addToCart: (state, action: { payload: { productId: string } }) => {
      const { productId } = action.payload;
      state.cartItems[productId] = (state.cartItems[productId] || 0) + 1;
      state.total += 1;
    },
    removeFromCart: (state, action: { payload: { productId: string } }) => {
      const { productId } = action.payload;
      if (state.cartItems[productId]) {
        state.cartItems[productId] -= 1;
        if (state.cartItems[productId] === 0) delete state.cartItems[productId];
        state.total -= 1;
      }
    },
    deleteItemFromCart: (state, action: { payload: { productId: string } }) => {
      const { productId } = action.payload;
      state.total -= state.cartItems[productId] || 0;
      delete state.cartItems[productId];
    },
    clearCart: (state) => {
      state.cartItems = {};
      state.total = 0;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchCart.fulfilled, (state, action) => {
      const cart = action.payload?.cart ?? {};
      state.cartItems = cart;
      state.total = sumQty(cart);
    });
    builder.addCase(mergeWithServerCart.fulfilled, (state, action) => {
      const merged = action.payload ?? {};
      state.cartItems = merged;
      state.total = sumQty(merged);
    });
  },
});

export const { addToCart, removeFromCart, deleteItemFromCart, clearCart } =
  cartSlice.actions;
export default cartSlice.reducer;
