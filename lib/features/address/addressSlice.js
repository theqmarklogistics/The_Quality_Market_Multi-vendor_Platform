import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'

export const fetchAddresses = createAsyncThunk('address/fetchAddresses', async ({getToken}, thunkAPI) => {
    try {
        const token = await getToken();
        const {data} = await axios.get('/api/address', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return data ? data.addresses : [];
    } catch (error) {
        return thunkAPI.rejectWithValue(error.response.data);
    }
})

const addressSlice = createSlice({
    name: 'address',
    initialState: {
        list: [],
    },
    reducers: {
        addAddress: (state, action) => {
            state.list.push(action.payload)
        },
    },

    extraReducers: (builder) => {
        builder.addCase(fetchAddresses.fulfilled, (state, action) => {
            state.list = action.payload
        })
        
    }
})

export const { addAddress } = addressSlice.actions

export default addressSlice.reducer