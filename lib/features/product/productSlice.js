import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'


export const fetchProducts = createAsyncThunk('product/fetchProducts', async (_, thunkAPI) => {
    try {
        const { data } = await axios.get('/api/product');
        return data.products ?? [];
    } catch (error) {
        return thunkAPI.rejectWithValue(error.response?.data);
    }
})

const productSlice = createSlice({
    name: 'product',
    initialState: {
        list: [],
        loading: false,
    },
    reducers: {
        setProduct: (state, action) => {
            state.list = action.payload
        },
        clearProduct: (state) => {
            state.list = []
        }
    },
    extraReducers: (builder) => {
        builder.addCase(fetchProducts.pending, (state) => {
            state.loading = true
        })
        builder.addCase(fetchProducts.fulfilled, (state, action) => {
            state.list = action.payload ?? []
            state.loading = false
        })
        builder.addCase(fetchProducts.rejected, (state) => {
            state.list = []
            state.loading = false
        })
    }
})

export const { setProduct, clearProduct } = productSlice.actions

export default productSlice.reducer