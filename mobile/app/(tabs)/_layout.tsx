// Tab navigator: Shop, Cart (with live count badge), Orders, Messages, Account.
// Brand styling: green-600 active tint, filled icon when focused, Outfit labels.
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppSelector } from '@/store/hooks';
import { colors, fonts } from '@/theme';

function tabIcon(outline: keyof typeof Ionicons.glyphMap, filled: keyof typeof Ionicons.glyphMap) {
  const TabIcon = ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? filled : outline} size={size} color={color} />
  );
  TabIcon.displayName = `TabIcon(${outline})`;
  return TabIcon;
}

export default function TabsLayout() {
  const cartCount = useAppSelector((s) => s.cart.total);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.borderLight,
        },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        tabBarBadgeStyle: {
          backgroundColor: colors.primary,
          color: colors.onInk,
          fontFamily: fonts.semibold,
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: tabIcon('home-outline', 'home'),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarIcon: tabIcon('cart-outline', 'cart'),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: tabIcon('receipt-outline', 'receipt'),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Messages',
          tabBarIcon: tabIcon('chatbubbles-outline', 'chatbubbles'),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: tabIcon('person-outline', 'person'),
        }}
      />
    </Tabs>
  );
}
