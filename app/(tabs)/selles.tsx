import { StyleSheet, Text, View } from 'react-native';

export default function SellesScreen() {
  return (
    <View style={styles.container}>
      <Text>Tab Selles</Text>
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
