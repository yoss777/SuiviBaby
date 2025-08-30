import { StyleSheet, Text, View } from 'react-native';

export default function TirelaitScreen() {
  return (
    <View style={styles.container}>
      <Text>Tab Tire-lait</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
