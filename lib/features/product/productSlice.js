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
        builder.addCase(fetchProducts.fulfilled, (state, action) => {
            state.list = action.payload ?? []
        })
        builder.addCase(fetchProducts.rejected, (state, action) => {
            state.list = []
        })
    }
})

export const { setProduct, clearProduct } = productSlice.actions

export default productSlice.reducer