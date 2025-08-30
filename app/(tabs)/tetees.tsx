import { StyleSheet, Text, View } from 'react-native';

export default function TeteesScreen() {
  return (
    <View style={styles.container}>
      <Text>Tab Tétées</Text>
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
