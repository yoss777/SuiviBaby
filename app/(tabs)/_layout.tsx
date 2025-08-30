import FontAwesome from '@expo/vector-icons/FontAwesome5';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: 'blue', headerShown: false, }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tetees"
        options={{
          title: 'Tétées',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="baby" color={color} />,
        }}
      />
      <Tabs.Screen
        name="mictions"
        options={{
          title: 'Mictions',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="water" color={color} />,
        }}
      />
      <Tabs.Screen
        name="selles"
        options={{
          title: 'Selles',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="leaf" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tirelait"
        options={{
          title: 'Tire-lait',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="dot-circle" color={color} />,
        }}
      />
    </Tabs>
  );
}
