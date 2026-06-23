// Loads the user's server-side cart once they're signed in, so the cart map is
// populated on launch. Rendered inside the Redux Provider in the root layout.
import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useAppDispatch } from './hooks';
import { fetchCart } from './cartSlice';

export function CartSync() {
  const { isSignedIn, isLoaded } = useAuth();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      dispatch(fetchCart());
    }
  }, [isLoaded, isSignedIn, dispatch]);

  return null;
}
