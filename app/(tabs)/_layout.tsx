import FontAwesome from '@expo/vector-icons/FontAwesome5';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#0351aaff', headerShown: false,}}>
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
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="poop" color={color} />,
        }}
      />
      <Tabs.Screen
        name="pompages"
        options={{
          title: 'Tire-lait',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="pump-medical" color={color} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="chart-bar" color={color} />,
        }}
      />
    </Tabs>
  );
}
